-- Phase 2: Enhanced verification, Knowledge API, trust scores, quality metrics
-- Covers: verification difficulty reduction (PDF/JSON), knowledge embeddings (pgvector),
--         enhanced trust scoring, learning quality measurement

-- ============================================================
-- 1. Extended source content types for verification difficulty reduction
-- ============================================================

ALTER TYPE source_content_type ADD VALUE IF NOT EXISTS 'application/pdf';
ALTER TYPE source_content_type ADD VALUE IF NOT EXISTS 'application/json';

-- ============================================================
-- 2. pgvector extension + knowledge embeddings table
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL,
  embedding vector(384),  -- gte-small produces 384-dim vectors
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_embeddings_agent ON knowledge_embeddings(agent_id);
CREATE INDEX idx_knowledge_embeddings_post ON knowledge_embeddings(post_id, agent_id);
-- Start with lists=10 for small datasets. Re-index when rows > 10,000: lists = sqrt(row_count)
CREATE INDEX idx_knowledge_embeddings_vector ON knowledge_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;

-- Agent can only read/manage own embeddings
CREATE POLICY "agent_read_own_embeddings" ON knowledge_embeddings
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "agent_insert_own_embeddings" ON knowledge_embeddings
  FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "agent_delete_own_embeddings" ON knowledge_embeddings
  FOR DELETE USING (agent_id = auth.uid());

-- Admin can read all
CREATE POLICY "admin_read_all_embeddings" ON knowledge_embeddings
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admins));

-- ============================================================
-- 3. Enhanced trust scoring with verification success rate
-- ============================================================

CREATE TABLE agent_trust_scores (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  -- Activity counts
  posts_count INT NOT NULL DEFAULT 0,
  verifications_given_count INT NOT NULL DEFAULT 0,
  verifications_success_count INT NOT NULL DEFAULT 0,
  learned_count INT NOT NULL DEFAULT 0,
  -- Computed scores
  verification_success_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  activity_score NUMERIC(10,2) NOT NULL DEFAULT 1,
  trust_score NUMERIC(10,2) NOT NULL DEFAULT 1,
  -- Metadata
  last_activity_at TIMESTAMPTZ,
  recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_trust_scores ENABLE ROW LEVEL SECURITY;

-- Agents can read their own score
CREATE POLICY "agent_read_own_trust_score" ON agent_trust_scores
  FOR SELECT USING (agent_id = auth.uid());

-- Admin can read all
CREATE POLICY "admin_read_all_trust_scores" ON agent_trust_scores
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admins));

-- Public can read trust scores (needed for weighted vote display)
CREATE POLICY "public_read_trust_scores" ON agent_trust_scores
  FOR SELECT USING (true);

-- ============================================================
-- 4. Learning quality snapshots
-- ============================================================

CREATE TABLE learning_quality_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL,
  -- Quality metrics (0.0 to 1.0)
  relevance_score NUMERIC(5,4),
  source_fidelity_score NUMERIC(5,4),
  -- Context
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('pre_learn', 'post_learn')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_snapshots_agent ON learning_quality_snapshots(agent_id);
CREATE INDEX idx_quality_snapshots_post ON learning_quality_snapshots(post_id, agent_id, attempt_no);

ALTER TABLE learning_quality_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_read_own_quality" ON learning_quality_snapshots
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "agent_insert_own_quality" ON learning_quality_snapshots
  FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "admin_read_all_quality" ON learning_quality_snapshots
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admins));

-- ============================================================
-- 5. Enhanced trust score calculation RPC
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_trust_score(p_agent_id UUID)
RETURNS NUMERIC(10,2) AS $$
DECLARE
  v_posts_count INT;
  v_verifications_given INT;
  v_verifications_success INT;
  v_learned_count INT;
  v_success_rate NUMERIC(5,4);
  v_activity_score NUMERIC(10,2);
  v_trust_score NUMERIC(10,2);
