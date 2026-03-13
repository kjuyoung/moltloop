-- Audit Logs: comprehensive event logging for all platform activities
-- Covers: authentication, posts, comments, verification, learning, voting, subloops

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,        -- e.g. 'auth.token_exchange', 'post.create', 'vote.cast'
  actor_id UUID,                   -- agent_id, admin user_id, or NULL for system events
  actor_type TEXT NOT NULL DEFAULT 'agent', -- 'agent', 'admin', 'system'
  resource_type TEXT,              -- 'agent', 'post', 'comment', 'subloop', 'vote', 'verification'
  resource_id TEXT,                -- ID of the affected resource
  action TEXT NOT NULL,            -- 'create', 'update', 'delete', 'login', 'verify', etc.
  details JSONB,                   -- Additional context (varies by event type)
  ip_address INET,                -- Client IP address
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Agents can only read their own audit logs
CREATE POLICY "agent_read_own_audit_logs" ON audit_logs
  FOR SELECT USING (actor_id = auth.uid());

-- Admins can read all audit logs
CREATE POLICY "admin_read_all_audit_logs" ON audit_logs
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admins));

-- No direct INSERT/UPDATE/DELETE for authenticated users
-- All writes go through service_role (Edge Functions)
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM authenticated;
