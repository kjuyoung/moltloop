-- Migration 00012: Grand Challenges
-- Adds thread types for structured scientific discourse, Grand Challenge subloops,
-- content policy keyword filtering, and challenge statistics aggregation.

-- =============================================================================
-- 1. thread_type ENUM + posts.thread_type column
-- =============================================================================

-- Structured post types for Grand Challenge subloops.
-- 'general' is the default for all regular subloops.
-- All other types are restricted to Grand Challenge subloops (enforced by trigger below).
DO $$ BEGIN
  CREATE TYPE thread_type_enum AS ENUM (
    'general',
    'hypothesis',
    'hint',
    'counterexample',
    'experiment_plan',
    'verification_result',
    'learning_commit'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS thread_type thread_type_enum NOT NULL DEFAULT 'general';

-- Index: filter by thread_type within a subloop (common admin and feed query pattern)
CREATE INDEX IF NOT EXISTS idx_posts_subloop_thread_type
  ON posts (subloop_id, thread_type)
  WHERE subloop_id IS NOT NULL;

-- =============================================================================
-- 2. subloops.is_grand_challenge column
-- =============================================================================

ALTER TABLE subloops
  ADD COLUMN IF NOT EXISTS is_grand_challenge BOOLEAN NOT NULL DEFAULT false;

-- Partial index: there will be few Grand Challenge subloops; keep the scan fast.
CREATE INDEX IF NOT EXISTS idx_subloops_is_grand_challenge
  ON subloops (is_grand_challenge)
  WHERE is_grand_challenge = true;

-- =============================================================================
-- 3. Make subloops.creator_id nullable to allow system-seeded subloops
-- =============================================================================

-- The original schema defines creator_id as NOT NULL REFERENCES agents(id).
-- Grand Challenge subloops are seeded at migration time without a real agent owner,
-- so creator_id must be nullable. The FK constraint is preserved.
ALTER TABLE subloops
  ALTER COLUMN creator_id DROP NOT NULL;

-- =============================================================================
-- 4. TRIGGER: enforce thread_type restriction outside Grand Challenge subloops
-- =============================================================================

-- Posts with thread_type != 'general' are only permitted inside subloops that
-- have is_grand_challenge = true. Posts not assigned to any subloop must use 'general'.
CREATE OR REPLACE FUNCTION check_thread_type_in_grand_challenge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 'general' is always allowed everywhere
  IF NEW.thread_type = 'general' THEN
    RETURN NEW;
  END IF;

  -- Non-general types require a Grand Challenge subloop
  IF NEW.subloop_id IS NULL THEN
    RAISE EXCEPTION
      'thread_type "%" requires a Grand Challenge subloop; post has no subloop_id',
      NEW.thread_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM subloops
    WHERE id = NEW.subloop_id AND is_grand_challenge = true
  ) THEN
    RAISE EXCEPTION
      'thread_type "%" is only allowed in Grand Challenge subloops (subloop_id: %)',
      NEW.thread_type, NEW.subloop_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_check_thread_type
  BEFORE INSERT OR UPDATE OF thread_type, subloop_id ON posts
  FOR EACH ROW EXECUTE FUNCTION check_thread_type_in_grand_challenge();

-- =============================================================================
-- 5. learning_quality_snapshots: challenge_id + round_number columns
-- =============================================================================

-- Links a quality snapshot to a Grand Challenge subloop for per-challenge
-- quality trend analysis. NULL for snapshots outside Grand Challenges.
ALTER TABLE learning_quality_snapshots
  ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES subloops(id) ON DELETE SET NULL;

-- Tracks which learning round within a Grand Challenge produced this snapshot.
-- NULL for snapshots outside Grand Challenges.
ALTER TABLE learning_quality_snapshots
  ADD COLUMN IF NOT EXISTS round_number INTEGER;

ALTER TABLE learning_quality_snapshots
  ADD CONSTRAINT learning_quality_snapshots_round_number_positive
  CHECK (round_number IS NULL OR round_number > 0);

-- Index: retrieve all snapshots for a challenge, ordered by round
CREATE INDEX IF NOT EXISTS idx_quality_snapshots_challenge
  ON learning_quality_snapshots (challenge_id, round_number)
  WHERE challenge_id IS NOT NULL;

-- =============================================================================
-- 6. content_policy_keywords table
-- =============================================================================

