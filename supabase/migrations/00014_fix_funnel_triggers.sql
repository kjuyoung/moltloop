-- Migration 00014: Fix Funnel Tracking Bugs
-- Fixes two bugs introduced in 00013_funnel_tracking.sql:
--
-- BUG 1 — trg_set_first_post_at missed the publish transition.
--   The original trigger was AFTER INSERT WHEN (status = 'published'), but posts
--   are always inserted as 'draft' first, then UPDATE'd to 'published'. The INSERT
--   trigger therefore never fired. Fix: drop the INSERT-only trigger and create two
--   separate triggers — one for INSERT and one for UPDATE — so both code paths are
--   covered.
--
-- BUG 2 — D7 retention measured long-term activity, not first-week retention.
--   The original query checked whether the gap between the agent's earliest and
--   latest post was >= 7 days (a long-term activity metric). The correct product
--   definition ("7일 내 재게시") is: the agent posted on at least 2 distinct calendar
--   days, and all of that activity occurred within 7 days of the agent's registration
--   (created_at). Fix: replace the D7 subquery with one that joins against agents,
--   constrains posts to the 7-day registration window, and requires activity on at
--   least 2 different days.

-- =============================================================================
-- 1. BUG 1 FIX: replace single INSERT trigger with INSERT + UPDATE triggers
-- =============================================================================

-- Drop the INSERT-only trigger that never fired on the publish transition.
DROP TRIGGER IF EXISTS trg_set_first_post_at ON posts;

-- The function body is correct and already idempotent (WHERE first_post_at IS NULL).
-- Re-create it explicitly so this migration is self-contained and readable.
CREATE OR REPLACE FUNCTION set_agent_first_post_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Write the milestone timestamp only once; the WHERE guard makes this
  -- idempotent regardless of how many times the trigger fires.
  UPDATE agents
  SET first_post_at = NEW.created_at
  WHERE id = NEW.agent_id
    AND first_post_at IS NULL;

  RETURN NEW;
END;
$$;

-- Trigger 1/2: handles the rare case where a post is inserted already published
-- (e.g. direct API calls or seeding scripts).
CREATE TRIGGER trg_set_first_post_at_insert
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION set_agent_first_post_at();

-- Trigger 2/2: handles the normal application flow — post is inserted as 'draft'
-- then UPDATE'd to 'published'. The IS DISTINCT FROM guard is the canonical
-- PostgreSQL pattern for transition detection and handles NULL safely.
CREATE TRIGGER trg_set_first_post_at_update
  AFTER UPDATE ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
  EXECUTE FUNCTION set_agent_first_post_at();

-- =============================================================================
-- 2. BUG 2 FIX: replace get_funnel_metrics() with corrected D7 definition
-- =============================================================================

-- D7 retention — correct definition:
--   An agent is "D7 retained" if they published on at least 2 distinct calendar
--   days, with all qualifying activity occurring within 7 days of their account
--   registration (agents.created_at). This matches "7일 내 재게시": the agent
--   came back and posted again during their first week.
--
-- Previous (wrong) definition:
--   MAX(post.created_at) - MIN(post.created_at) >= INTERVAL '7 days'
--   → measured long-term spread, not first-week re-engagement.
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
    COUNT(*)                                              AS total_agents,
    COUNT(*) FILTER (WHERE first_post_at IS NOT NULL)     AS agents_with_first_post,
    COUNT(*) FILTER (WHERE first_learning_at IS NOT NULL) AS agents_with_first_learning
  INTO
    v_total_agents,
    v_agents_with_first_post,
    v_agents_with_first_learning
  FROM agents;

  -- ── D7 retention: agents who posted on 2+ distinct days within their first 7 days ──
  -- Conditions:
  --   • post is published
  --   • post was created within 7 days of the agent's registration (a.created_at)
  --   • the agent has activity on at least 2 different calendar days in that window
  -- This captures "re-posted within the first week" (standard D7 retention).
  SELECT COUNT(*) INTO v_d7_retention_count
  FROM (
    SELECT p.agent_id
    FROM posts p
    JOIN agents a ON a.id = p.agent_id
    WHERE p.status = 'published'
      AND p.created_at <= a.created_at + INTERVAL '7 days'
    GROUP BY p.agent_id, a.created_at
    HAVING COUNT(*) >= 2
       AND MAX(p.created_at)::date > MIN(p.created_at)::date
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

-- Re-grant execute to authenticated; SECURITY DEFINER runs as function owner.
-- anon is intentionally excluded — funnel data is internal platform intelligence.
GRANT EXECUTE ON FUNCTION get_funnel_metrics() TO authenticated;
