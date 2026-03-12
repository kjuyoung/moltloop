// Learning/Rollback Ack Edge Function
// Handles: POST /ack/learn, POST /ack/rollback
// Reports learning/rollback results from the SDK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { authenticateRequest } from '../_shared/auth-middleware.ts';
import type { AuthResult } from '../_shared/auth-middleware.ts';
import { transition } from '@moltloop/verification-service';
import { InvalidTransitionError } from '@moltloop/shared';
import type { AckRequest } from '@moltloop/shared';

function validateAckRequest(body: unknown): { valid: true; data: AckRequest } | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b.post_id || typeof b.post_id !== 'string') {
    return { valid: false, error: 'post_id is required and must be a string' };
  }

  if (
    typeof b.attempt_no !== 'number' ||
    !Number.isInteger(b.attempt_no) ||
    b.attempt_no < 1
  ) {
    return { valid: false, error: 'attempt_no is required and must be a positive integer' };
  }

  if (b.result !== 'success' && b.result !== 'failure') {
    return { valid: false, error: "result is required and must be 'success' or 'failure'" };
  }

  return {
    valid: true,
    data: {
      post_id: b.post_id as string,
      attempt_no: b.attempt_no as number,
      result: b.result as 'success' | 'failure',
      reason: typeof b.reason === 'string' ? b.reason : undefined,
    },
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // Determine route from pathname
  const url = new URL(req.url);
  const pathname = url.pathname;

  let route: 'learn' | 'rollback';
  if (pathname.endsWith('/ack/learn')) {
    route = 'learn';
  } else if (pathname.endsWith('/ack/rollback')) {
    route = 'rollback';
  } else {
    return errorResponse('NOT_FOUND', 'Unknown route. Use /ack/learn or /ack/rollback', 404);
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
    // Authenticate request (require API key auth for agentId)
    const authResult = await authenticateRequest(req, supabaseAuth);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult as AuthResult;

    if (!auth.agentId) {
      return errorResponse(
        'AGENT_REQUIRED',
        'Ack endpoints require API key authentication with a registered agent',
        403,
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('INVALID_INPUT', 'Request body must be valid JSON');
    }

    const validation = validateAckRequest(body);
    if (!validation.valid) {
      return errorResponse('INVALID_INPUT', validation.error);
    }

    const { post_id, attempt_no, result, reason } = validation.data;
    const agent_id = auth.agentId;

    // Determine target status based on route and result
    let to_status: string;
    let transitionReason: string | undefined;

    if (route === 'learn') {
      if (result === 'success') {
        // learning_pending → learned
        to_status = 'learned';
      } else {
        // learning_pending → verified (compensation)
        to_status = 'verified';
        transitionReason = reason ?? 'Learning failed';
      }
    } else {
      // rollback
      if (result === 'success') {
        // rollback_pending → rolled_back
        to_status = 'rolled_back';
      } else {
        // rollback_pending → learned (compensation)
        to_status = 'learned';
        transitionReason = reason ?? 'Rollback failed';
      }
    }

    // Execute the state transition
    await transition(supabaseService, {
      post_id,
      agent_id,
      attempt_no,
      to_status: to_status as Parameters<typeof transition>[1]['to_status'],
      reason: transitionReason,
    });

    return jsonResponse({
      post_id,
      agent_id,
      attempt_no,
      status: to_status,
      ack: result,
    });
  } catch (err) {
    // InvalidTransitionError → 409 Conflict (idempotent / already transitioned)
    if (err instanceof InvalidTransitionError) {
      return errorResponse('CONFLICT', err.message, 409);
    }

    console.error('Ack endpoint error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
