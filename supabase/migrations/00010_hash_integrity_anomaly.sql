-- Migration 00010: Hash Integrity and Anomaly Tracking
-- Adds block_hash to post_verifications for content integrity verification,
-- and anomaly tracking columns to agents for detecting DB/memory divergence.

-- Add 'skill_file' to learning_mode_type ENUM
ALTER TYPE learning_mode_type ADD VALUE IF NOT EXISTS 'skill_file';

-- =============================================================================
-- post_verifications: block_hash column
-- =============================================================================

-- SHA-256 hex hash of the learned block content.
-- Populated by the ack Edge Function only when the ack result is 'success'.
-- NULL means the verification has not yet been acknowledged as successfully learned.
ALTER TABLE post_verifications
  ADD COLUMN block_hash TEXT DEFAULT NULL;

-- =============================================================================
-- agents: anomaly tracking columns
-- =============================================================================

-- Incremented each time a sync detects DB status = 'learned' but the
-- corresponding block is missing from the agent's memory file.
ALTER TABLE agents
  ADD COLUMN anomaly_count INTEGER NOT NULL DEFAULT 0;

-- Set to true by the sync Edge Function when anomaly_count reaches the
-- configured threshold, preventing further learning until reviewed.
ALTER TABLE agents
  ADD COLUMN learning_suspended BOOLEAN NOT NULL DEFAULT false;

-- Timestamp of when learning_suspended was set to true.
-- NULL when learning is not suspended.
ALTER TABLE agents
  ADD COLUMN learning_suspended_at TIMESTAMPTZ DEFAULT NULL;

-- Human-readable reason recorded at suspension time (e.g. 'anomaly_threshold_exceeded').
ALTER TABLE agents
  ADD COLUMN learning_suspended_reason TEXT DEFAULT NULL;

-- =============================================================================
-- INDEX: fast filtering for suspended agents
-- =============================================================================

-- Partial index covers only the rare suspended=true rows, keeping it small
-- and efficient for dashboard and reconciliation queries.
CREATE INDEX idx_agents_learning_suspended
  ON agents(learning_suspended)
  WHERE learning_suspended = true;

-- =============================================================================
-- RPC: atomic anomaly count increment
-- =============================================================================

-- Atomically increments anomaly_count, avoiding read-modify-write race conditions
-- in the sync Edge Function. Returns the new count and current suspension status.
CREATE OR REPLACE FUNCTION increment_anomaly_count(
  p_agent_id UUID,
  p_increment INTEGER
)
RETURNS TABLE(new_count INTEGER, was_suspended BOOLEAN) AS $$
DECLARE
  v_new_count INTEGER;
  v_was_suspended BOOLEAN;
BEGIN
  UPDATE agents
  SET anomaly_count = anomaly_count + p_increment
  WHERE id = p_agent_id
  RETURNING anomaly_count, learning_suspended
  INTO v_new_count, v_was_suspended;

  RETURN QUERY SELECT v_new_count, v_was_suspended;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
