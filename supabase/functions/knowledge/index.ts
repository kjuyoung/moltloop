// Knowledge API Edge Function
// Handles: embedding generation, knowledge storage, semantic search

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { authenticateRequest } from '../_shared/auth-middleware.ts';
import type { AuthResult } from '../_shared/auth-middleware.ts';
import {
  EMBEDDING_DIMENSION,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_KNOWLEDGE_SEARCH_LIMIT,
  MAX_KNOWLEDGE_SEARCH_LIMIT,
} from '@moltloop/shared';

function isValidEmbedding(arr: unknown): arr is number[] {
  if (!Array.isArray(arr) || arr.length !== EMBEDDING_DIMENSION) return false;
  return arr.every((v) => typeof v === 'number' && Number.isFinite(v));
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/knowledge/, '');
  const method = req.method;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Create auth client with user's token
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  });

  // Service role client for privileged operations
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // All routes require authentication
    const authResult = await authenticateRequest(req, supabaseAuth);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult as AuthResult;

    function requireAgentId(): string {
      if (!auth.agentId) {
        throw {
          statusError: true,
          code: 'API_KEY_REQUIRED',
          message: 'API key authentication required for this endpoint',
          status: 403,
        };
      }
      return auth.agentId;
    }

    // --- POST /knowledge/embed (generate embedding) ---
    if (method === 'POST' && path === '/embed') {
      const agentId = requireAgentId();
      const body = await req.json();
      const { text } = body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return errorResponse('invalid_input', 'text is required');
      }

      // Use Supabase AI to generate embedding
      const { data, error } = await supabaseService.functions.invoke('_ai/gte-small', {
        body: { input: text },
      });

      if (error) {
        // Fallback: use the pg extension if Supabase AI function is not available
        const { data: pgResult, error: pgError } = await supabaseService.rpc(
          'generate_embedding_gte_small',
          { input_text: text },
        );

        if (pgError) {
          return errorResponse('embedding_failed', `Embedding generation failed: ${pgError.message}`, 500);
        }

        return jsonResponse({ embedding: pgResult });
      }

      return jsonResponse({ embedding: data?.embedding ?? data });
    }

    // --- POST /knowledge/store ---
    if (method === 'POST' && path === '/store') {
      const agentId = requireAgentId();
      const body = await req.json();
      const { post_id, attempt_no, content, source_url, embedding } = body;

      if (!post_id || !content || !source_url || !embedding) {
        return errorResponse('invalid_input', 'post_id, content, source_url, and embedding are required');
      }

      if (!isValidEmbedding(embedding)) {
        return errorResponse(
          'invalid_embedding',
          `Embedding must be an array of ${EMBEDDING_DIMENSION} finite numbers`,
        );
      }

      const { data, error } = await supabaseService
        .from('knowledge_embeddings')
        .insert({
          agent_id: agentId,
          post_id,
          attempt_no: attempt_no ?? 1,
          content,
          source_url,
          embedding: JSON.stringify(embedding),
        })
        .select('id, agent_id, post_id, attempt_no, content, source_url, created_at')
        .single();

      if (error) {
        return errorResponse('store_failed', error.message, 500);
      }

      return jsonResponse(data, 201);
    }

    // --- POST /knowledge/search ---
    if (method === 'POST' && path === '/search') {
      const agentId = requireAgentId();
      const body = await req.json();
      const { query_embedding, limit, similarity_threshold } = body;

      if (!isValidEmbedding(query_embedding)) {
        return errorResponse(
          'invalid_embedding',
          `Query embedding must be an array of ${EMBEDDING_DIMENSION} finite numbers`,
        );
      }

      const searchLimit = Math.min(
        Math.max(1, limit ?? DEFAULT_KNOWLEDGE_SEARCH_LIMIT),
        MAX_KNOWLEDGE_SEARCH_LIMIT,
      );
      const threshold = similarity_threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

      // Access control enforced here at application layer (not in RPC)
      // We pass the authenticated agentId directly
      const { data, error } = await supabaseService.rpc('search_knowledge', {
        p_agent_id: agentId,
        p_query_embedding: JSON.stringify(query_embedding),
        p_limit: searchLimit,
        p_similarity_threshold: threshold,
      });

      if (error) {
        return errorResponse('search_failed', error.message, 500);
      }

      return jsonResponse(data ?? []);
    }

    // --- DELETE /knowledge/:postId/:attemptNo ---
    const deleteMatch = path.match(/^\/([0-9a-f-]{36})\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const agentId = requireAgentId();
      const postId = deleteMatch[1];
      const attemptNo = parseInt(deleteMatch[2], 10);

      const { error } = await supabaseService
        .from('knowledge_embeddings')
        .delete()
        .eq('agent_id', agentId)
        .eq('post_id', postId)
        .eq('attempt_no', attemptNo);

      if (error) {
        return errorResponse('delete_failed', error.message, 500);
      }

      return jsonResponse({ deleted: true });
    }

    return errorResponse('not_found', 'Endpoint not found', 404);
  } catch (err) {
    if (err && typeof err === 'object' && 'statusError' in err) {
      const statusErr = err as { code: string; message: string; status: number };
      return errorResponse(statusErr.code, statusErr.message, statusErr.status);
    }
    console.error('Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('internal_error', message, 500);
  }
});
