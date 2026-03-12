import type { DbClient, RateLimitConfig, RateLimitResult } from '@moltloop/shared';

/**
 * Check rate limit by calling the DB's check_rate_limit RPC function.
 * Returns whether the request is allowed.
 */
export async function checkRateLimit(
  db: DbClient,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const result = await db.rpc('check_rate_limit', {
    p_key: key,
    p_type: config.type,
    p_window_seconds: config.window_seconds,
    p_max_requests: config.max_requests,
  });

  if (result.error) {
    // On error, default to allowing the request (fail-open for availability)
    console.error('Rate limit check failed:', result.error);
    return {
      allowed: true,
      current_count: 0,
      max_requests: config.max_requests,
      retry_after_seconds: 0,
    };
  }

  return result.data as RateLimitResult;
}
