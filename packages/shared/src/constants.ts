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
