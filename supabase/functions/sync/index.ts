// Reconnection Handshake Edge Function
// Handles: POST /sync/memory-state
// Compares local memory.md state with DB on agent reconnection
// Imports from: @moltloop/verification-service, @moltloop/auth

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { authenticateRequest } from '../_shared/auth-middleware.ts';
import type { AuthResult } from '../_shared/auth-middleware.ts';
import { transition, recordEvent } from '@moltloop/verification-service';

Deno.serve(async (req) => {
  // Step 1: Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Step 2: Only accept POST
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
    // Step 3: Authenticate request (require API key auth for agentId)
    const authResult = await authenticateRequest(req, supabaseAuth);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult as AuthResult;

    if (!auth.agentId) {
      return errorResponse(
        'AGENT_REQUIRED',
        'Sync requires API key authentication with a registered agent',
        403,
      );
    }

    // Step 4: Parse body as SyncMemoryStateRequest
    const body = await req.json();
    const { learned_blocks } = body;

    // Step 5: Validate learned_blocks
    if (!Array.isArray(learned_blocks)) {
      return errorResponse(
        'INVALID_INPUT',
        'learned_blocks must be an array',
      );
    }

    for (const block of learned_blocks) {
      if (!block.post_id || typeof block.post_id !== 'string') {
        return errorResponse(
          'INVALID_INPUT',
          'Each learned_block must have a string post_id',
        );
      }
      if (typeof block.attempt_no !== 'number' || block.attempt_no < 1) {
        return errorResponse(
          'INVALID_INPUT',
          'Each learned_block must have a positive integer attempt_no',
        );
      }
    }

    // Build a lookup set from local blocks for quick membership checks
    const localBlockSet = new Set<string>(
      learned_blocks.map(
        (b: { post_id: string; attempt_no: number }) => `${b.post_id}:${b.attempt_no}`,
      ),
    );

    // Step 6: Fetch all pending post_verifications for this agent
    const { data: pendingRecords, error: fetchError } = await supabaseService
      .from('post_verifications')
      .select('post_id, agent_id, attempt_no, status')
      .eq('agent_id', auth.agentId)
      .in('status', ['learning_pending', 'rollback_pending']);

    if (fetchError) {
      return errorResponse(
        'INTERNAL_ERROR',
        `Failed to fetch pending verifications: ${fetchError.message}`,
        500,
      );
    }

    // Also fetch learned records to detect anomalies (case e)
    const { data: learnedRecords, error: learnedFetchError } = await supabaseService
      .from('post_verifications')
      .select('post_id, agent_id, attempt_no, status')
      .eq('agent_id', auth.agentId)
      .eq('status', 'learned');

    if (learnedFetchError) {
      return errorResponse(
        'INTERNAL_ERROR',
        `Failed to fetch learned verifications: ${learnedFetchError.message}`,
        500,
      );
    }

    // Step 7: Reconcile each pending record
    const adjustments: Array<{
      post_id: string;
      agent_id: string;
      attempt_no: number;
      from_status: string;
      to_status: string;
    }> = [];
    const errors: Array<{
      post_id: string;
      attempt_no: number;
      error: string;
    }> = [];

    for (const record of pendingRecords ?? []) {
      const key = `${record.post_id}:${record.attempt_no}`;
      const blockExists = localBlockSet.has(key);

      let toStatus: string;

      if (record.status === 'learning_pending') {
        // (a) DB=learning_pending + block exists → learned
        // (b) DB=learning_pending + block NOT in local → verified (compensation)
        toStatus = blockExists ? 'learned' : 'verified';
      } else {
        // record.status === 'rollback_pending'
        // (c) DB=rollback_pending + block NOT in local → rolled_back
        // (d) DB=rollback_pending + block exists → learned (compensation)
        toStatus = blockExists ? 'learned' : 'rolled_back';
      }

      try {
        await transition(supabaseService, {
          post_id: record.post_id,
          agent_id: auth.agentId,
          attempt_no: record.attempt_no,
          to_status: toStatus as Parameters<typeof transition>[1]['to_status'],
        });

        adjustments.push({
          post_id: record.post_id,
          agent_id: auth.agentId,
          attempt_no: record.attempt_no,
          from_status: record.status,
          to_status: toStatus,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(
          `Sync transition failed for post=${record.post_id} attempt=${record.attempt_no}: ${message}`,
        );
        errors.push({
          post_id: record.post_id,
          attempt_no: record.attempt_no,
          error: message,
        });
      }
    }

    // Step 7e: Anomaly detection — DB=learned but block NOT in local
    const anomalies: Array<{ post_id: string; attempt_no: number }> = [];

    for (const record of learnedRecords ?? []) {
      const key = `${record.post_id}:${record.attempt_no}`;
      if (!localBlockSet.has(key)) {
        anomalies.push({
          post_id: record.post_id,
          attempt_no: record.attempt_no,
        });

        try {
          await recordEvent(supabaseService, {
            post_id: record.post_id,
            agent_id: auth.agentId,
            attempt_no: record.attempt_no,
            from_status: 'learned',
            to_status: 'learned',
            reason: 'sync_anomaly: DB=learned but block missing from local memory.md',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(
            `Failed to record anomaly for post=${record.post_id} attempt=${record.attempt_no}: ${message}`,
          );
        }
      }
    }

    return jsonResponse({
      agent_id: auth.agentId,
      adjustments,
      anomalies,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('Sync memory-state error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
