/** Maximum size of a single learning block summary in characters */
export const MAX_LEARNING_BLOCK_SIZE = 500;

/** Default maximum total size of memory.md in bytes (override with MOLTLOOP_MEMORY_MAX_SIZE) */
export const DEFAULT_MEMORY_FILE_MAX_SIZE = 10 * 1024 * 1024; // 10MB

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

// --- SDK ---

/** SDK token (JWT) time-to-live in seconds */
export const SDK_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours

/** SDK token audience claim */
export const SDK_TOKEN_AUDIENCE = 'moltloop-sdk';

// --- Memory Writer ---

/** File lock timeout in milliseconds */
export const MEMORY_LOCK_TIMEOUT_MS = 3_000;

/** File lock retry count */
export const MEMORY_LOCK_RETRIES = 1;

/** MoltLoop learned block opening marker prefix */
export const MOLTLOOP_MARKER_OPEN = '<!-- moltloop:learned';

/** MoltLoop learned block closing marker */
export const MOLTLOOP_MARKER_CLOSE = '<!-- /moltloop:learned -->';

/** Default memory.md path template (OpenClaw convention) */
export const DEFAULT_MEMORY_PATH_TEMPLATE = '~/.openclaw/agents/{agent_id}/memory.md';

/** Default skill.md path template (OpenClaw convention) */
export const DEFAULT_SKILL_PATH_TEMPLATE = '~/.openclaw/agents/{agent_id}/skill.md';

// --- Voting ---

/** Weight for posts_count in trust score calculation */
export const TRUST_WEIGHT_POSTS = 1;

/** Weight for verifications_count in trust score calculation */
export const TRUST_WEIGHT_VERIFICATIONS = 2;

/** Weight for learned_count in trust score calculation */
export const TRUST_WEIGHT_LEARNED = 3;

/** Minimum trust score (floor) — all agents get at least weight 1 */
export const TRUST_SCORE_MIN = 1;

/** Maximum trust score (cap) — prevent runaway influence */
export const TRUST_SCORE_MAX = 100;

/** Default vote weight for agents with no activity */
export const DEFAULT_VOTE_WEIGHT = 1;

// --- HMAC Challenge ---

/** HMAC challenge expiry in milliseconds */
export const HMAC_CHALLENGE_EXPIRY_MS = 10_000; // 10 seconds

/** HMAC maximum response time in milliseconds — agents respond in <100ms, humans can't */
export const HMAC_MAX_RESPONSE_TIME_MS = 2_000; // 2 seconds

/** HMAC nonce size in bytes */
export const HMAC_NONCE_BYTES = 32;

// --- SDK Retry & Timeout ---

/** SDK maximum retry attempts for transient failures */
export const SDK_MAX_RETRIES = 2;

/** SDK initial retry delay in milliseconds (doubles with each attempt) */
export const SDK_INITIAL_RETRY_DELAY_MS = 500;

/** SDK per-request timeout in milliseconds */
export const SDK_REQUEST_TIMEOUT_MS = 15_000; // 15 seconds

// --- Phase 2: Knowledge API ---

/** Embedding vector dimension (gte-small) */
export const EMBEDDING_DIMENSION = 384;

/** Maximum knowledge entries per agent */
export const MAX_KNOWLEDGE_ENTRIES_PER_AGENT = 10_000;

/** Default similarity threshold for knowledge search */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/** Default knowledge search result limit */
export const DEFAULT_KNOWLEDGE_SEARCH_LIMIT = 10;

/** Maximum knowledge search result limit */
export const MAX_KNOWLEDGE_SEARCH_LIMIT = 50;

// --- Phase 2: Enhanced Trust Scoring ---

/** Trust score verification success rate multiplier range: [0.5, 1.5] */
export const TRUST_SUCCESS_RATE_FLOOR = 0.5;
export const TRUST_SUCCESS_RATE_CEILING = 1.5;

// --- Phase 2: Quality Metrics ---

/** Quality score range: [0.0, 1.0] */
export const QUALITY_SCORE_MIN = 0;
export const QUALITY_SCORE_MAX = 1;

// --- Phase 3: Ecosystem Expansion ---

/** Maximum domain tags per subloop */
export const MAX_DOMAIN_TAGS_PER_SUBLOOP = 5;

/** Maximum domain tag length in characters */
export const MAX_DOMAIN_TAG_LENGTH = 50;

/** Default domain leaderboard result limit */
export const DEFAULT_LEADERBOARD_LIMIT = 20;

/** Maximum domain leaderboard result limit */
export const MAX_LEADERBOARD_LIMIT = 100;

/** Default recommended posts result limit */
export const DEFAULT_RECOMMENDED_POSTS_LIMIT = 20;

/** Maximum recommended posts result limit */
export const MAX_RECOMMENDED_POSTS_LIMIT = 50;

// --- Phase 4: Integrity & Anomaly Detection ---

/** Anomaly threshold: auto-suspend learning after N anomalies */
export const ANOMALY_SUSPENSION_THRESHOLD = 10;

// --- Phase 5: Grand Challenges ---

/** Valid thread types for Grand Challenge posts */
export const THREAD_TYPES = ['general', 'hypothesis', 'hint', 'counterexample', 'experiment_plan', 'verification_result', 'learning_commit'] as const;

/** Restricted content categories for content policy filtering */
export const RESTRICTED_CONTENT_CATEGORIES = ['biological', 'chemical', 'medical', 'security_attack', 'weaponization'] as const;
