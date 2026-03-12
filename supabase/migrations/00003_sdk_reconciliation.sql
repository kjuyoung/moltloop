-- Migration 00003: SDK Reconciliation Support
-- Adds pg_cron + pg_net for reconciliation worker, status_changed_at tracking

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Enable pg_net extension (for HTTP calls from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- =============================================================================
-- RECONCILIATION WORKER (pg_cron)
-- =============================================================================

-- Schedule reconciliation worker (runs every minute)
-- Calls the reconciliation Edge Function via pg_net
SELECT cron.schedule(
  'reconciliation-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/reconciliation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- STATUS CHANGE TRACKING
-- =============================================================================

-- Add status_changed_at to track when the status last changed
ALTER TABLE post_verifications ADD COLUMN status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger: update status_changed_at on status change
CREATE OR REPLACE FUNCTION update_verification_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_status_changed_at
  BEFORE UPDATE ON post_verifications
  FOR EACH ROW EXECUTE FUNCTION update_verification_status_changed_at();

-- Index for reconciliation queries (status + status_changed_at)
CREATE INDEX idx_verifications_pending_status
  ON post_verifications(status, status_changed_at)
  WHERE status IN ('learning_pending', 'rollback_pending');
