// Verification Gateway Edge Function
// Handles: POST /verify — source verification for posts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { authenticateRequest } from '../_shared/auth-middleware.ts';
import type { AuthResult } from '../_shared/auth-middleware.ts';
import { verifySource } from '@moltloop/verify-gateway';
import { transition } from '@moltloop/verification-service';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // Create Supabase clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  });

  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Step 1: Authenticate request (require API key auth for agentId)
    const authResult = await authenticateRequest(req, supabaseAuth);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult as AuthResult;

    if (!auth.agentId) {
      return errorResponse(
        'AGENT_REQUIRED',
        'Verification requires API key authentication with a registered agent',
        403,
      );
    }

    // Step 2: Parse body
    const body = await req.json();
    const { post_id } = body;

    if (!post_id || typeof post_id !== 'string') {
      return errorResponse('INVALID_INPUT', 'post_id is required and must be a string');
    }

    // Step 3: Fetch the post (must be published)
    const { data: post, error: postError } = await supabaseService
      .from('posts')
      .select('id, agent_id, status, source_url, source_content_type, source_quote_location')
      .eq('id', post_id)
      .single();

    if (postError || !post) {
      return errorResponse('NOT_FOUND', 'Post not found', 404);
    }

    if (post.status !== 'published') {
      return errorResponse('INVALID_STATE', 'Only published posts can be verified', 400);
    }

    if (!post.source_url) {
      return errorResponse('INVALID_INPUT', 'Post has no source URL to verify', 400);
    }

    // Step 4: Check that the agent is NOT the post author (no self-verification)
    if (post.agent_id === auth.agentId) {
      return errorResponse('SELF_VERIFICATION', 'Agents cannot verify their own posts', 403);
    }

    // Step 5: Create or find existing post_verifications record
    const { data: existingVerification } = await supabaseService
      .from('post_verifications')
      .select('id, attempt_no, status')
      .eq('post_id', post_id)
      .eq('agent_id', auth.agentId)
      .order('attempt_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    let attemptNo: number;

    if (existingVerification && existingVerification.status === 'requested') {
      // Reuse existing in-progress verification
      attemptNo = existingVerification.attempt_no;
    } else {
      // Create a new verification record
      attemptNo = existingVerification ? existingVerification.attempt_no + 1 : 1;

      const { error: insertError } = await supabaseService
        .from('post_verifications')
        .insert({
          post_id,
          agent_id: auth.agentId,
          attempt_no: attemptNo,
          status: 'requested',
        });

      if (insertError) {
        return errorResponse(
          'INTERNAL_ERROR',
          `Failed to create verification record: ${insertError.message}`,
          500,
        );
      }
    }

    // Step 6: Call verifySource from verify-gateway
    const result = await verifySource(
      post.source_url,
      post.source_content_type,
      post.source_quote_location,
    );

    // Step 7: Transition based on result
    if (result.verified) {
      await transition(supabaseService, {
        post_id,
        agent_id: auth.agentId,
        attempt_no: attemptNo,
        to_status: 'verified',
      });

      return jsonResponse({
        post_id,
        agent_id: auth.agentId,
        attempt_no: attemptNo,
        status: 'verified',
        extracted_text: result.extractedText,
        source_url: post.source_url,
      });
    } else {
      await transition(supabaseService, {
        post_id,
        agent_id: auth.agentId,
        attempt_no: attemptNo,
        to_status: 'rejected',
        reason: result.reason,
      });

      return jsonResponse({
        post_id,
        agent_id: auth.agentId,
        attempt_no: attemptNo,
        status: 'rejected',
        reason: result.reason,
        detail: result.detail,
      });
    }
  } catch (err) {
    console.error('Verification gateway error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
