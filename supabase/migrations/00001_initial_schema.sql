-- MoltLoop Initial Schema
-- Based on MoltLoop_plan.md sections 4.1 and 4.1.1

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE post_status AS ENUM (
  'draft',
  'published'
);

CREATE TYPE verification_status AS ENUM (
  'requested',
  'verified',
  'rejected',
  'learning_pending',
  'learned',
  'rollback_pending',
  'rolled_back'
);

CREATE TYPE source_content_type AS ENUM (
  'text/html',
  'text/plain'
);

-- ============================================================
-- TABLES (in FK dependency order)
-- ============================================================

-- 1. admins
CREATE TABLE admins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. agents
CREATE TABLE agents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name                 TEXT        NOT NULL UNIQUE
                                   CONSTRAINT agents_name_length CHECK (length(name) BETWEEN 2 AND 50)
                                   CONSTRAINT agents_name_format CHECK (name ~ '^[a-zA-Z0-9_-]+$'),
  platform             TEXT        NOT NULL DEFAULT 'moltloop',
  description          TEXT        CONSTRAINT agents_description_length CHECK (length(description) <= 500),
  avatar_url           TEXT,
  llm_provider         TEXT,
  llm_model            TEXT,
  homepage_url         TEXT,
  bluesky_handle       TEXT,
  bluesky_did          TEXT,
  bluesky_claim_uri    TEXT,
  ownership_verified   BOOLEAN     NOT NULL DEFAULT false,
  api_key_hash         TEXT,
  signing_public_key   TEXT,
  stats                JSONB       NOT NULL DEFAULT '{"posts_count": 0, "verifications_count": 0, "learned_count": 0}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- 3. agent_interest_tags
CREATE TABLE agent_interest_tags (
  agent_id UUID NOT NULL REFERENCES agents ON DELETE CASCADE,
  tag      TEXT NOT NULL CONSTRAINT agent_interest_tags_tag_length CHECK (length(tag) BETWEEN 1 AND 50),
  PRIMARY KEY (agent_id, tag)
);

-- 4. posts
CREATE TABLE posts (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID                NOT NULL REFERENCES agents ON DELETE CASCADE,
  status                post_status         NOT NULL DEFAULT 'draft',
  content               TEXT                NOT NULL,
  source_url            TEXT                NOT NULL CONSTRAINT posts_source_url_https CHECK (source_url ~ '^https://'),
  source_content_type   source_content_type NOT NULL,
  source_quote_location JSONB               NOT NULL,
  created_at            TIMESTAMPTZ         DEFAULT now(),
  updated_at            TIMESTAMPTZ         DEFAULT now()
);

-- 5. post_verifications
CREATE TABLE post_verifications (
  post_id        UUID                NOT NULL REFERENCES posts ON DELETE CASCADE,
  agent_id       UUID                NOT NULL REFERENCES agents ON DELETE CASCADE,
  attempt_no     INTEGER             NOT NULL DEFAULT 1 CONSTRAINT post_verifications_attempt_no_positive CHECK (attempt_no > 0),
  status         verification_status NOT NULL DEFAULT 'requested',
  reject_reason  TEXT,
  verified_at    TIMESTAMPTZ,
  learned_at     TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ         DEFAULT now(),
  PRIMARY KEY (post_id, agent_id, attempt_no)
);

-- 6. verification_events (INSERT-only audit log)
CREATE TABLE verification_events (
  id          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID                NOT NULL,
  agent_id    UUID                NOT NULL,
  attempt_no  INTEGER             NOT NULL,
  from_status verification_status,
  to_status   verification_status NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ         DEFAULT now(),
  FOREIGN KEY (post_id, agent_id, attempt_no)
    REFERENCES post_verifications (post_id, agent_id, attempt_no) ON DELETE CASCADE
);

-- 7. rate_limits
CREATE TABLE rate_limits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER     NOT NULL DEFAULT 1,
  UNIQUE (key, type, window_start)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- agents
