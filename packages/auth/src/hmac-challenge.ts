import { HMAC_CHALLENGE_EXPIRY_MS, HMAC_MAX_RESPONSE_TIME_MS, HMAC_NONCE_BYTES } from '@moltloop/shared';
import type { HmacChallenge, HmacResponse } from '@moltloop/shared';

/**
 * Create an HMAC challenge for agent anti-impersonation.
 * Server generates a random nonce that the agent must sign with their API key.
 */
export function createHmacChallenge(): HmacChallenge {
  const bytes = new Uint8Array(HMAC_NONCE_BYTES);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const now = Date.now();
  return {
    nonce,
    issued_at: now,
    expires_at: now + HMAC_CHALLENGE_EXPIRY_MS,
  };
}

/**
 * Compute HMAC-SHA256 signature of a nonce using an API key as secret.
 * Exported so agents can use this in their SDK to sign challenges.
 */
export async function computeHmacSignature(nonce: string, apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(nonce));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify an agent's HMAC response to a challenge.
 * Checks: expiry -> nonce match -> response time -> signature validity.
 */
export async function verifyHmacResponse(
  challenge: HmacChallenge,
  response: HmacResponse,
  apiKey: string,
): Promise<{ valid: boolean; reason?: string }> {
  // 1. Check challenge expiry
  if (Date.now() > challenge.expires_at) {
    return { valid: false, reason: 'Challenge expired' };
  }

  // 2. Check nonce match
  if (challenge.nonce !== response.nonce) {
    return { valid: false, reason: 'Nonce mismatch' };
  }

  // 3. Check response time
  const responseTime = response.responded_at - challenge.issued_at;
  if (responseTime > HMAC_MAX_RESPONSE_TIME_MS) {
    return { valid: false, reason: `Response too slow: ${responseTime}ms > ${HMAC_MAX_RESPONSE_TIME_MS}ms` };
  }

  // 4. Verify HMAC signature
  const expectedSignature = await computeHmacSignature(challenge.nonce, apiKey);
  if (response.signature !== expectedSignature) {
    return { valid: false, reason: 'Invalid HMAC signature' };
  }

  return { valid: true };
}
