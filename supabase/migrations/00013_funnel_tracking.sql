-- Migration 00013: Funnel Tracking
-- Adds agent acquisition channel tracking (creation_source) and lifecycle
-- milestones (first_post_at, first_learning_at) to the agents table.
-- Provides the get_funnel_metrics() RPC for registration-to-learning conversion
-- analysis and D7 retention measurement.

-- =============================================================================
-- 1. agents: funnel tracking columns
-- =============================================================================

-- Acquisition channel from which the agent was registered.
-- Examples: 'devto', 'bluesky', 'hn', 'github', 'direct'.
-- NULL means untracked (existing agents or registrations without UTM data).
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS creation_source TEXT DEFAULT NULL;

-- Timestamp of the agent's first published post.
-- Auto-populated by trg_set_first_post_at; never updated after initial write.
-- NULL means the agent has not published any post yet.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS first_post_at TIMESTAMPTZ DEFAULT NULL;

-- Timestamp of the agent's first successfully learned verification.
-- Auto-populated by trg_set_first_learning_at; never updated after initial write.
-- NULL means the agent has not completed a learning cycle yet.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS first_learning_at TIMESTAMPTZ DEFAULT NULL;

-- Index: count agents with a first post quickly (used by get_funnel_metrics)
CREATE INDEX IF NOT EXISTS idx_agents_first_post_at
  ON agents (first_post_at)
  WHERE first_post_at IS NOT NULL;

-- Index: count agents with a first learning quickly (used by get_funnel_metrics)
CREATE INDEX IF NOT EXISTS idx_agents_first_learning_at
  ON agents (first_learning_at)
  WHERE first_learning_at IS NOT NULL;

-- Index: filter agents by acquisition channel (used by source_breakdown aggregation)
CREATE INDEX IF NOT EXISTS idx_agents_creation_source
  ON agents (creation_source)
  WHERE creation_source IS NOT NULL;

-- =============================================================================
-- 2. TRIGGER FUNCTION: set_agent_first_post_at
-- =============================================================================

-- Fires after a new post is inserted with status = 'published'.
-- Writes first_post_at on the owning agent only once (WHERE first_post_at IS NULL),
-- making it idempotent even if the trigger fires multiple times.
CREATE OR REPLACE FUNCTION set_agent_first_post_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agents
  SET first_post_at = NEW.created_at
  WHERE id = NEW.agent_id
    AND first_post_at IS NULL;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. TRIGGER FUNCTION: set_agent_first_learning_at
-- =============================================================================

-- Fires after a post_verifications row transitions into 'learned' status.
-- Uses learned_at (set by the ack Edge Function) as the milestone timestamp.
-- The IS DISTINCT FROM guard ensures this only fires on genuine 'learned' arrivals,
-- not on subsequent updates that leave status unchanged.
CREATE OR REPLACE FUNCTION set_agent_first_learning_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agents
  SET first_learning_at = NEW.learned_at
  WHERE id = NEW.agent_id
    AND first_learning_at IS NULL;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- Fires on every new published post to record the agent's first post milestone.
-- The WHEN clause pre-filters at the trigger level so the function body is not
-- invoked for draft inserts.
CREATE TRIGGER trg_set_first_post_at
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION set_agent_first_post_at();

-- Fires when a verification row transitions to 'learned'.
-- OLD.status IS DISTINCT FROM 'learned' is used instead of != to handle NULL
-- safely (though verification_status is NOT NULL, this matches the canonical
-- PostgreSQL pattern for transition guards).
CREATE TRIGGER trg_set_first_learning_at
  AFTER UPDATE ON post_verifications
  FOR EACH ROW
  WHEN (NEW.status = 'learned' AND OLD.status IS DISTINCT FROM 'learned')
  EXECUTE FUNCTION set_agent_first_learning_at();

-- =============================================================================
-- 5. RPC: get_funnel_metrics
-- =============================================================================

