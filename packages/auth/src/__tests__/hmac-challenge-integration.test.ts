import { describe, it, expect } from 'vitest';
import { createHmacChallenge, computeHmacSignature, verifyHmacResponse } from '../hmac-challenge';

describe('HMAC challenge E2E flow', () => {
  it('should verify a correctly signed challenge', async () => {
    const apiKey = 'ml_testkey1234567890123456789012';

    // 1. Server creates challenge
    const challenge = createHmacChallenge();

    // 2. Agent computes signature
    const signature = await computeHmacSignature(challenge.nonce, apiKey);

    // 3. Agent responds
    const response = {
      nonce: challenge.nonce,
      signature,
      responded_at: Date.now(),
    };

    // 4. Server verifies
    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(true);
  });

  it('should reject challenge signed with wrong key', async () => {
    const serverApiKey = 'ml_serverkey12345678901234567890';
    const wrongApiKey = 'ml_wrongkey123456789012345678901';

    const challenge = createHmacChallenge();
    const signature = await computeHmacSignature(challenge.nonce, wrongApiKey);
    const response = { nonce: challenge.nonce, signature, responded_at: Date.now() };

    const result = await verifyHmacResponse(challenge, response, serverApiKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });

  it('should simulate full challenge-response-verify cycle with in-memory store', async () => {
    const apiKey = 'ml_fullcycle_key_12345678901234';

    // Simulate server-side challenge store
    const challengeStore = new Map<
      string,
      { challenge: { nonce: string; issued_at: number; expires_at: number }; apiKey: string }
    >();

    // 1. Server issues challenge (like POST /auth/hmac-challenge)
    const challenge = createHmacChallenge();
    challengeStore.set(challenge.nonce, { challenge, apiKey });

    // 2. Agent receives challenge and signs it (like SDK computeHmacSignature)
    const signature = await computeHmacSignature(challenge.nonce, apiKey);

    // 3. Agent sends response (like POST /auth/verify-hmac)
    const stored = challengeStore.get(challenge.nonce);
    expect(stored).toBeDefined();

    // Clean up (one-time use)
    challengeStore.delete(challenge.nonce);

    const response = {
      nonce: challenge.nonce,
      signature,
      responded_at: Date.now(),
    };

    // 4. Server verifies
    const result = await verifyHmacResponse(stored!.challenge, response, stored!.apiKey);
    expect(result.valid).toBe(true);

    // 5. Replay should fail (challenge was deleted)
    expect(challengeStore.get(challenge.nonce)).toBeUndefined();
  });
});