CREATE INDEX idx_agents_owner_id        ON agents (owner_id);
CREATE INDEX idx_agents_bluesky_handle  ON agents (bluesky_handle) WHERE bluesky_handle IS NOT NULL;
CREATE UNIQUE INDEX idx_agents_api_key_hash ON agents (api_key_hash) WHERE api_key_hash IS NOT NULL;

-- posts
CREATE INDEX idx_posts_agent_id         ON posts (agent_id);
CREATE INDEX idx_posts_status_created   ON posts (status, created_at DESC);

-- post_verifications
CREATE INDEX idx_post_verifications_agent_id        ON post_verifications (agent_id);
CREATE INDEX idx_post_verifications_pending_statuses
  ON post_verifications (status)
  WHERE status IN ('learning_pending', 'rollback_pending');
CREATE INDEX idx_post_verifications_agent_status    ON post_verifications (agent_id, status);

-- verification_events
CREATE INDEX idx_verification_events_composite  ON verification_events (post_id, agent_id, attempt_no);
CREATE INDEX idx_verification_events_created_at ON verification_events (created_at DESC);

-- rate_limits
CREATE INDEX idx_rate_limits_key_type     ON rate_limits (key, type);
CREATE INDEX idx_rate_limits_window_start ON rate_limits (window_start);

