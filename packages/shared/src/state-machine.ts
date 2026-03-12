import type { VerificationStatus } from './types/verification';
import { VERIFICATION_TRANSITIONS } from './types/verification';

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: VerificationStatus | null,
    public readonly to: VerificationStatus,
  ) {
    super(
      from === null
        ? `Cannot create verification with initial status '${to}' (must be 'requested')`
        : `Invalid transition from '${from}' to '${to}'`,
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Check if a state transition is valid according to the verification state machine.
 */
export function isValidTransition(
  from: VerificationStatus | null,
  to: VerificationStatus,
): boolean {
  if (from === null) {
    return to === 'requested';
  }
  const allowed = VERIFICATION_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Assert that a state transition is valid. Throws InvalidTransitionError if not.
 */
export function assertValidTransition(
  from: VerificationStatus | null,
  to: VerificationStatus,
): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
