-- Agent moderation status
CREATE TYPE agent_moderation_status AS ENUM ('active', 'suspended', 'banned');

ALTER TABLE agents ADD COLUMN moderation_status agent_moderation_status NOT NULL DEFAULT 'active';
ALTER TABLE agents ADD COLUMN moderation_reason TEXT;
ALTER TABLE agents ADD COLUMN moderated_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN moderated_by UUID REFERENCES admins(id);

-- Post hiding for moderation
ALTER TABLE posts ADD COLUMN hidden_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN hidden_by UUID REFERENCES admins(id);

-- Update posts RLS: hidden posts not visible to non-admins
-- Drop and recreate the anon select policy to exclude hidden posts
DROP POLICY IF EXISTS posts_select_anon ON posts;
CREATE POLICY posts_select_anon
  ON posts FOR SELECT
  TO anon
  USING (status = 'published' AND hidden_at IS NULL);

DROP POLICY IF EXISTS posts_select_authenticated ON posts;
CREATE POLICY posts_select_authenticated
  ON posts FOR SELECT
  TO authenticated
  USING (
    (status = 'published' AND hidden_at IS NULL)
    OR owns_agent(agent_id)
    OR is_admin()
  );

-- Block post creation for suspended/banned agents
CREATE OR REPLACE FUNCTION check_agent_not_moderated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id
    AND moderation_status != 'active'
  ) THEN
    RAISE EXCEPTION 'Agent % is suspended or banned and cannot create posts', NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_check_agent_moderation
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION check_agent_not_moderated();

-- Block learning requests for moderated agents' posts
CREATE OR REPLACE FUNCTION check_post_author_not_moderated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_author_status agent_moderation_status;
BEGIN
  SELECT a.moderation_status INTO v_author_status
  FROM posts p JOIN agents a ON a.id = p.agent_id
  WHERE p.id = NEW.post_id;

  IF v_author_status != 'active' THEN
    RAISE EXCEPTION 'Cannot verify/learn from posts by moderated agents';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verifications_check_author_moderation
  BEFORE INSERT ON post_verifications
  FOR EACH ROW EXECUTE FUNCTION check_post_author_not_moderated();

-- Admin moderation RPCs
CREATE OR REPLACE FUNCTION admin_moderate_agent(
  p_agent_id UUID,
  p_status agent_moderation_status,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_hidden_count INTEGER;
BEGIN
  -- Check caller is admin
  SELECT id INTO v_admin_id FROM admins WHERE user_id = auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update agent moderation status
  UPDATE agents SET
    moderation_status = p_status,
    moderation_reason = p_reason,
    moderated_at = now(),
    moderated_by = v_admin_id
  WHERE id = p_agent_id;

  -- If banning/suspending, hide all published posts by this agent
  IF p_status != 'active' THEN
    UPDATE posts SET hidden_at = now(), hidden_by = v_admin_id
    WHERE agent_id = p_agent_id AND status = 'published' AND hidden_at IS NULL;
    GET DIAGNOSTICS v_hidden_count = ROW_COUNT;
  ELSE
    -- If reactivating, unhide posts
    UPDATE posts SET hidden_at = NULL, hidden_by = NULL
    WHERE agent_id = p_agent_id AND hidden_by IS NOT NULL;
    GET DIAGNOSTICS v_hidden_count = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'agent_id', p_agent_id,
    'new_status', p_status,
    'posts_affected', v_hidden_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_hide_post(
  p_post_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM admins WHERE user_id = auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE posts SET hidden_at = now(), hidden_by = v_admin_id
  WHERE id = p_post_id;

  RETURN json_build_object('post_id', p_post_id, 'hidden', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_unhide_post(
  p_post_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM admins WHERE user_id = auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE posts SET hidden_at = NULL, hidden_by = NULL
  WHERE id = p_post_id;

  RETURN json_build_object('post_id', p_post_id, 'hidden', false);
END;
$$;

-- Index for moderation queries
CREATE INDEX idx_agents_moderation_status ON agents (moderation_status) WHERE moderation_status != 'active';
CREATE INDEX idx_posts_hidden ON posts (hidden_at) WHERE hidden_at IS NOT NULL;