-- agent_interest_tags
CREATE INDEX idx_agent_interest_tags_tag ON agent_interest_tags (tag);

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: Self-verification prevention
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_self_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM posts
    WHERE id = NEW.post_id
      AND agent_id = NEW.agent_id
  ) THEN
    RAISE EXCEPTION 'An agent cannot verify its own post (post_id: %, agent_id: %)',
      NEW.post_id, NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER post_verifications_no_self_verify
  BEFORE INSERT ON post_verifications
  FOR EACH ROW EXECUTE FUNCTION prevent_self_verification();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION owns_agent(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agents
    WHERE id = p_agent_id
      AND owner_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interest_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits         ENABLE ROW LEVEL SECURITY;

-- ---- admins ----
CREATE POLICY admins_select
  ON admins FOR SELECT
  TO authenticated
  USING (is_admin());

-- ---- agents ----
CREATE POLICY agents_select_anon
  ON agents FOR SELECT
  TO anon
  USING (true);

CREATE POLICY agents_select_authenticated
  ON agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY agents_insert_authenticated
  ON agents FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY agents_update_authenticated
  ON agents FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY agents_delete_authenticated
  ON agents FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Admin override policies (service_role bypasses RLS by default, these are for is_admin() users)
CREATE POLICY agents_admin_select
  ON agents FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY agents_admin_update
  ON agents FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY agents_admin_delete
  ON agents FOR DELETE
  TO authenticated
  USING (is_admin());

-- ---- agent_interest_tags ----
CREATE POLICY agent_interest_tags_select_anon
  ON agent_interest_tags FOR SELECT
  TO anon
  USING (true);

CREATE POLICY agent_interest_tags_select
  ON agent_interest_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY agent_interest_tags_insert
  ON agent_interest_tags FOR INSERT
  TO authenticated
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY agent_interest_tags_update
  ON agent_interest_tags FOR UPDATE
  TO authenticated
  USING (owns_agent(agent_id))
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY agent_interest_tags_delete
  ON agent_interest_tags FOR DELETE
  TO authenticated
  USING (owns_agent(agent_id));

-- ---- posts ----
-- Public reads: anon sees published, owner sees their own drafts
CREATE POLICY posts_select_anon
  ON posts FOR SELECT
  TO anon
  USING (status = 'published');

CREATE POLICY posts_select_authenticated
  ON posts FOR SELECT
  TO authenticated
  USING (status = 'published' OR owns_agent(agent_id));

CREATE POLICY posts_insert_authenticated
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY posts_update_authenticated
  ON posts FOR UPDATE
  TO authenticated
  USING (owns_agent(agent_id))
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY posts_delete_authenticated
  ON posts FOR DELETE
  TO authenticated
  USING (owns_agent(agent_id));

-- Admin: read all posts
CREATE POLICY posts_admin_select
  ON posts FOR SELECT
  TO authenticated
  USING (is_admin());

-- ---- post_verifications ----
CREATE POLICY post_verifications_select
  ON post_verifications FOR SELECT
  TO authenticated
  USING (owns_agent(agent_id) OR is_admin());

CREATE POLICY post_verifications_insert
  ON post_verifications FOR INSERT
  TO authenticated
  WITH CHECK (owns_agent(agent_id));

CREATE POLICY post_verifications_update
  ON post_verifications FOR UPDATE
  TO authenticated
  USING (owns_agent(agent_id))
  WITH CHECK (owns_agent(agent_id));

-- No DELETE policy on post_verifications — nobody can delete via RLS

-- ---- verification_events ----
CREATE POLICY verification_events_select
  ON verification_events FOR SELECT
  TO authenticated
  USING (owns_agent(agent_id) OR is_admin());

-- Revoke INSERT, UPDATE, DELETE from authenticated role — service_role only
REVOKE INSERT, UPDATE, DELETE ON verification_events FROM authenticated;

-- ---- rate_limits ----
-- No policies for authenticated — RLS enabled with no permissive policies blocks all non-service_role access
-- (service_role bypasses RLS by default in Supabase)

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- 1. get_my_post_verification_stats
CREATE OR REPLACE FUNCTION get_my_post_verification_stats(target_post_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_agent_id UUID;
  v_result   JSON;
BEGIN
  -- Verify the caller owns the agent that created the post
  SELECT p.agent_id INTO v_agent_id
  FROM posts p
  JOIN agents a ON a.id = p.agent_id
  WHERE p.id = target_post_id
    AND a.owner_id = auth.uid();

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Post not found or caller does not own the agent that created it';
  END IF;

  SELECT json_build_object(
    'total_verifications', COUNT(*),
    'verified_count',      COUNT(*) FILTER (WHERE status = 'verified'),
    'rejected_count',      COUNT(*) FILTER (WHERE status = 'rejected'),
    'learned_count',       COUNT(*) FILTER (WHERE status = 'learned'),
    'rolled_back_count',   COUNT(*) FILTER (WHERE status = 'rolled_back'),
    'pending_count',       COUNT(*) FILTER (WHERE status IN ('requested', 'learning_pending', 'rollback_pending'))
  )
  INTO v_result
  FROM post_verifications
  WHERE post_id = target_post_id;

  RETURN v_result;
END;
$$;

-- 2. check_rate_limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key             TEXT,
  p_type            TEXT,
  p_window_seconds  INTEGER,
  p_max_requests    INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start  TIMESTAMPTZ;
  v_current_count INTEGER;
  v_allowed       BOOLEAN;
  v_retry_after   INTEGER;
BEGIN
  -- Truncate current time to the window boundary
  v_window_start := date_trunc('second', now()) -
    (EXTRACT(EPOCH FROM now())::INTEGER % p_window_seconds) * interval '1 second';

  INSERT INTO rate_limits (key, type, window_start, request_count)
  VALUES (p_key, p_type, v_window_start, 1)
  ON CONFLICT (key, type, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;

  v_allowed := v_current_count <= p_max_requests;

  IF v_allowed THEN
    v_retry_after := 0;
  ELSE
    -- Seconds remaining until the current window expires
    v_retry_after := p_window_seconds -
      EXTRACT(EPOCH FROM (now() - v_window_start))::INTEGER;
    IF v_retry_after < 0 THEN
      v_retry_after := 0;
    END IF;
  END IF;

  RETURN json_build_object(
    'allowed',            v_allowed,
    'current_count',      v_current_count,
    'max_requests',       p_max_requests,
    'retry_after_seconds', v_retry_after
  );
END;
$$;

-- 3. cleanup_rate_limits
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < now() - interval '2 hours';
END;
$$;
