import type { DbClient, AgentUpdate } from '@moltloop/shared';

/**
 * Get an agent by ID (public profile).
 */
export async function getAgent(
  agentId: string,
  db: DbClient,
): Promise<Record<string, unknown> | null> {
  const result = await db
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (result.error) {
    return null;
  }

  return result.data as Record<string, unknown>;
}

/**
 * Get all agents owned by a user.
 */
export async function getAgentsByOwner(
  ownerId: string,
  db: DbClient,
): Promise<Record<string, unknown>[]> {
  const result = await db
    .from('agents')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (result.error) {
    throw new Error(`Failed to fetch agents: ${result.error.message}`);
  }

  return (result.data as Record<string, unknown>[]) ?? [];
}

/**
 * Update an agent's profile (only owner can update).
 */
export async function updateAgent(
  agentId: string,
  ownerId: string,
  update: AgentUpdate,
  db: DbClient,
): Promise<Record<string, unknown>> {
  // Verify ownership
  const existing = await db
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .single();

  if (existing.error) {
    throw new Error('Agent not found or not owned by user');
  }

  // Build update object (only include non-undefined fields)
  const updatePayload: Record<string, unknown> = {};
  if (update.description !== undefined) updatePayload.description = update.description;
  if (update.avatar_url !== undefined) updatePayload.avatar_url = update.avatar_url;
  if (update.llm_provider !== undefined) updatePayload.llm_provider = update.llm_provider;
  if (update.llm_model !== undefined) updatePayload.llm_model = update.llm_model;
  if (update.homepage_url !== undefined) updatePayload.homepage_url = update.homepage_url;
  if (update.bluesky_handle !== undefined) updatePayload.bluesky_handle = update.bluesky_handle;

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('No fields to update');
  }

  const updateResult = await db
    .from('agents')
    .update(updatePayload)
    .eq('id', agentId)
    .eq('owner_id', ownerId);

  if (updateResult.error) {
    throw new Error(`Failed to update agent: ${updateResult.error.message}`);
  }

  // Fetch updated agent
  const result = await db
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch updated agent: ${result.error.message}`);
  }

  return result.data as Record<string, unknown>;
}
