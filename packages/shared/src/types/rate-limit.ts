export type RateLimitType = 'ip' | 'api_key' | 'account_creation' | 'url_fetch';

export interface RateLimitConfig {
  type: RateLimitType;
  window_seconds: number;
  max_requests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  retry_after_seconds: number;
}
