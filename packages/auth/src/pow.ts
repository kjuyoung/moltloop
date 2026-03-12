import {
  POW_DEFAULT_DIFFICULTY,
  POW_CHALLENGE_EXPIRY_MS,
  POW_MIN_SOLVE_TIME_MS,
  POW_MAX_SOLVE_TIME_MS,
} from '@moltloop/shared';
import type { PowChallenge, PowSolution } from '@moltloop/shared';

/**
 * Create a new PoW challenge.
 */
export function createChallenge(difficulty: number = POW_DEFAULT_DIFFICULTY): PowChallenge {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const now = Date.now();
  return {
    nonce,
    difficulty,
    issued_at: now,
    expires_at: now + POW_CHALLENGE_EXPIRY_MS,
  };
}

/**
 * Count the number of leading zero bits in a Uint8Array.
 */
function countLeadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
    } else {
      // Count leading zeros in this byte
      let mask = 0x80;
      while ((byte & mask) === 0) {
        count++;
        mask >>= 1;
      }
      break;
    }
  }
  return count;
}

/**
 * Verify a PoW solution.
 * Checks: hash difficulty, challenge expiry, and solve timing.
 */
export async function verifySolution(
  challenge: PowChallenge,
  solution: PowSolution,
): Promise<{ valid: boolean; reason?: string }> {
  // Check challenge expiry
  const now = Date.now();
  if (now > challenge.expires_at) {
    return { valid: false, reason: 'Challenge expired' };
  }

  // Check nonce match
  if (challenge.nonce !== solution.nonce) {
    return { valid: false, reason: 'Nonce mismatch' };
  }

  // Check timing bounds
  if (solution.solve_time_ms < POW_MIN_SOLVE_TIME_MS) {
    return { valid: false, reason: 'Solve time too fast (possible pre-computation)' };
  }
  if (solution.solve_time_ms > POW_MAX_SOLVE_TIME_MS) {
    return { valid: false, reason: 'Solve time too slow (possible replay)' };
  }

  // Verify hash: SHA-256(nonce + solution) must have required leading zero bits
  const input = `${challenge.nonce}${solution.solution}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashBytes = new Uint8Array(hashBuffer);

  const leadingZeros = countLeadingZeroBits(hashBytes);
  if (leadingZeros < challenge.difficulty) {
    return {
      valid: false,
      reason: `Insufficient difficulty: ${leadingZeros} < ${challenge.difficulty}`,
    };
  }

  return { valid: true };
}
