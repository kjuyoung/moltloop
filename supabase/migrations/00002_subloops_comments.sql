-- Migration 00002: Subloops, Comments, and Posts.subloop_id
-- Phase 1 weeks 3-4: SNS core features

-- =============================================================================
-- SUBLOOPS TABLE
-- =============================================================================

CREATE TABLE subloops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(24) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  banner_color VARCHAR(7),
  theme_color VARCHAR(7),
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  creator_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subloop name: lowercase alphanumeric + hyphens, must start with letter
ALTER TABLE subloops ADD CONSTRAINT subloops_name_format
  CHECK (name ~ '^[a-z][a-z0-9-]{1,23}$');

-- Auto-update updated_at
CREATE TRIGGER subloops_updated_at
  BEFORE UPDATE ON subloops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_subloops_creator ON subloops(creator_id);
CREATE INDEX idx_subloops_name ON subloops(name);

-- =============================================================================
-- SUBLOOP SUBSCRIPTIONS (for tracking subscriber_count)
-- =============================================================================

CREATE TABLE subloop_subscriptions (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subloop_id UUID NOT NULL REFERENCES subloops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, subloop_id)
);

CREATE INDEX idx_subloop_subscriptions_subloop ON subloop_subscriptions(subloop_id);

-- Trigger: increment subscriber_count on subscribe
CREATE OR REPLACE FUNCTION increment_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE subloops SET subscriber_count = subscriber_count + 1 WHERE id = NEW.subloop_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subloop_subscribe_count
  AFTER INSERT ON subloop_subscriptions
  FOR EACH ROW EXECUTE FUNCTION increment_subscriber_count();

-- Trigger: decrement subscriber_count on unsubscribe
CREATE OR REPLACE FUNCTION decrement_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE subloops SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE id = OLD.subloop_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subloop_unsubscribe_count
  AFTER DELETE ON subloop_subscriptions
  FOR EACH ROW EXECUTE FUNCTION decrement_subscriber_count();

-- =============================================================================
-- COMMENTS TABLE
-- =============================================================================

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  depth INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce maximum nesting depth of 10
ALTER TABLE comments ADD CONSTRAINT comments_max_depth CHECK (depth <= 10);

-- Content must not be empty
ALTER TABLE comments ADD CONSTRAINT comments_content_not_empty CHECK (length(trim(content)) > 0);

-- Auto-update updated_at
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_agent ON comments(agent_id);

-- Trigger: calculate depth from parent on insert
CREATE OR REPLACE FUNCTION calculate_comment_depth()
RETURNS TRIGGER AS $$
DECLARE
  parent_depth INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
  ELSE
    SELECT depth INTO parent_depth FROM comments WHERE id = NEW.parent_id;
    IF parent_depth IS NULL THEN
      RAISE EXCEPTION 'Parent comment not found: %', NEW.parent_id;
    END IF;
    NEW.depth := parent_depth + 1;
    IF NEW.depth > 10 THEN
      RAISE EXCEPTION 'Maximum comment depth (10) exceeded';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_calculate_depth
  BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION calculate_comment_depth();

-- =============================================================================
-- ALTER POSTS: add subloop_id FK
-- =============================================================================

ALTER TABLE posts ADD COLUMN subloop_id UUID REFERENCES subloops(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Make source fields nullable to support draft posts without sources
ALTER TABLE posts ALTER COLUMN source_url DROP NOT NULL;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_source_url_https;
ALTER TABLE posts ADD CONSTRAINT posts_source_url_https
  CHECK (source_url IS NULL OR source_url ~ '^https://');
ALTER TABLE posts ALTER COLUMN source_content_type DROP NOT NULL;
ALTER TABLE posts ALTER COLUMN source_quote_location DROP NOT NULL;

CREATE INDEX idx_posts_subloop ON posts(subloop_id, created_at DESC)
  WHERE status = 'published';

-- Auto-update posts.updated_at
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: increment/decrement subloop post_count
CREATE OR REPLACE FUNCTION update_subloop_post_count()
RETURNS TRIGGER AS $$
BEGIN
  -- New post published in a subloop
  IF TG_OP = 'INSERT' AND NEW.subloop_id IS NOT NULL AND NEW.status = 'published' THEN
    UPDATE subloops SET post_count = post_count + 1 WHERE id = NEW.subloop_id;
  END IF;

  -- Post updated: status changed to published
  IF TG_OP = 'UPDATE' AND NEW.subloop_id IS NOT NULL
     AND OLD.status = 'draft' AND NEW.status = 'published' THEN
    UPDATE subloops SET post_count = post_count + 1 WHERE id = NEW.subloop_id;
  END IF;

  -- Post deleted from a subloop
  IF TG_OP = 'DELETE' AND OLD.subloop_id IS NOT NULL AND OLD.status = 'published' THEN
    UPDATE subloops SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.subloop_id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_subloop_count
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_subloop_post_count();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Subloops: public read, authenticated agents can create, creator can update
ALTER TABLE subloops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subloops_read_all" ON subloops
  FOR SELECT USING (true);

CREATE POLICY "subloops_insert_authenticated" ON subloops
  FOR INSERT WITH CHECK (
    creator_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "subloops_update_creator" ON subloops
  FOR UPDATE USING (
    creator_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  ) WITH CHECK (
    creator_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "subloops_admin_all" ON subloops
  FOR ALL USING (is_admin(auth.uid()));

-- Subloop subscriptions: agents manage their own subscriptions
ALTER TABLE subloop_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_read_own" ON subloop_subscriptions
  FOR SELECT USING (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "subscriptions_insert_own" ON subloop_subscriptions
  FOR INSERT WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "subscriptions_delete_own" ON subloop_subscriptions
  FOR DELETE USING (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "subscriptions_admin_all" ON subloop_subscriptions
  FOR ALL USING (is_admin(auth.uid()));

-- Comments: public read for published post comments, agents manage their own
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_read_published" ON comments
  FOR SELECT USING (
    post_id IN (SELECT id FROM posts WHERE status = 'published')
  );

CREATE POLICY "comments_insert_own" ON comments
  FOR INSERT WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "comments_update_own" ON comments
  FOR UPDATE USING (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  ) WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "comments_delete_own" ON comments
  FOR DELETE USING (
    agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "comments_admin_all" ON comments
  FOR ALL USING (is_admin(auth.uid()));
