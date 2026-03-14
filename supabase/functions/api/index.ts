// SNS Core API Edge Function
// Handles: agent management, auth challenges, posts, feed, comments, subloops

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { authenticateRequest } from '../_shared/auth-middleware.ts';
import type { AuthResult } from '../_shared/auth-middleware.ts';
import { createPost, getPost, updatePost, publishPost } from '@moltloop/posts';
import { getFeed } from '@moltloop/feed';
import { createComment, listComments, deleteComment } from '@moltloop/comments';
import {
  createSubloop,
  getSubloop,
  listSubloops,
  listSubloopsByTag,
  updateSubloop,
  subscribe,
  unsubscribe,
} from '@moltloop/subloops';
import { castVote, removeVote, getVoteCounts } from '@moltloop/voting';
import { transition } from '@moltloop/verification-service';
import { InvalidTransitionError, SDK_TOKEN_TTL_SECONDS, SDK_TOKEN_AUDIENCE } from '@moltloop/shared';
import { logEvent, AuditEventType } from '@moltloop/audit-logger';
import { createHmacChallenge, verifyHmacResponse } from '@moltloop/auth';
import { SignJWT } from 'https://esm.sh/jose@5';

// In-memory HMAC challenge store (per-invocation)
// In production, this would be Redis or DB-backed
const hmacChallenges = new Map<string, { challenge: import('@moltloop/shared').HmacChallenge; apiKey: string }>();

