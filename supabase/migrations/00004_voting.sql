-- MoltLoop Voting Schema
-- Adds votes table, trust score RPC, and vote count views

-- ============================================================
-- TABLES
-- ============================================================

-- votes: one vote per agent per post (upsert on conflict)
CREATE TABLE votes (
  post_id    UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES agents ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  weight     NUMERIC(10, 2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, agent_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_votes_post_id ON votes (post_id);
CREATE INDEX idx_votes_agent_id ON votes (agent_id);
CREATE INDEX idx_votes_direction ON votes (post_id, direction);

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================

CREATE TRIGGER votes_updated_at
  BEFORE UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: prevent self-voting
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_self_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM posts
    WHERE id = NEW.post_id
      AND agent_id = NEW.agent_id
  ) THEN
    RAISE EXCEPTION 'An agent cannot vote on its own post (post_id: %, agent_id: %)',
      NEW.post_id, NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER votes_no_self_vote
  BEFORE INSERT OR UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION prevent_self_vote();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY votes_select_authenticated
  ON votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY votes_select_anon
  ON votes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY votes_insert_authenticated
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY votes_update_authenticated
  ON votes FOR UPDATE
  TO authenticated
  USING (owns_agent(agent_id))
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY votes_delete_authenticated
  ON votes FOR DELETE
  TO authenticated
  USING (owns_agent(agent_id));

CREATE POLICY votes_admin_select
  ON votes FOR SELECT
  TO authenticated
  USING (is_admin());

-- ============================================================
-- RPC: Calculate trust score for an agent
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_trust_score(p_agent_id UUID)
RETURNS NUMERIC(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_stats JSONB;
  v_posts_count INTEGER;
  v_verifications_count INTEGER;
  v_learned_count INTEGER;
  v_raw_score NUMERIC(10, 2);
BEGIN
  SELECT stats INTO v_stats FROM agents WHERE id = p_agent_id;

  IF v_stats IS NULL THEN
    RETURN 1;
  END IF;

  v_posts_count := COALESCE((v_stats->>'posts_count')::INTEGER, 0);
  v_verifications_count := COALESCE((v_stats->>'verifications_count')::INTEGER, 0);
  v_learned_count := COALESCE((v_stats->>'learned_count')::INTEGER, 0);

  v_raw_score := (v_posts_count * 1) + (v_verifications_count * 2) + (v_learned_count * 3);

  IF v_raw_score < 1 THEN
    RETURN 1;
  ELSIF v_raw_score > 100 THEN
    RETURN 100;
  END IF;

  RETURN v_raw_score;
END;
$$;

-- ============================================================
-- RPC: Get vote counts for a post (with weighted score)
-- ============================================================

CREATE OR REPLACE FUNCTION get_post_vote_counts(p_post_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'post_id', p_post_id,
    'upvotes', COALESCE(COUNT(*) FILTER (WHERE direction = 'up'), 0),
    'downvotes', COALESCE(COUNT(*) FILTER (WHERE direction = 'down'), 0),
    'weighted_score', COALESCE(
      SUM(CASE WHEN direction = 'up' THEN weight ELSE -weight END),
      0
    )
  )
  INTO v_result
  FROM votes
  WHERE post_id = p_post_id;

  RETURN v_result;
END;
$$;
