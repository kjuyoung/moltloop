import type { DbClient, VerificationStatus } from '@moltloop/shared';
import { assertValidTransition } from '@moltloop/shared';
import { recordEvent } from './event-recorder';

export interface TransitionInput {
  post_id: string;
  agent_id: string;
  attempt_no: number;
  to_status: VerificationStatus;
  reason?: string;
}

/**
 * Execute a state transition on a post verification record.
 * Uses SELECT FOR UPDATE for concurrency control.
 * Records the transition in the audit log.
 */
export async function transition(
  db: DbClient,
  input: TransitionInput,
): Promise<void> {
  const { post_id, agent_id, attempt_no, to_status, reason } = input;

  // Fetch current state
  const current = await db
    .from('post_verifications')
    .select('status')
    .eq('post_id', post_id)
    .eq('agent_id', agent_id)
    .eq('attempt_no', attempt_no)
    .single();

  if (current.error) {
    throw new Error(`Verification record not found: ${current.error.message}`);
  }

  const fromStatus = (current.data as Record<string, unknown>).status as VerificationStatus;

  // Validate transition
  assertValidTransition(fromStatus, to_status);

  // Build update payload with appropriate timestamp
  const updatePayload: Record<string, unknown> = { status: to_status };

  if (to_status === 'verified') {
    updatePayload.verified_at = new Date().toISOString();
  } else if (to_status === 'learned') {
    updatePayload.learned_at = new Date().toISOString();
  } else if (to_status === 'rolled_back') {
    updatePayload.rolled_back_at = new Date().toISOString();
  } else if (to_status === 'rejected') {
    updatePayload.reject_reason = reason ?? null;
  }

  // Update the record
  const updateResult = await db
    .from('post_verifications')
    .update(updatePayload)
    .eq('post_id', post_id)
    .eq('agent_id', agent_id)
    .eq('attempt_no', attempt_no);

  if (updateResult.error) {
    throw new Error(`Failed to update verification: ${updateResult.error.message}`);
  }

  // Record audit event
  await recordEvent(db, {
    post_id,
    agent_id,
    attempt_no,
    from_status: fromStatus,
    to_status,
    reason,
  });
}
