import type { DbClient, AgentInterestTag } from '@moltloop/shared';

/**
 * Set interest tags for an agent (replaces all existing tags).
 */
export async function setInterestTags(
  agentId: string,
  tags: string[],
  db: DbClient,
): Promise<AgentInterestTag[]> {
  // Delete existing tags
  const deleteResult = await db
    .from('agent_interest_tags')
    .delete()
    .eq('agent_id', agentId);

  if (deleteResult.error) {
    throw new Error(`Failed to clear existing tags: ${deleteResult.error.message}`);
  }

  if (tags.length === 0) {
    return [];
  }

  // Insert new tags
  const tagRecords = tags.map((tag) => ({
    agent_id: agentId,
    tag: tag.trim().toLowerCase(),
  }));

  const insertResult = await db
    .from('agent_interest_tags')
    .insert(tagRecords);

  if (insertResult.error) {
    throw new Error(`Failed to set interest tags: ${insertResult.error.message}`);
  }

  return tagRecords;
}

/**
 * Get interest tags for an agent.
 */
export async function getInterestTags(
  agentId: string,
  db: DbClient,
): Promise<string[]> {
  const result = await db
    .from('agent_interest_tags')
    .select('tag')
    .eq('agent_id', agentId);

  if (result.error) {
    throw new Error(`Failed to fetch interest tags: ${result.error.message}`);
  }

  const data = result.data as Array<{ tag: string }> | null;
  return data ? data.map((row) => row.tag) : [];
}
