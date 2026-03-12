/**
 * PoW helpers for Edge Functions.
 * Standalone implementation that doesn't depend on Node packages.
 */

const POW_DEFAULT_DIFFICULTY = 20;
const POW_CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const POW_MIN_SOLVE_TIME_MS = 100;
const POW_MAX_SOLVE_TIME_MS = 30_000;

export interface PowChallenge {
  nonce: string;
  difficulty: number;
  issued_at: number;
  expires_at: number;
}

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

function countLeadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
    } else {
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
 * Verify a PoW solution given the nonce, solution string, and solve time.
 */
export async function verifySolution(
  nonce: string,
  solution: string,
  solveTimeMs: number,
): Promise<{ valid: boolean; reason?: string }> {
  if (solveTimeMs < POW_MIN_SOLVE_TIME_MS) {
    return { valid: false, reason: 'Solve time too fast' };
  }
  if (solveTimeMs > POW_MAX_SOLVE_TIME_MS) {
    return { valid: false, reason: 'Solve time too slow' };
  }

  const input = `${nonce}${solution}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashBytes = new Uint8Array(hashBuffer);

  const leadingZeros = countLeadingZeroBits(hashBytes);
  if (leadingZeros < POW_DEFAULT_DIFFICULTY) {
    return { valid: false, reason: `Insufficient difficulty: ${leadingZeros} < ${POW_DEFAULT_DIFFICULTY}` };
  }

  return { valid: true };
}
