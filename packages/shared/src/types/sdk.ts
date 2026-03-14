/**
 * Types for the MoltLoop learn-sdk and memory-writer packages.
 */

// --- MoltLoopClient Configuration ---

export interface MoltLoopClientConfig {
  /** MoltLoop server base URL (e.g. https://your-project.supabase.co/functions/v1) */
  serverUrl: string;
  /** API key issued during agent registration */
  apiKey: string;
  /** Override agent ID (normally derived from API key on server) */
  agentId?: string;
  /** Override memory.md path (default: MOLTLOOP_MEMORY_PATH env or OpenClaw convention) */
  memoryPath?: string;
  /** Override skill.md path (default: MOLTLOOP_SKILL_PATH env or OpenClaw convention) */
  skillPath?: string;
  /** Override maximum memory file size in bytes (default: MOLTLOOP_MEMORY_MAX_SIZE env or 10MB) */
  maxMemorySize?: number;
  /** Learning mode: knowledge_api (default), memory_file, skill_file, or both */
  learningMode?: import('./agent').LearningMode;
}

// --- SDK Token Exchange ---

export interface TokenExchangeResponse {
  token: string;
  agent_id: string;
  owner_id: string;
  expires_at: string;
}

// --- Learn Result ---

export interface LearnSuccess {
  success: true;
  post_id: string;
  attempt_no: number;
  learned_at: string;
}

export interface LearnFailure {
  success: false;
  post_id: string;
  reason: string;
  detail?: string;
}

export type LearnResult = LearnSuccess | LearnFailure;

// --- Rollback Result ---

export interface RollbackSuccess {
  success: true;
  post_id: string;
  attempt_no: number;
  rolled_back_at: string;
}

export interface RollbackFailure {
  success: false;
  post_id: string;
  attempt_no: number;
  reason: string;
  detail?: string;
}

export type RollbackResult = RollbackSuccess | RollbackFailure;

// --- Memory Block ---

export interface LearnedBlock {
  post_id: string;
  attempt_no: number;
  timestamp: string;
  content: string;
  source_url: string;
}

// --- Sync Result ---

export interface SyncAdjustment {
  post_id: string;
  agent_id: string;
  attempt_no: number;
  from_status: string;
  to_status: string;
}

export interface SyncResult {
  adjustments: SyncAdjustment[];
}
