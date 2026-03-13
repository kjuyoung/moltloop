import { describe, it, expect } from 'vitest';
import { createHmacChallenge, verifyHmacResponse, computeHmacSignature } from '../hmac-challenge';

describe('createHmacChallenge', () => {
  it('should return challenge with nonce, issued_at, expires_at', () => {
    const challenge = createHmacChallenge();
    expect(challenge.nonce).toBeDefined();
    expect(challenge.nonce.length).toBe(64); // 32 bytes = 64 hex chars
    expect(challenge.issued_at).toBeLessThanOrEqual(Date.now());
    expect(challenge.expires_at).toBeGreaterThan(challenge.issued_at);
  });

  it('should generate unique nonces', () => {
    const c1 = createHmacChallenge();
    const c2 = createHmacChallenge();
    expect(c1.nonce).not.toBe(c2.nonce);
  });

  it('should set expiry to HMAC_CHALLENGE_EXPIRY_MS', () => {
    const challenge = createHmacChallenge();
    expect(challenge.expires_at - challenge.issued_at).toBe(10_000);
  });
});

describe('computeHmacSignature', () => {
  it('should produce deterministic signature for same inputs', async () => {
    const sig1 = await computeHmacSignature('test-nonce', 'ml_abc123');
    const sig2 = await computeHmacSignature('test-nonce', 'ml_abc123');
    expect(sig1).toBe(sig2);
  });

  it('should produce different signature for different nonces', async () => {
    const sig1 = await computeHmacSignature('nonce-1', 'ml_abc123');
    const sig2 = await computeHmacSignature('nonce-2', 'ml_abc123');
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signature for different keys', async () => {
    const sig1 = await computeHmacSignature('test-nonce', 'ml_key1');
    const sig2 = await computeHmacSignature('test-nonce', 'ml_key2');
    expect(sig1).not.toBe(sig2);
  });

  it('should return 64-char hex string (SHA-256)', async () => {
    const sig = await computeHmacSignature('test-nonce', 'ml_abc123');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyHmacResponse', () => {
  it('should accept valid response within time limit', async () => {
    const now = Date.now();
    const challenge = { nonce: 'test-nonce', issued_at: now, expires_at: now + 10_000 };
    const apiKey = 'ml_testkey123';
    const signature = await computeHmacSignature('test-nonce', apiKey);
    const response = { nonce: 'test-nonce', signature, responded_at: now + 50 };

    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(true);
  });

  it('should reject expired challenge', async () => {
    const past = Date.now() - 20_000;
    const challenge = { nonce: 'test-nonce', issued_at: past, expires_at: past + 10_000 };
    const apiKey = 'ml_testkey123';
    const signature = await computeHmacSignature('test-nonce', apiKey);
    const response = { nonce: 'test-nonce', signature, responded_at: Date.now() };

    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('should reject nonce mismatch', async () => {
    const now = Date.now();
    const challenge = { nonce: 'nonce-a', issued_at: now, expires_at: now + 10_000 };
    const apiKey = 'ml_testkey123';
    const signature = await computeHmacSignature('nonce-b', apiKey);
    const response = { nonce: 'nonce-b', signature, responded_at: now + 50 };

    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('should reject response that took too long (>2s)', async () => {
    const now = Date.now();
    const challenge = { nonce: 'test-nonce', issued_at: now, expires_at: now + 10_000 };
    const apiKey = 'ml_testkey123';
    const signature = await computeHmacSignature('test-nonce', apiKey);
    const response = { nonce: 'test-nonce', signature, responded_at: now + 3000 };

    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('slow');
  });

  it('should reject invalid signature', async () => {
    const now = Date.now();
    const challenge = { nonce: 'test-nonce', issued_at: now, expires_at: now + 10_000 };
    const apiKey = 'ml_testkey123';
    const response = { nonce: 'test-nonce', signature: 'invalid-sig', responded_at: now + 50 };

    const result = await verifyHmacResponse(challenge, response, apiKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });
});
