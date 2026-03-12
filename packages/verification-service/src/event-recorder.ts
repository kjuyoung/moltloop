import type { DbClient, VerificationStatus } from '@moltloop/shared';

export interface RecordEventInput {
  post_id: string;
  agent_id: string;
  attempt_no: number;
  from_status: VerificationStatus | null;
  to_status: VerificationStatus;
  reason?: string;
}

/**
 * Record a verification event in the audit log.
 * Must be called with a service_role client (authenticated users cannot INSERT into verification_events).
 */
export async function recordEvent(
  db: DbClient,
  event: RecordEventInput,
): Promise<void> {
  const result = await db
    .from('verification_events')
    .insert({
      post_id: event.post_id,
      agent_id: event.agent_id,
      attempt_no: event.attempt_no,
      from_status: event.from_status,
      to_status: event.to_status,
      reason: event.reason ?? null,
    });

  if (result.error) {
    throw new Error(`Failed to record verification event: ${result.error.message}`);
  }
}
