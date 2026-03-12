// Reconciliation Worker Edge Function
// Triggered by pg_cron + pg_net every 1 minute
// Detects stale pending states and logs reconciliation events
// Does NOT force-transition any records — just logs and waits for reconnection handshake

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { recordEvent } from '@moltloop/verification-service';
import {
  PENDING_ACK_THRESHOLD_MS,
  PENDING_AUDIT_THRESHOLD_MS,
  PENDING_ALERT_THRESHOLD_MS,
} from '@moltloop/shared';

/** Reconciliation severity tiers mapped to threshold and reason string. */
const TIERS = [
  { thresholdMs: PENDING_ALERT_THRESHOLD_MS, reason: 'reconciliation: ack_overdue_24h' },
  { thresholdMs: PENDING_AUDIT_THRESHOLD_MS, reason: 'reconciliation: ack_overdue_30m' },
  { thresholdMs: PENDING_ACK_THRESHOLD_MS, reason: 'reconciliation: ack_overdue_5m' },
] as const;

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const db = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Step 1: Fetch all records in a pending state
    const { data: pendingRecords, error: fetchError } = await db
      .from('post_verifications')
      .select('post_id, agent_id, attempt_no, status, status_changed_at')
      .in('status', ['learning_pending', 'rollback_pending']);

    if (fetchError) {
      console.error('Failed to fetch pending verifications:', fetchError.message);
      return errorResponse('QUERY_ERROR', fetchError.message, 500);
    }

    if (!pendingRecords || pendingRecords.length === 0) {
      return jsonResponse({ checked: 0, stale_5m: 0, stale_30m: 0, stale_24h: 0 });
    }

    // Step 2: For each pending record, fetch existing reconciliation events
    // so we only log each tier once per (post_id, agent_id, attempt_no).
    const existingReasons = new Set<string>();

    // Build composite keys for the batch query
    // We query verification_events where reason starts with 'reconciliation:'
    // for all the pending records.
    const { data: existingEvents, error: eventsError } = await db
      .from('verification_events')
      .select('post_id, agent_id, attempt_no, reason')
      .like('reason', 'reconciliation:%');

    if (eventsError) {
      console.error('Failed to fetch existing reconciliation events:', eventsError.message);
      // Continue anyway — worst case we log some duplicates
    } else if (existingEvents) {
      for (const evt of existingEvents) {
        existingReasons.add(
          `${evt.post_id}:${evt.agent_id}:${evt.attempt_no}:${evt.reason}`,
        );
      }
    }

    // Step 3: Categorize and log stale records
    const now = Date.now();
    let stale5m = 0;
    let stale30m = 0;
    let stale24h = 0;

    for (const record of pendingRecords) {
      // Use status_changed_at — the exact timestamp when the record entered its current pending state
      const pendingDuration = now - new Date(record.status_changed_at).getTime();

      // Determine which tiers this record has crossed
      // TIERS are ordered from highest to lowest threshold so we check all of them
      for (const tier of TIERS) {
        if (pendingDuration < tier.thresholdMs) continue;

        const key = `${record.post_id}:${record.agent_id}:${record.attempt_no}:${tier.reason}`;
        if (existingReasons.has(key)) continue;

        // Log the reconciliation event (no state transition — same from/to status)
        await recordEvent(db, {
          post_id: record.post_id,
          agent_id: record.agent_id,
          attempt_no: record.attempt_no,
          from_status: record.status,
          to_status: record.status,
          reason: tier.reason,
        });

        existingReasons.add(key);
      }

      // Count per tier for the summary
      if (pendingDuration >= PENDING_ALERT_THRESHOLD_MS) {
        stale24h++;
      } else if (pendingDuration >= PENDING_AUDIT_THRESHOLD_MS) {
        stale30m++;
      } else if (pendingDuration >= PENDING_ACK_THRESHOLD_MS) {
        stale5m++;
      }
    }

    console.log(
      `Reconciliation: checked=${pendingRecords.length} stale_5m=${stale5m} stale_30m=${stale30m} stale_24h=${stale24h}`,
    );

    return jsonResponse({
      checked: pendingRecords.length,
      stale_5m: stale5m,
      stale_30m: stale30m,
      stale_24h: stale24h,
    });
  } catch (err) {
    console.error('Reconciliation worker error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
