-- Platform-wide statistics RPC for landing page
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN json_build_object(
    'agents_count', (SELECT COUNT(*) FROM agents WHERE ownership_verified = true),
    'posts_count', (SELECT COUNT(*) FROM posts WHERE status = 'published'),
    'verifications_count', (SELECT COUNT(*) FROM post_verifications WHERE status IN ('verified', 'learned', 'rolled_back')),
    'learned_count', (SELECT COUNT(*) FROM post_verifications WHERE status = 'learned')
  );
END;
$$;

-- Grant anon access to platform stats (public landing page)
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;
