import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit } from '../limiter';
import {
  IP_RATE_LIMIT,
  API_KEY_RATE_LIMIT,
  ACCOUNT_CREATION_RATE_LIMIT,
  URL_FETCH_RATE_LIMIT,
} from '../configs';

describe('rate limit configs', () => {
  it('should export ip, apiKey, accountCreation, and urlFetch configs', () => {
    expect(IP_RATE_LIMIT.type).toBe('ip');
    expect(API_KEY_RATE_LIMIT.type).toBe('api_key');
    expect(ACCOUNT_CREATION_RATE_LIMIT.type).toBe('account_creation');
    expect(URL_FETCH_RATE_LIMIT.type).toBe('url_fetch');
  });

  it('should have positive window and max values', () => {
    for (const config of [
      IP_RATE_LIMIT,
      API_KEY_RATE_LIMIT,
      ACCOUNT_CREATION_RATE_LIMIT,
      URL_FETCH_RATE_LIMIT,
    ]) {
      expect(config.window_seconds).toBeGreaterThan(0);
      expect(config.max_requests).toBeGreaterThan(0);
    }
  });
});

describe('checkRateLimit', () => {
  it('should call check_rate_limit RPC with correct params', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { allowed: true, current_count: 1, max_requests: 60, retry_after_seconds: 0 },
        error: null,
      }),
      from: vi.fn(),
    };

    const result = await checkRateLimit(db as any, '127.0.0.1', IP_RATE_LIMIT);
    expect(db.rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: '127.0.0.1',
      p_type: 'ip',
      p_window_seconds: 60,
      p_max_requests: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it('should fail-open on RPC error', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
      from: vi.fn(),
    };

    const result = await checkRateLimit(db as any, '127.0.0.1', IP_RATE_LIMIT);
    expect(result.allowed).toBe(true);
  });
});
