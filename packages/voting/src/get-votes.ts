import type { DbClient, VoteCount } from '@moltloop/shared';

export async function getVoteCounts(
  db: DbClient,
  postId: string,
): Promise<VoteCount> {
  const { data, error } = await db.rpc('get_post_vote_counts', {
    p_post_id: postId,
  });

  if (error) {
    throw new Error(`Failed to get vote counts: ${error.message}`);
  }

  return data as unknown as VoteCount;
}