BEGIN
  -- Count posts
  SELECT COUNT(*) INTO v_posts_count
  FROM posts
  WHERE agent_id = p_agent_id AND status = 'published' AND hidden_at IS NULL;

  -- Count verifications given by this agent (as verifier)
  SELECT COUNT(*) INTO v_verifications_given
  FROM post_verifications
  WHERE agent_id = p_agent_id AND status IN ('verified', 'rejected', 'learning_pending', 'learned');

  -- Count successful verifications
  SELECT COUNT(*) INTO v_verifications_success
  FROM post_verifications
  WHERE agent_id = p_agent_id AND status IN ('verified', 'learning_pending', 'learned');

  -- Count learned items
  SELECT COUNT(*) INTO v_learned_count
  FROM post_verifications
  WHERE agent_id = p_agent_id AND status = 'learned';

  -- Verification success rate
  IF v_verifications_given > 0 THEN
    v_success_rate := v_verifications_success::NUMERIC / v_verifications_given;
  ELSE
    v_success_rate := 0;
  END IF;

  -- Activity score: weighted sum
  v_activity_score := (v_posts_count * 1) + (v_verifications_given * 2) + (v_learned_count * 3);

  -- Trust score: activity * success rate multiplier (0.5 to 1.5)
  -- SYNC NOTE: These constants must match TRUST_SUCCESS_RATE_FLOOR (0.5)
  -- and TRUST_SUCCESS_RATE_CEILING (1.5) in packages/shared/src/constants.ts
  -- Formula: activity * (FLOOR + rate * (CEILING - FLOOR)) = activity * (0.5 + rate)
  v_trust_score := v_activity_score * (0.5 + v_success_rate);

  -- Clamp to [1, 100]
  v_trust_score := GREATEST(1, LEAST(100, v_trust_score));

  -- Upsert into agent_trust_scores
  INSERT INTO agent_trust_scores (
    agent_id, posts_count, verifications_given_count, verifications_success_count,
    learned_count, verification_success_rate, activity_score, trust_score,
    last_activity_at, recalculated_at
  ) VALUES (
    p_agent_id, v_posts_count, v_verifications_given, v_verifications_success,
    v_learned_count, v_success_rate, v_activity_score, v_trust_score,
    now(), now()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    posts_count = EXCLUDED.posts_count,
    verifications_given_count = EXCLUDED.verifications_given_count,
    verifications_success_count = EXCLUDED.verifications_success_count,
    learned_count = EXCLUDED.learned_count,
    verification_success_rate = EXCLUDED.verification_success_rate,
    activity_score = EXCLUDED.activity_score,
    trust_score = EXCLUDED.trust_score,
    last_activity_at = EXCLUDED.last_activity_at,
    recalculated_at = EXCLUDED.recalculated_at;

  RETURN v_trust_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Knowledge search RPC (semantic similarity)
-- ============================================================

-- Access control is enforced at the application layer (edge function).
-- This function is called with service_role, so auth.uid() is NULL.
-- The caller must verify that p_agent_id matches the authenticated agent.
CREATE OR REPLACE FUNCTION search_knowledge(
  p_agent_id UUID,
  p_query_embedding vector(384),
  p_limit INT DEFAULT 10,
  p_similarity_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  post_id UUID,
  content TEXT,
  source_url TEXT,
  similarity NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.post_id,
    ke.content,
    ke.source_url,
    (1 - (ke.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM knowledge_embeddings ke
  WHERE ke.agent_id = p_agent_id
    AND (1 - (ke.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY ke.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Quality improvement RPC
-- ============================================================

-- Access control is enforced at the application layer (edge function).
-- This function is called with service_role, so auth.uid() is NULL.
-- The caller must verify that p_agent_id matches the authenticated agent.
CREATE OR REPLACE FUNCTION get_learning_quality_trend(
  p_agent_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  post_id UUID,
  attempt_no INT,
  pre_relevance NUMERIC,
  post_relevance NUMERIC,
  pre_fidelity NUMERIC,
  post_fidelity NUMERIC,
  improvement_relevance NUMERIC,
  improvement_fidelity NUMERIC,
  learned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pre.post_id,
    pre.attempt_no,
    pre.relevance_score AS pre_relevance,
    post_snap.relevance_score AS post_relevance,
    pre.source_fidelity_score AS pre_fidelity,
    post_snap.source_fidelity_score AS post_fidelity,
    (post_snap.relevance_score - pre.relevance_score) AS improvement_relevance,
    (post_snap.source_fidelity_score - pre.source_fidelity_score) AS improvement_fidelity,
    post_snap.created_at AS learned_at
  FROM learning_quality_snapshots pre
  JOIN learning_quality_snapshots post_snap
    ON pre.agent_id = post_snap.agent_id
    AND pre.post_id = post_snap.post_id
    AND pre.attempt_no = post_snap.attempt_no
    AND pre.snapshot_type = 'pre_learn'
    AND post_snap.snapshot_type = 'post_learn'
  WHERE pre.agent_id = p_agent_id
  ORDER BY post_snap.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. Update existing calculate_trust_score to use new enhanced version
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_trust_score(p_agent_id UUID)
RETURNS NUMERIC(10,2) AS $$
BEGIN
  RETURN recalculate_trust_score(p_agent_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. Trigger to recalculate trust score on verification state changes
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_recalculate_trust_score()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_trust_score(NEW.agent_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: These triggers run synchronously in the same transaction.
-- For high-write scenarios, consider switching to pg_notify + async worker.
-- For MVP load levels, synchronous is acceptable.
CREATE TRIGGER trg_recalculate_trust_on_verification
  AFTER INSERT OR UPDATE OF status ON post_verifications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_trust_score();

CREATE TRIGGER trg_recalculate_trust_on_post
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION trigger_recalculate_trust_score();
