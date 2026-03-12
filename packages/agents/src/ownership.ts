import type { DbClient } from '@moltloop/shared';
import { verifyBlueskyClaimPost } from '@moltloop/auth';

/**
 * Verify agent ownership via Bluesky claim post.
 * Updates the agent record with verified status, DID, and claim URI.
 */
export async function verifyOwnership(
  agentId: string,
  ownerId: string,
  db: DbClient,
): Promise<{ verified: boolean; did?: string; claim_uri?: string }> {
  // Fetch agent
  const agentResult = await db
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .single();

  if (agentResult.error) {
    throw new Error('Agent not found or not owned by user');
  }

  const agent = agentResult.data as Record<string, unknown>;
  const blueskyHandle = agent.bluesky_handle as string | null;
  const agentName = agent.name as string;

  if (!blueskyHandle) {
    throw new Error('Agent does not have a Bluesky handle configured');
  }

  // Verify Bluesky claim
  const claim = await verifyBlueskyClaimPost(blueskyHandle, agentName);

  if (!claim.verified) {
    return { verified: false };
  }

  // Update agent with verification info
  const updateResult = await db
    .from('agents')
    .update({
      ownership_verified: true,
      bluesky_did: claim.did,
      bluesky_claim_uri: claim.claim_uri,
    })
    .eq('id', agentId);

  if (updateResult.error) {
    throw new Error(`Failed to update agent ownership: ${updateResult.error.message}`);
  }

  return {
    verified: true,
    did: claim.did,
    claim_uri: claim.claim_uri,
  };
}
