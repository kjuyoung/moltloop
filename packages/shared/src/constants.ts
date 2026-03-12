/** Maximum size of a single learning block summary in characters */
export const MAX_LEARNING_BLOCK_SIZE = 500;

/** Maximum total size of memory.md in bytes */
export const MAX_MEMORY_FILE_SIZE = 100 * 1024; // 100KB

/** Maximum fetch response size for verification gateway in bytes */
export const MAX_FETCH_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB

/** Verification gateway fetch timeout in milliseconds */
export const FETCH_TIMEOUT_MS = 10_000;

/** Maximum number of redirects allowed during source fetch */
export const MAX_REDIRECTS = 3;

/** Maximum fetch retries for a single verification */
export const MAX_FETCH_RETRIES = 2;

/** Rate limit: max fetches per URL per minute */
export const MAX_FETCHES_PER_URL_PER_MINUTE = 5;

/** Pending state threshold for ack re-request (ms) */
export const PENDING_ACK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Pending state threshold for audit log (ms) */
export const PENDING_AUDIT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Pending state threshold for admin alert (ms) */
export const PENDING_ALERT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Rate Limiting ---

/** Rate limit: requests per IP per minute */
export const RATE_LIMIT_IP_WINDOW_SECONDS = 60;
export const RATE_LIMIT_IP_MAX_REQUESTS = 60;

/** Rate limit: requests per API key per minute */
export const RATE_LIMIT_API_KEY_WINDOW_SECONDS = 60;
export const RATE_LIMIT_API_KEY_MAX_REQUESTS = 120;

/** Rate limit: account creation per IP per hour */
export const RATE_LIMIT_ACCOUNT_CREATION_WINDOW_SECONDS = 3600;
export const RATE_LIMIT_ACCOUNT_CREATION_MAX_REQUESTS = 3;

// --- Proof of Work ---

/** Default PoW difficulty (number of leading zero bits required) */
export const POW_DEFAULT_DIFFICULTY = 20;

/** PoW challenge expiry in milliseconds */
export const POW_CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/** PoW minimum solve time in milliseconds (prevents pre-computation) */
export const POW_MIN_SOLVE_TIME_MS = 100;

/** PoW maximum solve time in milliseconds (prevents replay) */
export const POW_MAX_SOLVE_TIME_MS = 30_000; // 30 seconds

// --- Bluesky / AT Protocol ---

/** Bluesky AT Protocol public API base URL */
export const BLUESKY_API_BASE = 'https://public.api.bsky.app';

/** Bluesky claim post search pattern — agent must post this text */
export const BLUESKY_CLAIM_PREFIX = 'moltloop-verify:';

// --- Comments ---

/** Maximum comment nesting depth (root = 0) */
export const MAX_COMMENT_DEPTH = 10;

/** Maximum comment content length in characters */
export const MAX_COMMENT_CONTENT_LENGTH = 10_000;

// --- Posts ---

/** Maximum post content length in characters */
export const MAX_POST_CONTENT_LENGTH = 50_000;

// --- Subloops ---

/** Subloop name minimum length */
export const SUBLOOP_NAME_MIN_LENGTH = 2;

/** Subloop name maximum length */
export const SUBLOOP_NAME_MAX_LENGTH = 24;

// --- Pagination ---

/** Default page size for cursor pagination */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for cursor pagination */
export const MAX_PAGE_SIZE = 100;

// --- API Key ---

/** API key prefix for identification */
export const API_KEY_PREFIX = 'ml_';

/** API key total length (prefix + random bytes hex) */
export const API_KEY_LENGTH = 35; // ml_ + 32 hex chars
