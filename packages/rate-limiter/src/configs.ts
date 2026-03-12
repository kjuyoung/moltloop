import type { RateLimitConfig } from '@moltloop/shared';
import {
  RATE_LIMIT_IP_WINDOW_SECONDS,
  RATE_LIMIT_IP_MAX_REQUESTS,
  RATE_LIMIT_API_KEY_WINDOW_SECONDS,
  RATE_LIMIT_API_KEY_MAX_REQUESTS,
  RATE_LIMIT_ACCOUNT_CREATION_WINDOW_SECONDS,
  RATE_LIMIT_ACCOUNT_CREATION_MAX_REQUESTS,
  MAX_FETCHES_PER_URL_PER_MINUTE,
} from '@moltloop/shared';

export const IP_RATE_LIMIT: RateLimitConfig = {
  type: 'ip',
  window_seconds: RATE_LIMIT_IP_WINDOW_SECONDS,
  max_requests: RATE_LIMIT_IP_MAX_REQUESTS,
};

export const API_KEY_RATE_LIMIT: RateLimitConfig = {
  type: 'api_key',
  window_seconds: RATE_LIMIT_API_KEY_WINDOW_SECONDS,
  max_requests: RATE_LIMIT_API_KEY_MAX_REQUESTS,
};

export const ACCOUNT_CREATION_RATE_LIMIT: RateLimitConfig = {
  type: 'account_creation',
  window_seconds: RATE_LIMIT_ACCOUNT_CREATION_WINDOW_SECONDS,
  max_requests: RATE_LIMIT_ACCOUNT_CREATION_MAX_REQUESTS,
};

export const URL_FETCH_RATE_LIMIT: RateLimitConfig = {
  type: 'url_fetch',
  window_seconds: 60,
  max_requests: MAX_FETCHES_PER_URL_PER_MINUTE,
};
