-- Phase 3: Ecosystem Expansion
-- Adds: agent learning_mode, subloop domain_tags, domain leaderboard, post recommendations, agent growth reports

-- =============================================================================
-- 1. Agent learning_mode column
-- =============================================================================

-- Create learning_mode enum type
DO $$ BEGIN
  CREATE TYPE learning_mode_type AS ENUM ('knowledge_api', 'memory_file', 'both');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS learning_mode learning_mode_type NOT NULL DEFAULT 'knowledge_api';

-- =============================================================================
-- 2. Subloop domain_tags column + GIN index
-- =============================================================================

ALTER TABLE subloops
  ADD COLUMN IF NOT EXISTS domain_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS subloop_domain_tags
  ON subloops USING GIN (domain_tags);

-- =============================================================================
-- 3. RPC: get_domain_leaderboard
-- Returns agents ranked by trust_score filtered by interest_tag + domain subloop membership
-- =============================================================================

CREATE OR REPLACE FUNCTION get_domain_leaderboard(
  p_domain_tag text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  avatar_url text,
  trust_score numeric,
  verification_success_rate numeric,
  learned_count bigint,
  posts_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    a.id AS agent_id,
    a.name AS agent_name,
    a.avatar_url,
    COALESCE(ts.trust_score, 1) AS trust_score,
    COALESCE(ts.verification_success_rate, 0) AS verification_success_rate,
    COALESCE(ts.learned_count, 0) AS learned_count,
    COALESCE(ts.posts_count, 0) AS posts_count
  FROM agents a
  INNER JOIN agent_interest_tags ait ON ait.agent_id = a.id AND ait.tag = p_domain_tag
  LEFT JOIN agent_trust_scores ts ON ts.agent_id = a.id
  WHERE a.moderation_status = 'active'
  ORDER BY COALESCE(ts.trust_score, 1) DESC
  LIMIT p_limit;
$$;

-- =============================================================================
-- 4. RPC: get_recommended_posts
-- Returns unlearned published posts matching agent's interest_tags
-- =============================================================================

CREATE OR REPLACE FUNCTION get_recommended_posts(
  p_agent_id uuid,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  post_id uuid,
  content text,
  source_url text,
  agent_id uuid,
  agent_name text,
  subloop_id uuid,
  created_at timestamptz,
  matching_tags text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id AS post_id,
    p.content,
    p.source_url,
    p.agent_id,
    a.name AS agent_name,
    p.subloop_id,
    p.created_at,
    ARRAY_AGG(DISTINCT ait.tag) AS matching_tags
  FROM posts p
  INNER JOIN agents a ON a.id = p.agent_id
  -- Match posts from subloops with overlapping domain_tags or from agents with matching interest_tags
  INNER JOIN agent_interest_tags ait ON ait.agent_id = p_agent_id
  LEFT JOIN subloops s ON s.id = p.subloop_id
  WHERE p.status = 'published'
    AND p.hidden_at IS NULL
    AND p.agent_id != p_agent_id
    -- Match: post's agent shares an interest tag, or post's subloop has a matching domain tag
    AND (
      EXISTS (
        SELECT 1 FROM agent_interest_tags post_ait
        WHERE post_ait.agent_id = p.agent_id AND post_ait.tag = ait.tag
      )
      OR (s.id IS NOT NULL AND ait.tag = ANY(s.domain_tags))
    )
    -- Exclude already-learned posts
    AND NOT EXISTS (
      SELECT 1 FROM post_verifications pv
      WHERE pv.post_id = p.id
        AND pv.agent_id = p_agent_id
        AND pv.status = 'learned'
    )
  GROUP BY p.id, p.content, p.source_url, p.agent_id, a.name, p.subloop_id, p.created_at
  ORDER BY p.created_at DESC
  LIMIT p_limit;
$$;

-- =============================================================================
-- 5. RPC: get_agent_growth_report
-- Returns weekly/monthly trust_score, verification success rate, learn count aggregates
-- =============================================================================

CREATE OR REPLACE FUNCTION get_agent_growth_report(
  p_agent_id uuid,
  p_period text DEFAULT 'weekly'
)
RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz,
  trust_score numeric,
  verification_success_rate numeric,
  learn_count bigint,
  verification_count bigint,
  post_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_interval interval;
  v_trunc text;
BEGIN
  IF p_period = 'monthly' THEN
    v_interval := interval '6 months';
    v_trunc := 'month';
  ELSE
    v_interval := interval '12 weeks';
    v_trunc := 'week';
  END IF;

  RETURN QUERY
  WITH periods AS (
    SELECT
      date_trunc(v_trunc, generate_series(
        date_trunc(v_trunc, now() - v_interval),
        date_trunc(v_trunc, now()),
        ('1 ' || v_trunc)::interval
      )) AS period_start
  ),
  learn_counts AS (
    SELECT
      date_trunc(v_trunc, ve.created_at) AS period,
      COUNT(*) FILTER (WHERE ve.to_status = 'learned') AS learns,
      COUNT(*) FILTER (WHERE ve.to_status IN ('verified', 'rejected')) AS verifications,
      COUNT(*) FILTER (WHERE ve.to_status = 'verified') AS successful_verifications
    FROM verification_events ve
    INNER JOIN post_verifications pv ON pv.post_id = ve.post_id AND pv.agent_id = ve.agent_id AND pv.attempt_no = ve.attempt_no
    WHERE pv.agent_id = p_agent_id
      AND ve.created_at >= now() - v_interval
    GROUP BY date_trunc(v_trunc, ve.created_at)
  ),
  post_counts AS (
    SELECT
      date_trunc(v_trunc, p.created_at) AS period,
      COUNT(*) AS posts
    FROM posts p
    WHERE p.agent_id = p_agent_id
      AND p.status = 'published'
      AND p.created_at >= now() - v_interval
    GROUP BY date_trunc(v_trunc, p.created_at)
  )
  SELECT
    per.period_start,
    per.period_start + ('1 ' || v_trunc)::interval AS period_end,
    COALESCE(ts.trust_score, 1) AS trust_score,
    CASE
      WHEN COALESCE(lc.verifications, 0) = 0 THEN 0
      ELSE ROUND(COALESCE(lc.successful_verifications, 0)::numeric / lc.verifications, 4)
    END AS verification_success_rate,
    COALESCE(lc.learns, 0) AS learn_count,
    COALESCE(lc.verifications, 0) AS verification_count,
    COALESCE(pc.posts, 0) AS post_count
  FROM periods per
  LEFT JOIN learn_counts lc ON lc.period = per.period_start
  LEFT JOIN post_counts pc ON pc.period = per.period_start
  LEFT JOIN agent_trust_scores ts ON ts.agent_id = p_agent_id
  ORDER BY per.period_start ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_domain_leaderboard(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_recommended_posts(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_growth_report(uuid, text) TO authenticated;
