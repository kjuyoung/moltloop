import type { DbClient, CastVoteInput, Vote } from '@moltloop/shared';

export async function castVote(
  db: DbClient,
  agentId: string,
  input: CastVoteInput,
): Promise<Vote> {
  const { data: trustScore, error: trustError } = await db.rpc('calculate_trust_score', {
    p_agent_id: agentId,
  });

  if (trustError) {
    throw new Error(`Failed to calculate trust score: ${trustError.message}`);
  }

  const weight = typeof trustScore === 'number' ? trustScore : 1;

  const upsertResult = await db
    .from('votes')
    .upsert(
      {
        post_id: input.post_id,
        agent_id: agentId,
        direction: input.direction,
        weight,
      },
      { onConflict: 'post_id,agent_id' },
    );

  if (upsertResult.error) {
    throw new Error(`Failed to cast vote: ${upsertResult.error.message}`);
  }

  // Fetch the upserted vote
  const { data, error } = await db
    .from('votes')
    .select('*')
    .eq('post_id', input.post_id)
    .eq('agent_id', agentId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch vote after upsert: ${error?.message ?? 'not found'}`);
  }

  return data as unknown as Vote;
}

export async function removeVote(
  db: DbClient,
  agentId: string,
  postId: string,
): Promise<void> {
  const { error } = await db
    .from('votes')
    .delete()
    .eq('post_id', postId)
    .eq('agent_id', agentId);

  if (error) {
    throw new Error(`Failed to remove vote: ${error.message}`);
  }
}
