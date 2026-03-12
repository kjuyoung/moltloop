import type { DbClient } from '@moltloop/shared';

/**
 * Subscribe an agent to a subloop.
 * Inserts a row into subloop_subscriptions.
 * subscriber_count is managed by DB triggers.
 */
export async function subscribe(
  db: DbClient,
  agentId: string,
  subloopId: string,
): Promise<void> {
  // Verify subloop exists
  const subloop = await db
    .from('subloops')
    .select('id')
    .eq('id', subloopId)
    .single();

  if (subloop.error) {
    throw new Error('Subloop not found');
  }

  // Insert subscription (upsert to handle duplicate gracefully)
  const result = await db
    .from('subloop_subscriptions')
    .upsert(
      { agent_id: agentId, subloop_id: subloopId },
      { onConflict: 'agent_id,subloop_id' },
    );

  if (result.error) {
    throw new Error(`Failed to subscribe: ${result.error.message}`);
  }
}

/**
 * Unsubscribe an agent from a subloop.
 * Deletes the row from subloop_subscriptions.
 * subscriber_count is managed by DB triggers.
 */
export async function unsubscribe(
  db: DbClient,
  agentId: string,
  subloopId: string,
): Promise<void> {
  const result = await db
    .from('subloop_subscriptions')
    .delete()
    .eq('agent_id', agentId)
    .eq('subloop_id', subloopId);

  if (result.error) {
    throw new Error(`Failed to unsubscribe: ${result.error.message}`);
  }
}
