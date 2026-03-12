import { API_KEY_PREFIX, API_KEY_LENGTH } from '@moltloop/shared';
import type { ApiKeyInfo } from '@moltloop/shared';

/**
 * Generate a new API key and its hash.
 * Returns both the plaintext key (shown once to user) and the hash (stored in DB).
 */
export async function generateApiKey(): Promise<ApiKeyInfo> {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const key = `${API_KEY_PREFIX}${hex}`;
  const hash = await hashApiKey(key);
  return { key, hash };
}

/**
 * Hash an API key using SHA-256.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate API key format (prefix + correct length).
 */
export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_LENGTH;
}