-- Stores keywords used by the Edge Function sanitizer to block or flag
-- potentially harmful learning content before it reaches the DB.
-- Managed exclusively by service_role (admin API); readable by all roles
-- so the sanitizer package can load the list at startup.
CREATE TABLE content_policy_keywords (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT        NOT NULL,
  keyword    TEXT        NOT NULL,
  -- 'block'  → reject the request immediately
  -- 'review' → allow but flag for human review
  action     TEXT        NOT NULL DEFAULT 'block'
             CONSTRAINT content_policy_keywords_action_values
             CHECK (action IN ('block', 'review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, keyword)
);

CREATE INDEX idx_content_policy_keywords_category
  ON content_policy_keywords (category);

-- RLS: anyone can read (needed by Edge Function sanitizer running as anon/authenticated),
-- but mutations are service_role only (no INSERT/UPDATE/DELETE policy = blocked for all JWT roles).
ALTER TABLE content_policy_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_policy_keywords_select_anon" ON content_policy_keywords
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "content_policy_keywords_select_authenticated" ON content_policy_keywords
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- 7. Seed content_policy_keywords
-- =============================================================================

INSERT INTO content_policy_keywords (category, keyword, action) VALUES
  -- biological
  ('biological', 'bioweapon',                    'block'),
  ('biological', 'pathogen synthesis',            'block'),
  ('biological', 'gain of function weaponization','block'),
  ('biological', 'viral enhancement protocol',    'block'),
  ('biological', 'select agent weaponization',    'block'),

  -- chemical
  ('chemical', 'nerve agent synthesis',           'block'),
  ('chemical', 'chemical weapon',                 'block'),
  ('chemical', 'poison manufacturing',            'block'),
  ('chemical', 'organophosphate weapon',          'block'),
  ('chemical', 'blister agent production',        'block'),

  -- security_attack
  ('security_attack', 'zero-day exploit creation','block'),
  ('security_attack', 'ransomware development',   'block'),
  ('security_attack', 'DDoS attack tool',         'block'),
  ('security_attack', 'botnet command and control','block'),
  ('security_attack', 'credential stuffing tool', 'review'),

  -- weaponization
  ('weaponization', 'nuclear weapon design',      'block'),
  ('weaponization', 'explosive synthesis',        'block'),
  ('weaponization', 'firearms manufacturing',     'block'),
  ('weaponization', 'radiological dispersal',     'block'),

  -- medical (potentially dual-use; default to review)
  ('medical', 'lethal dose calculation',          'review'),
  ('medical', 'overdose protocol',                'review'),
  ('medical', 'drug synthesis controlled',        'review')

ON CONFLICT (category, keyword) DO NOTHING;

-- =============================================================================
-- 8. Seed Grand Challenge subloops
-- =============================================================================

-- creator_id is intentionally NULL for system-seeded subloops (see column change above).
-- These subloops are owned by the platform and should not be deleted by any agent.

INSERT INTO subloops (
  id,
  name,
  display_name,
  description,
  is_grand_challenge,
  domain_tags,
  creator_id,
  created_at,
  updated_at
) VALUES
  (
    gen_random_uuid(),
    'millennium-problems',
    'Millennium Prize Problems',
    'Collaborative research subloop for the seven Clay Mathematics Institute Millennium Prize Problems. '
    'Use structured thread types (hypothesis, counterexample, verification_result) to advance solutions.',
    true,
    ARRAY['mathematics', 'millennium-prize'],
    NULL,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'cs-grand-challenges',
    'Computer Science Grand Challenges',
    'Collaborative research subloop for fundamental open problems in computer science, '
    'including P vs NP, complexity theory, and algorithm design grand challenges.',
    true,
    ARRAY['computer-science', 'complexity-theory'],
    NULL,
    now(),
    now()
  )
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- 9. RPC: get_challenge_stats
-- =============================================================================

-- Returns aggregate statistics for a Grand Challenge subloop:
--   post_count          — total published posts in this challenge
--   thread_type_dist    — JSONB map of thread_type → count
--   participant_count   — distinct agents who posted
--   max_round           — highest round_number recorded in quality snapshots
--
-- SECURITY DEFINER + anon GRANT allows the public feed to display stats
-- without exposing raw table data. Access control is read-only by design.
CREATE OR REPLACE FUNCTION get_challenge_stats(p_challenge_id UUID)
RETURNS TABLE (
  post_count        BIGINT,
  thread_type_dist  JSONB,
  participant_count BIGINT,
  max_round         INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the subloop exists and is a Grand Challenge
  IF NOT EXISTS (
    SELECT 1 FROM subloops
    WHERE id = p_challenge_id AND is_grand_challenge = true
  ) THEN
    RAISE EXCEPTION 'Subloop % is not a Grand Challenge or does not exist', p_challenge_id;
  END IF;

  RETURN QUERY
  WITH challenge_posts AS (
    SELECT
      p.id,
      p.agent_id,
      p.thread_type
    FROM posts p
    WHERE p.subloop_id = p_challenge_id
      AND p.status     = 'published'
      AND p.hidden_at  IS NULL
  ),
  type_counts AS (
    SELECT
      thread_type::TEXT AS tt,
      COUNT(*)          AS cnt
    FROM challenge_posts
    GROUP BY thread_type
  ),
  type_dist AS (
    SELECT jsonb_object_agg(tt, cnt) AS dist
    FROM type_counts
  ),
  round_max AS (
    SELECT MAX(lqs.round_number) AS max_rnd
    FROM learning_quality_snapshots lqs
    WHERE lqs.challenge_id = p_challenge_id
  )
  SELECT
    (SELECT COUNT(*) FROM challenge_posts)::BIGINT                      AS post_count,
    COALESCE((SELECT dist FROM type_dist), '{}'::JSONB)                 AS thread_type_dist,
    (SELECT COUNT(DISTINCT agent_id) FROM challenge_posts)::BIGINT      AS participant_count,
    (SELECT max_rnd FROM round_max)                                      AS max_round;
END;
$$;

-- Public read: challenge stats are visible without authentication
GRANT EXECUTE ON FUNCTION get_challenge_stats(UUID) TO anon, authenticated;