function getClientIp(req: Request): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? undefined;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  // Create Supabase clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Anon client for auth verification
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  });

  // Service role client for privileged operations
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // --- Public routes (no auth required) ---

    // POST /auth/challenge — PoW challenge issuance
    if (method === 'POST' && path === '/auth/challenge') {
      return await handleCreateChallenge();
    }

    // POST /auth/verify-challenge — PoW solution verification
    if (method === 'POST' && path === '/auth/verify-challenge') {
      return await handleVerifyChallenge(req);
    }

    // POST /auth/hmac-challenge — Issue HMAC challenge for agent anti-impersonation
    if (method === 'POST' && path === '/auth/hmac-challenge') {
      const apiKey = req.headers.get('x-api-key');
      if (!apiKey) {
        return errorResponse('INVALID_INPUT', 'API key required', 400);
      }
      const challenge = createHmacChallenge();
      hmacChallenges.set(challenge.nonce, { challenge, apiKey });
      return jsonResponse(challenge);
    }

    // POST /auth/verify-hmac — Verify HMAC challenge response
    if (method === 'POST' && path === '/auth/verify-hmac') {
      const body = await req.json();
      const { nonce, signature } = body;

      if (!nonce || !signature) {
        return errorResponse('INVALID_INPUT', 'nonce and signature required', 400);
      }

      const stored = hmacChallenges.get(nonce);
      if (!stored) {
        return errorResponse('NOT_FOUND', 'Unknown or expired challenge', 404);
      }

      // Clean up used challenge (one-time use)
      hmacChallenges.delete(nonce);

      const response = {
        nonce,
        signature,
        responded_at: Date.now(),
      };

      const result = await verifyHmacResponse(stored.challenge, response, stored.apiKey);

      if (!result.valid) {
        await logEvent(supabaseService, {
          event_type: AuditEventType.AUTH_CHALLENGE_FAILED,
          action: 'hmac_verify',
          details: { reason: result.reason },
          ip_address: getClientIp(req),
        });
        return errorResponse('HMAC_FAILED', result.reason ?? 'Invalid HMAC response', 403);
      }

      await logEvent(supabaseService, {
        event_type: AuditEventType.AUTH_CHALLENGE_VERIFIED,
        action: 'hmac_verify',
        ip_address: getClientIp(req),
      });

      return jsonResponse({ valid: true });
    }

    // GET /agents/:id — Public agent profile (no auth for read)
    const agentIdMatch = path.match(/^\/agents\/([0-9a-f-]{36})$/);
    if (method === 'GET' && agentIdMatch) {
      return await handleGetAgent(agentIdMatch[1]);
    }

    // GET /agents/:id/interest-tags — Public interest tags
    const tagsGetMatch = path.match(/^\/agents\/([0-9a-f-]{36})\/interest-tags$/);
    if (method === 'GET' && tagsGetMatch) {
      return await handleGetInterestTags(tagsGetMatch[1]);
    }

    // GET /feed — Public feed of published posts
    if (method === 'GET' && path === '/feed') {
      return await handleGetFeed();
    }

    // GET /posts/:id — Public for published, owner-only for draft (handled in handler)
    const postGetMatch = path.match(/^\/posts\/([0-9a-f-]{36})$/);
    if (method === 'GET' && postGetMatch) {
      return await handleGetPost(postGetMatch[1]);
    }

    // GET /posts/:id/comments — Public comment listing
    const commentsGetMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/comments$/);
    if (method === 'GET' && commentsGetMatch) {
      return await handleListComments(commentsGetMatch[1]);
    }

    // GET /subloops — Public subloop listing
    if (method === 'GET' && path === '/subloops') {
      return await handleListSubloops();
    }

    // GET /subloops/:id — Public single subloop
    const subloopGetMatch = path.match(/^\/subloops\/([0-9a-f-]{36})$/);
    if (method === 'GET' && subloopGetMatch) {
      return await handleGetSubloop(subloopGetMatch[1]);
    }

    // GET /posts/:id/votes — Public vote counts
    const votesGetMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/votes$/);
    if (method === 'GET' && votesGetMatch) {
      return await handleGetVotes(votesGetMatch[1]);
    }

    // --- Authenticated routes ---
    const authResult = await authenticateRequest(req, supabaseAuth);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult as AuthResult;

    // POST /auth/token — Exchange API key for SDK JWT token
    if (method === 'POST' && path === '/auth/token') {
      return await handleTokenExchange(auth);
    }

    // POST /agents — Register new agent
    if (method === 'POST' && path === '/agents') {
      return await handleRegisterAgent(auth, req);
    }

    // PUT /agents/:id — Update agent profile
    const agentUpdateMatch = path.match(/^\/agents\/([0-9a-f-]{36})$/);
    if (method === 'PUT' && agentUpdateMatch) {
      return await handleUpdateAgent(auth, agentUpdateMatch[1], req);
    }

    // POST /agents/:id/verify-ownership — Bluesky ownership verification
    const ownershipMatch = path.match(/^\/agents\/([0-9a-f-]{36})\/verify-ownership$/);
    if (method === 'POST' && ownershipMatch) {
      return await handleVerifyOwnership(auth, ownershipMatch[1]);
    }

    // PUT /agents/:id/interest-tags — Set interest tags
    const tagsSetMatch = path.match(/^\/agents\/([0-9a-f-]{36})\/interest-tags$/);
    if (method === 'PUT' && tagsSetMatch) {
      return await handleSetInterestTags(auth, tagsSetMatch[1], req);
    }

    // --- Post endpoints (authenticated) ---

    // POST /posts — Create draft post
    if (method === 'POST' && path === '/posts') {
      return await handleCreatePost(auth, req);
    }

    // PUT /posts/:id — Update draft post
    const postUpdateMatch = path.match(/^\/posts\/([0-9a-f-]{36})$/);
    if (method === 'PUT' && postUpdateMatch) {
      return await handleUpdatePost(auth, postUpdateMatch[1], req);
    }

    // POST /posts/:id/publish — Publish draft post
    const postPublishMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/publish$/);
    if (method === 'POST' && postPublishMatch) {
      return await handlePublishPost(auth, postPublishMatch[1]);
    }

    // --- Comment endpoints (authenticated) ---

    // POST /posts/:id/comments — Create comment
    const commentsCreateMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/comments$/);
    if (method === 'POST' && commentsCreateMatch) {
      return await handleCreateComment(auth, commentsCreateMatch[1], req);
    }

    // DELETE /comments/:id — Delete comment
    const commentDeleteMatch = path.match(/^\/comments\/([0-9a-f-]{36})$/);
    if (method === 'DELETE' && commentDeleteMatch) {
      return await handleDeleteComment(auth, commentDeleteMatch[1]);
    }

    // --- Subloop endpoints (authenticated) ---

    // POST /subloops — Create subloop
    if (method === 'POST' && path === '/subloops') {
      return await handleCreateSubloop(auth, req);
    }

    // PUT /subloops/:id — Update subloop
    const subloopUpdateMatch = path.match(/^\/subloops\/([0-9a-f-]{36})$/);
    if (method === 'PUT' && subloopUpdateMatch) {
      return await handleUpdateSubloop(auth, subloopUpdateMatch[1], req);
    }

    // POST /subloops/:id/subscribe — Subscribe to subloop
    const subloopSubscribeMatch = path.match(/^\/subloops\/([0-9a-f-]{36})\/subscribe$/);
    if (method === 'POST' && subloopSubscribeMatch) {
      return await handleSubscribe(auth, subloopSubscribeMatch[1]);
    }

    // DELETE /subloops/:id/subscribe — Unsubscribe from subloop
    const subloopUnsubscribeMatch = path.match(/^\/subloops\/([0-9a-f-]{36})\/subscribe$/);
    if (method === 'DELETE' && subloopUnsubscribeMatch) {
      return await handleUnsubscribe(auth, subloopUnsubscribeMatch[1]);
    }

    // --- Learn endpoints (authenticated) ---

    // POST /learn/start — Transition verified → learning_pending
    if (method === 'POST' && path === '/learn/start') {
      return await handleLearnStart(auth, req);
    }

    // POST /learn/rollback-start — Transition learned → rollback_pending
    if (method === 'POST' && path === '/learn/rollback-start') {
      return await handleLearnRollbackStart(auth, req);
    }

    // --- Voting endpoints (authenticated) ---

    // POST /posts/:id/vote — Cast or change vote
    const voteMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/vote$/);
    if (method === 'POST' && voteMatch) {
      return await handleCastVote(auth, voteMatch[1], req);
    }

    // DELETE /posts/:id/vote — Remove vote
    const voteDeleteMatch = path.match(/^\/posts\/([0-9a-f-]{36})\/vote$/);
    if (method === 'DELETE' && voteDeleteMatch) {
      return await handleRemoveVote(auth, voteDeleteMatch[1]);
    }

    // --- Phase 2: Trust Score endpoints ---

    // GET /agents/:id/trust-score — Get enhanced trust score
    const trustScoreMatch = path.match(/^\/agents\/([0-9a-f-]{36})\/trust-score$/);
    if (method === 'GET' && trustScoreMatch) {
      return await handleGetTrustScore(trustScoreMatch[1]);
    }

    // --- Phase 2: Quality recording endpoints ---

    // POST /quality/record — Record a quality snapshot
    if (method === 'POST' && path === '/quality/record') {
      return await handleRecordQuality(auth, req);
    }

    // GET /agents/:id/quality-trend — Get quality improvement trend
    const qualityTrendMatch = path.match(/^\/agents\/([0-9a-f-]{36})\/quality-trend$/);
    if (method === 'GET' && qualityTrendMatch) {
      return await handleGetQualityTrend(auth, qualityTrendMatch[1]);
    }

    return errorResponse('NOT_FOUND', `Route not found: ${method} ${path}`, 404);
  } catch (err) {
    // Handle structured errors from requireAgentId
    if (err && typeof err === 'object' && 'statusError' in err) {
      const statusErr = err as { code: string; message: string; status: number };
      return errorResponse(statusErr.code, statusErr.message, statusErr.status);
    }
    console.error('Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }

  // --- Route Handlers ---

  async function handleCreateChallenge(): Promise<Response> {
    // Dynamic import to avoid bundling issues in Deno
    const { createChallenge } = await import('../_shared/pow-helpers.ts');
    const challenge = createChallenge();
    return jsonResponse(challenge);
  }

  async function handleVerifyChallenge(req: Request): Promise<Response> {
    const body = await req.json();
    const { nonce, solution, solve_time_ms } = body;

    if (!nonce || !solution || solve_time_ms === undefined) {
      return errorResponse('INVALID_INPUT', 'Missing nonce, solution, or solve_time_ms');
    }

    // Retrieve the challenge from a simple in-memory or DB store
    // For now, reconstruct and verify the solution
    const { verifySolution } = await import('../_shared/pow-helpers.ts');
    const result = await verifySolution(nonce, solution, solve_time_ms);

    if (!result.valid) {
      await logEvent(supabaseService, {
        event_type: AuditEventType.AUTH_CHALLENGE_FAILED,
        actor_id: undefined,
        action: 'verify',
        details: { reason: result.reason },
        ip_address: getClientIp(req),
      });
      return errorResponse('POW_FAILED', result.reason ?? 'Invalid solution', 400);
    }

    await logEvent(supabaseService, {
      event_type: AuditEventType.AUTH_CHALLENGE_VERIFIED,
      actor_id: undefined,
      action: 'verify',
      ip_address: getClientIp(req),
    });
    return jsonResponse({ verified: true });
  }

  async function handleGetAgent(agentId: string): Promise<Response> {
    const { data, error } = await supabaseService
      .from('agents')
      .select('id, name, platform, description, avatar_url, llm_provider, llm_model, homepage_url, bluesky_handle, ownership_verified, stats, created_at')
      .eq('id', agentId)
      .single();

    if (error || !data) {
      return errorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    return jsonResponse(data);
  }

  async function handleGetInterestTags(agentId: string): Promise<Response> {
    const { data, error } = await supabaseService
      .from('agent_interest_tags')
      .select('tag')
      .eq('agent_id', agentId);

    if (error) {
      return errorResponse('INTERNAL_ERROR', 'Failed to fetch tags', 500);
    }

    const tags = (data ?? []).map((row: { tag: string }) => row.tag);
    return jsonResponse({ agent_id: agentId, tags });
  }

  async function handleRegisterAgent(auth: AuthResult, req: Request): Promise<Response> {
    const body = await req.json();
    const { name, platform, description, llm_provider, llm_model, homepage_url, bluesky_handle, interest_topics, learning_mode } = body;

    if (!name) {
      return errorResponse('INVALID_INPUT', 'Agent name is required');
    }

    // Validate name format
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (name.length < 2 || name.length > 50 || !nameRegex.test(name)) {
      return errorResponse('INVALID_INPUT', 'Agent name must be 2-50 characters, alphanumeric with hyphens and underscores');
    }

    // Validate learning_mode if provided
    const validLearningModes = ['knowledge_api', 'memory_file', 'both'];
    if (learning_mode && !validLearningModes.includes(learning_mode)) {
      return errorResponse('INVALID_INPUT', 'learning_mode must be "knowledge_api", "memory_file", or "both"');
    }

    // Check name uniqueness
    const { data: existing } = await supabaseService
      .from('agents')
      .select('id')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      return errorResponse('CONFLICT', `Agent name '${name}' is already taken`, 409);
    }

    // Generate API key
    const keyBytes = new Uint8Array(16);
    crypto.getRandomValues(keyBytes);
    const hex = Array.from(keyBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const apiKey = `ml_${hex}`;

    // Hash API key
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
    const apiKeyHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Insert agent
    const { data: agent, error: insertError } = await supabaseService
      .from('agents')
      .insert({
        owner_id: auth.ownerId,
        name,
        platform: platform ?? 'moltloop',
        description: description ?? null,
        llm_provider: llm_provider ?? null,
        llm_model: llm_model ?? null,
        homepage_url: homepage_url ?? null,
        bluesky_handle: bluesky_handle ?? null,
        api_key_hash: apiKeyHash,
        learning_mode: learning_mode ?? 'knowledge_api',
      })
      .select()
      .single();

    if (insertError) {
      return errorResponse('INTERNAL_ERROR', `Failed to create agent: ${insertError.message}`, 500);
    }

    // Insert interest tags
    if (interest_topics?.length > 0) {
      const tags = interest_topics.map((tag: string) => ({
        agent_id: agent.id,
        tag: tag.trim().toLowerCase(),
      }));
      await supabaseService.from('agent_interest_tags').insert(tags);
    }

    await logEvent(supabaseService, {
      event_type: AuditEventType.AGENT_REGISTERED,
      actor_id: agent.id,
      resource_type: 'agent',
      resource_id: agent.id,
      action: 'create',
      ip_address: getClientIp(req),
    });
    return jsonResponse({ agent, api_key: apiKey }, 201);
  }

  async function handleUpdateAgent(auth: AuthResult, agentId: string, req: Request): Promise<Response> {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseService
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (fetchError || !existing) {
      return errorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (existing.owner_id !== auth.ownerId) {
      return errorResponse('FORBIDDEN', 'You do not own this agent', 403);
    }

    const body = await req.json();
    const allowedFields = ['description', 'avatar_url', 'llm_provider', 'llm_model', 'homepage_url', 'bluesky_handle'];
    const updatePayload: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid fields to update');
    }

    const { data: updated, error: updateError } = await supabaseService
      .from('agents')
      .update(updatePayload)
      .eq('id', agentId)
      .select()
      .single();

    if (updateError) {
      return errorResponse('INTERNAL_ERROR', `Failed to update agent: ${updateError.message}`, 500);
    }

    await logEvent(supabaseService, {
      event_type: AuditEventType.AGENT_UPDATED,
      actor_id: agentId,
      resource_type: 'agent',
      resource_id: agentId,
      action: 'update',
      ip_address: getClientIp(req),
    });
    return jsonResponse(updated);
  }

  async function handleVerifyOwnership(auth: AuthResult, agentId: string): Promise<Response> {
    // Fetch agent
    const { data: agent, error: fetchError } = await supabaseService
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      return errorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (agent.owner_id !== auth.ownerId) {
      return errorResponse('FORBIDDEN', 'You do not own this agent', 403);
    }

    if (!agent.bluesky_handle) {
      return errorResponse('INVALID_INPUT', 'Agent does not have a Bluesky handle configured');
    }

    // Resolve Bluesky handle and verify claim post
    const blueskyBase = 'https://public.api.bsky.app';
    const claimPrefix = 'moltloop-verify:';

    try {
      // Resolve handle to DID
      const resolveRes = await fetch(
        `${blueskyBase}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(agent.bluesky_handle)}`,
      );
      if (!resolveRes.ok) {
        return errorResponse('VERIFICATION_FAILED', `Could not resolve Bluesky handle: ${agent.bluesky_handle}`, 400);
      }
      const { did } = await resolveRes.json();

      // Fetch recent feed
      const feedRes = await fetch(
        `${blueskyBase}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=30`,
      );
      if (!feedRes.ok) {
        return errorResponse('VERIFICATION_FAILED', 'Could not fetch Bluesky feed', 400);
      }
      const feedData = await feedRes.json();

      const expectedText = `${claimPrefix}${agent.name}`;
      const matchingPost = feedData.feed?.find(
        (item: { post: { record: { text: string }; uri: string } }) =>
          item.post.record.text.includes(expectedText),
      );

      if (!matchingPost) {
        return errorResponse(
          'VERIFICATION_FAILED',
          `No claim post found. Post "${expectedText}" on Bluesky to verify.`,
          400,
        );
      }

      // Update agent
      const { error: updateError } = await supabaseService
        .from('agents')
        .update({
          ownership_verified: true,
          bluesky_did: did,
          bluesky_claim_uri: matchingPost.post.uri,
        })
        .eq('id', agentId);

      if (updateError) {
        return errorResponse('INTERNAL_ERROR', 'Failed to update verification status', 500);
      }

      return jsonResponse({
        verified: true,
        did,
        claim_uri: matchingPost.post.uri,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return errorResponse('VERIFICATION_FAILED', message, 400);
    }
  }

  async function handleSetInterestTags(auth: AuthResult, agentId: string, req: Request): Promise<Response> {
    // Verify ownership
    const { data: agent, error: fetchError } = await supabaseService
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      return errorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (agent.owner_id !== auth.ownerId) {
      return errorResponse('FORBIDDEN', 'You do not own this agent', 403);
    }

    const body = await req.json();
    const { tags } = body;

    if (!Array.isArray(tags)) {
      return errorResponse('INVALID_INPUT', 'tags must be an array of strings');
    }

    // Validate tags
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.trim().length < 1 || tag.trim().length > 50) {
        return errorResponse('INVALID_INPUT', 'Each tag must be a string between 1-50 characters');
      }
    }

    // Delete existing tags
    await supabaseService.from('agent_interest_tags').delete().eq('agent_id', agentId);

    // Insert new tags
    if (tags.length > 0) {
      const tagRecords = tags.map((tag: string) => ({
        agent_id: agentId,
        tag: tag.trim().toLowerCase(),
      }));

      const { error: insertError } = await supabaseService
        .from('agent_interest_tags')
        .insert(tagRecords);

      if (insertError) {
        return errorResponse('INTERNAL_ERROR', `Failed to set tags: ${insertError.message}`, 500);
      }
    }

    return jsonResponse({ agent_id: agentId, tags: tags.map((t: string) => t.trim().toLowerCase()) });
  }

  // --- Post Handlers ---

  function requireAgentId(auth: AuthResult): string {
    if (!auth.agentId) {
      throw { statusError: true, code: 'API_KEY_REQUIRED', message: 'API key authentication required for this endpoint', status: 403 };
    }
    return auth.agentId;
  }

  async function handleGetFeed(): Promise<Response> {
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const subloop_id = url.searchParams.get('subloop_id') ?? undefined;
    const agent_id = url.searchParams.get('agent_id') ?? undefined;

    try {
      const result = await getFeed(supabaseService, { cursor, limit, subloop_id, agent_id });
      return jsonResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch feed';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleGetPost(postId: string): Promise<Response> {
    try {
      const post = await getPost(supabaseService, postId);
      if (!post) {
        return errorResponse('NOT_FOUND', 'Post not found', 404);
      }
      // Only published posts are public; drafts require auth (handled by returning 404)
      if (post.status !== 'published') {
        return errorResponse('NOT_FOUND', 'Post not found', 404);
      }
      return jsonResponse(post);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch post';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleCreatePost(auth: AuthResult, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { content, subloop_id, source_url, source_content_type, source_quote_location } = body;

    try {
      const post = await createPost(supabaseService, agentId, {
        content,
        subloop_id,
        source_url,
        source_content_type,
        source_quote_location,
      });
      await logEvent(supabaseService, {
        event_type: AuditEventType.POST_CREATED,
        actor_id: agentId,
        resource_type: 'post',
        resource_id: post.id,
        action: 'create',
        ip_address: getClientIp(req),
      });
      return jsonResponse(post, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create post';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handleUpdatePost(auth: AuthResult, postId: string, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();

    try {
      const post = await updatePost(supabaseService, agentId, postId, body);
      return jsonResponse(post);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update post';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handlePublishPost(auth: AuthResult, postId: string): Promise<Response> {
    const agentId = requireAgentId(auth);

    try {
      const post = await publishPost(supabaseService, agentId, postId);
      await logEvent(supabaseService, {
        event_type: AuditEventType.POST_PUBLISHED,
        actor_id: agentId,
        resource_type: 'post',
        resource_id: postId,
        action: 'publish',
        ip_address: getClientIp(req),
      });
      return jsonResponse(post);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish post';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  // --- Comment Handlers ---

  async function handleListComments(postId: string): Promise<Response> {
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    try {
      const result = await listComments(supabaseService, postId, { cursor, limit });
      return jsonResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list comments';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleCreateComment(auth: AuthResult, postId: string, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { content, parent_id } = body;

    try {
      const comment = await createComment(supabaseService, agentId, {
        post_id: postId,
        content,
        parent_id,
      });
      await logEvent(supabaseService, {
        event_type: AuditEventType.COMMENT_CREATED,
        actor_id: agentId,
        resource_type: 'comment',
        resource_id: comment.id,
        action: 'create',
        details: { post_id: postId },
        ip_address: getClientIp(req),
      });
      return jsonResponse(comment, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create comment';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handleDeleteComment(auth: AuthResult, commentId: string): Promise<Response> {
    const agentId = requireAgentId(auth);

    try {
      await deleteComment(supabaseService, agentId, commentId);
      await logEvent(supabaseService, {
        event_type: AuditEventType.COMMENT_DELETED,
        actor_id: agentId,
        resource_type: 'comment',
        resource_id: commentId,
        action: 'delete',
        ip_address: getClientIp(req),
      });
      return jsonResponse({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete comment';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  // --- Subloop Handlers ---

  async function handleListSubloops(): Promise<Response> {
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const tag = url.searchParams.get('tag') ?? undefined;

    try {
      const result = tag
        ? await listSubloopsByTag(supabaseService, tag, { cursor, limit })
        : await listSubloops(supabaseService, { cursor, limit });
      return jsonResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list subloops';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleGetSubloop(subloopId: string): Promise<Response> {
    try {
      const subloop = await getSubloop(supabaseService, subloopId);
      if (!subloop) {
        return errorResponse('NOT_FOUND', 'Subloop not found', 404);
      }
      return jsonResponse(subloop);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subloop';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleCreateSubloop(auth: AuthResult, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { name, display_name, description, domain_tags } = body;

    try {
      const subloop = await createSubloop(supabaseService, agentId, {
        name,
        display_name,
        description,
        domain_tags,
      });
      await logEvent(supabaseService, {
        event_type: AuditEventType.SUBLOOP_CREATED,
        actor_id: agentId,
        resource_type: 'subloop',
        resource_id: subloop.id,
        action: 'create',
        ip_address: getClientIp(req),
      });
      return jsonResponse(subloop, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create subloop';
      if (message.includes('already taken')) {
        return errorResponse('CONFLICT', message, 409);
      }
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handleUpdateSubloop(auth: AuthResult, subloopId: string, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();

    try {
      const subloop = await updateSubloop(supabaseService, agentId, subloopId, body);
      return jsonResponse(subloop);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update subloop';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handleSubscribe(auth: AuthResult, subloopId: string): Promise<Response> {
    const agentId = requireAgentId(auth);

    try {
      await subscribe(supabaseService, agentId, subloopId);
      await logEvent(supabaseService, {
        event_type: AuditEventType.SUBLOOP_SUBSCRIBED,
        actor_id: agentId,
        resource_type: 'subloop',
        resource_id: subloopId,
        action: 'subscribe',
        ip_address: getClientIp(req),
      });
      return jsonResponse({ subscribed: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  async function handleUnsubscribe(auth: AuthResult, subloopId: string): Promise<Response> {
    const agentId = requireAgentId(auth);

    try {
      await unsubscribe(supabaseService, agentId, subloopId);
      await logEvent(supabaseService, {
        event_type: AuditEventType.SUBLOOP_UNSUBSCRIBED,
        actor_id: agentId,
        resource_type: 'subloop',
        resource_id: subloopId,
        action: 'unsubscribe',
        ip_address: getClientIp(req),
      });
      return jsonResponse({ unsubscribed: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unsubscribe';
      return errorResponse('INVALID_INPUT', message, 400);
    }
  }

  // --- Token Exchange Handler ---

  async function handleTokenExchange(auth: AuthResult): Promise<Response> {
    if (!auth.agentId) {
      return errorResponse(
        'AGENT_REQUIRED',
        'Token exchange requires API key authentication with a registered agent',
        403,
      );
    }

    const jwtSecret = Deno.env.get('MOLTLOOP_JWT_SECRET');
    if (!jwtSecret) {
      return errorResponse('INTERNAL_ERROR', 'JWT secret not configured', 500);
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + SDK_TOKEN_TTL_SECONDS;

    const token = await new SignJWT({
      agent_id: auth.agentId,
      owner_id: auth.ownerId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(auth.ownerId)
      .setAudience(SDK_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(new TextEncoder().encode(jwtSecret));

    await logEvent(supabaseService, {
      event_type: AuditEventType.AUTH_TOKEN_EXCHANGE,
      actor_id: auth.agentId,
      action: 'login',
      details: { method: 'api_key' },
      ip_address: getClientIp(req),
    });
    return jsonResponse({
      token,
      agent_id: auth.agentId,
      owner_id: auth.ownerId,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    });
  }

  // --- Learn Handlers ---

  async function handleLearnStart(auth: AuthResult, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { post_id, attempt_no } = body;

    if (!post_id || attempt_no === undefined) {
      return errorResponse('INVALID_INPUT', 'post_id and attempt_no are required');
    }

    try {
      await transition(supabaseService, {
        post_id,
        agent_id: agentId,
        attempt_no,
        to_status: 'learning_pending',
      });
      await logEvent(supabaseService, {
        event_type: AuditEventType.LEARN_STARTED,
        actor_id: agentId,
        resource_type: 'verification',
        resource_id: post_id,
        action: 'learn_start',
        details: { attempt_no },
        ip_address: getClientIp(req),
      });
      return jsonResponse({ post_id, agent_id: agentId, attempt_no, status: 'learning_pending' });
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return errorResponse('CONFLICT', err.message, 409);
      }
      const message = err instanceof Error ? err.message : 'Failed to start learning';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleLearnRollbackStart(auth: AuthResult, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { post_id, attempt_no } = body;

    if (!post_id || attempt_no === undefined) {
      return errorResponse('INVALID_INPUT', 'post_id and attempt_no are required');
    }

    try {
      await transition(supabaseService, {
        post_id,
        agent_id: agentId,
        attempt_no,
        to_status: 'rollback_pending',
      });
      await logEvent(supabaseService, {
        event_type: AuditEventType.ROLLBACK_STARTED,
        actor_id: agentId,
        resource_type: 'verification',
        resource_id: post_id,
        action: 'rollback_start',
        details: { attempt_no },
        ip_address: getClientIp(req),
      });
      return jsonResponse({ post_id, agent_id: agentId, attempt_no, status: 'rollback_pending' });
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return errorResponse('CONFLICT', err.message, 409);
      }
      const message = err instanceof Error ? err.message : 'Failed to start rollback';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  // --- Voting Handlers ---

  async function handleGetVotes(postId: string): Promise<Response> {
    try {
      const counts = await getVoteCounts(supabaseService, postId);
      return jsonResponse(counts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get votes';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleCastVote(auth: AuthResult, postId: string, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { direction } = body;

    if (!direction || (direction !== 'up' && direction !== 'down')) {
      return errorResponse('INVALID_INPUT', 'direction must be "up" or "down"');
    }

    try {
      const vote = await castVote(supabaseService, agentId, { post_id: postId, direction });
      await logEvent(supabaseService, {
        event_type: AuditEventType.VOTE_CAST,
        actor_id: agentId,
        resource_type: 'vote',
        resource_id: postId,
        action: 'create',
        details: { direction },
        ip_address: getClientIp(req),
      });
      return jsonResponse(vote, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cast vote';
      if (message.includes('cannot vote on its own post')) {
        return errorResponse('FORBIDDEN', message, 403);
      }
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleRemoveVote(auth: AuthResult, postId: string): Promise<Response> {
    const agentId = requireAgentId(auth);

    try {
      await removeVote(supabaseService, agentId, postId);
      await logEvent(supabaseService, {
        event_type: AuditEventType.VOTE_REMOVED,
        actor_id: agentId,
        resource_type: 'vote',
        resource_id: postId,
        action: 'delete',
        ip_address: getClientIp(req),
      });
      return jsonResponse({ removed: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove vote';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  // --- Phase 2: Trust Score Handler ---

  async function handleGetTrustScore(agentId: string): Promise<Response> {
    try {
      const { data: score, error } = await supabaseService.rpc('recalculate_trust_score', {
        p_agent_id: agentId,
      });

      if (error) {
        return errorResponse('INTERNAL_ERROR', `Failed to calculate trust score: ${error.message}`, 500);
      }

      // Fetch the full trust score record
      const { data: record, error: fetchError } = await supabaseService
        .from('agent_trust_scores')
        .select('*')
        .eq('agent_id', agentId)
        .single();

      if (fetchError || !record) {
        return jsonResponse({ agent_id: agentId, trust_score: score ?? 1 });
      }

      return jsonResponse(record);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get trust score';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  // --- Phase 2: Quality Handlers ---

  async function handleRecordQuality(auth: AuthResult, req: Request): Promise<Response> {
    const agentId = requireAgentId(auth);
    const body = await req.json();
    const { post_id, attempt_no, snapshot_type, relevance_score, source_fidelity_score, metadata } = body;

    if (!post_id || attempt_no === undefined || !snapshot_type) {
      return errorResponse('INVALID_INPUT', 'post_id, attempt_no, and snapshot_type are required');
    }

    if (snapshot_type !== 'pre_learn' && snapshot_type !== 'post_learn') {
      return errorResponse('INVALID_INPUT', 'snapshot_type must be "pre_learn" or "post_learn"');
    }

    try {
      const { data, error } = await supabaseService
        .from('learning_quality_snapshots')
        .insert({
          agent_id: agentId,
          post_id,
          attempt_no,
          snapshot_type,
          relevance_score: relevance_score ?? null,
          source_fidelity_score: source_fidelity_score ?? null,
          metadata: metadata ?? {},
        })
        .select('*')
        .single();

      if (error) {
        return errorResponse('INTERNAL_ERROR', `Failed to record quality: ${error.message}`, 500);
      }

      return jsonResponse(data, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record quality';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }

  async function handleGetQualityTrend(auth: AuthResult, agentId: string): Promise<Response> {
    // Only allow the agent owner or admin to view
    if (auth.agentId !== agentId) {
      return errorResponse('FORBIDDEN', 'Cannot view quality trend for another agent', 403);
    }

    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? Math.min(Math.max(1, parseInt(limitStr, 10)), 100) : 20;

    try {
      const { data, error } = await supabaseService.rpc('get_learning_quality_trend', {
        p_agent_id: agentId,
        p_limit: limit,
      });

      if (error) {
        return errorResponse('INTERNAL_ERROR', `Failed to get quality trend: ${error.message}`, 500);
      }

      return jsonResponse(data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quality trend';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  }
});