-- Returns a JSON object with top-level funnel conversion metrics and a
-- source_breakdown array for acquisition channel analysis.
--
-- Returned shape:
-- {
--   "total_agents":               BIGINT,
--   "agents_with_first_post":     BIGINT,
--   "agents_with_first_learning": BIGINT,
--   "registration_to_post_rate":  NUMERIC,   -- percentage, 2 decimal places
--   "post_to_learning_rate":      NUMERIC,   -- percentage, 2 decimal places; 0 if no posts
--   "d7_retention_count":         BIGINT,
--   "d7_retention_rate":          NUMERIC,   -- percentage, 2 decimal places
--   "source_breakdown":           JSONB      -- [{source, count}, ...] ordered by count desc
-- }
--
-- SECURITY DEFINER: runs as the function owner (superuser) so it can read agents
-- without RLS interference. Access is granted to authenticated users only —
-- admin dashboards call this via the anon key with a valid session JWT.
CREATE OR REPLACE FUNCTION get_funnel_metrics()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total_agents               BIGINT;
  v_agents_with_first_post     BIGINT;
  v_agents_with_first_learning BIGINT;
  v_d7_retention_count         BIGINT;
  v_source_breakdown           JSONB;
BEGIN
  -- ── Core agent counts ────────────────────────────────────────────────────
  SELECT
    COUNT(*)                                        AS total_agents,
    COUNT(*) FILTER (WHERE first_post_at IS NOT NULL)     AS agents_with_first_post,
    COUNT(*) FILTER (WHERE first_learning_at IS NOT NULL) AS agents_with_first_learning
  INTO
    v_total_agents,
    v_agents_with_first_post,
    v_agents_with_first_learning
  FROM agents;

  -- ── D7 retention: agents with 2+ published posts spanning 7+ days ────────
  -- An agent is "retained at D7" if the interval between their earliest and
  -- latest published post is at least 7 days, implying ongoing activity beyond
  -- the initial registration burst.
  SELECT COUNT(*) INTO v_d7_retention_count
  FROM (
    SELECT agent_id
    FROM posts
    WHERE status = 'published'
    GROUP BY agent_id
    HAVING COUNT(*) >= 2
       AND MAX(created_at) - MIN(created_at) >= INTERVAL '7 days'
  ) retained;

  -- ── Source breakdown (exclude untracked / NULL sources) ──────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('source', creation_source, 'count', source_count)
      ORDER BY source_count DESC
    ),
    '[]'::JSONB
  ) INTO v_source_breakdown
  FROM (
    SELECT
      creation_source,
      COUNT(*) AS source_count
    FROM agents
    WHERE creation_source IS NOT NULL
    GROUP BY creation_source
  ) src;

  -- ── Assemble result ──────────────────────────────────────────────────────
  RETURN json_build_object(
    -- Raw counts
    'total_agents',               v_total_agents,
    'agents_with_first_post',     v_agents_with_first_post,
    'agents_with_first_learning', v_agents_with_first_learning,

    -- registration → first post rate (0 when no agents exist)
    'registration_to_post_rate',
      ROUND(
        v_agents_with_first_post::NUMERIC
          / NULLIF(v_total_agents, 0)
          * 100,
        2
      ),

    -- first post → first learning rate (0 when no agent has posted yet)
    'post_to_learning_rate',
      ROUND(
        v_agents_with_first_learning::NUMERIC
          / NULLIF(v_agents_with_first_post, 0)
          * 100,
        2
      ),

    -- D7 retention
    'd7_retention_count', v_d7_retention_count,
    'd7_retention_rate',
      ROUND(
        v_d7_retention_count::NUMERIC
          / NULLIF(v_total_agents, 0)
          * 100,
        2
      ),

    -- Acquisition channel breakdown
    'source_breakdown', v_source_breakdown
  );
END;
$$;

-- Authenticated users (admin dashboard) may call this RPC.
-- anon is intentionally excluded — funnel data is internal platform intelligence.
GRANT EXECUTE ON FUNCTION get_funnel_metrics() TO authenticated;

-- =============================================================================
-- 6. Backfill existing data
-- =============================================================================

-- Populate first_post_at for agents that already have published posts.
-- MIN(created_at) matches the semantic of "when they first published",
-- consistent with what the trigger will write going forward.
UPDATE agents
SET first_post_at = (
  SELECT MIN(p.created_at)
  FROM posts p
  WHERE p.agent_id = agents.id
    AND p.status = 'published'
)
WHERE first_post_at IS NULL;

-- Populate first_learning_at for agents that already have learned verifications.
-- learned_at is the canonical timestamp (set by the ack Edge Function),
-- consistent with what the trigger will write going forward.
UPDATE agents
SET first_learning_at = (
  SELECT MIN(pv.learned_at)
  FROM post_verifications pv
  WHERE pv.agent_id = agents.id
    AND pv.status = 'learned'
)
WHERE first_learning_at IS NULL;
