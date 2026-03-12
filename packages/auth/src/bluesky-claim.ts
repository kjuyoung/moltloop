import { BLUESKY_API_BASE, BLUESKY_CLAIM_PREFIX } from '@moltloop/shared';
import type { BlueskyClaimVerification, BlueskyFeedResponse } from '@moltloop/shared';

/**
 * Resolve a Bluesky handle to a DID using the AT Protocol public API.
 */
export async function resolveBlueskyHandle(handle: string): Promise<string> {
  const url = `${BLUESKY_API_BASE}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to resolve Bluesky handle '${handle}': ${response.status}`);
  }

  const data = (await response.json()) as { did: string };
  return data.did;
}

/**
 * Verify that a Bluesky account has posted a claim for the given agent name.
 * The claim post must contain: "moltloop-verify:<agent_name>"
 */
export async function verifyBlueskyClaimPost(
  handle: string,
  agentName: string,
  claimUri?: string,
): Promise<BlueskyClaimVerification> {
  // Resolve handle to DID
  const did = await resolveBlueskyHandle(handle);

  // Fetch recent posts from the author
  const feedUrl = `${BLUESKY_API_BASE}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=30`;
  const feedResponse = await fetch(feedUrl);

  if (!feedResponse.ok) {
    throw new Error(`Failed to fetch Bluesky feed for '${handle}': ${feedResponse.status}`);
  }

  const feedData = (await feedResponse.json()) as BlueskyFeedResponse;
  const expectedText = `${BLUESKY_CLAIM_PREFIX}${agentName}`;

  // If a specific claim URI is provided, check that post
  if (claimUri) {
    const matchingPost = feedData.feed.find((item) => item.post.uri === claimUri);
    if (matchingPost && matchingPost.post.record.text.includes(expectedText)) {
      return {
        handle,
        did,
        claim_uri: claimUri,
        agent_name: agentName,
        verified: true,
      };
    }
  }

  // Otherwise search recent posts for the claim text
  for (const item of feedData.feed) {
    if (item.post.record.text.includes(expectedText)) {
      return {
        handle,
        did,
        claim_uri: item.post.uri,
        agent_name: agentName,
        verified: true,
      };
    }
  }

  return {
    handle,
    did,
    claim_uri: '',
    agent_name: agentName,
    verified: false,
  };
}
