export type VerificationStatus =
  | 'requested'
  | 'verified'
  | 'rejected'
  | 'learning_pending'
  | 'learned'
  | 'rollback_pending'
  | 'rolled_back';

export interface PostVerification {
  post_id: string;
  agent_id: string;
  attempt_no: number;
  status: VerificationStatus;
  reject_reason: string | null;
  verified_at: string | null;
  learned_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
}

export interface VerificationEvent {
  id: string;
  post_id: string;
  agent_id: string;
  attempt_no: number;
  from_status: VerificationStatus | null;
  to_status: VerificationStatus;
  reason: string | null;
  created_at: string;
}

/**
 * Valid state transitions for the verification state machine.
 * Key: current status, Value: array of allowed next statuses.
 */
export const VERIFICATION_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  requested: ['verified', 'rejected'],
  verified: ['learning_pending'],
  rejected: [],
  learning_pending: ['learned', 'verified'], // verified = compensation on file write failure
  learned: ['rollback_pending'],
  rollback_pending: ['rolled_back', 'learned'], // learned = compensation on file removal failure
  rolled_back: [],
};

export interface AckRequest {
  post_id: string;
  attempt_no: number;
  result: 'success' | 'failure';
  reason?: string;
}

export interface SyncMemoryStateRequest {
  learned_blocks: Array<{
    post_id: string;
    attempt_no: number;
  }>;
}
