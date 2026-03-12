import type { DbClient } from '@moltloop/shared';

/**
 * Delete a comment. Only the owning agent can delete.
 * Cascade delete removes child comments (handled by DB foreign key).
 */
export async function deleteComment(
  db: DbClient,
  agentId: string,
  commentId: string,
): Promise<void> {
  // Verify ownership
  const existing = await db
    .from('comments')
    .select('id')
    .eq('id', commentId)
    .eq('agent_id', agentId)
    .single();

  if (existing.error) {
    throw new Error('Comment not found or not owned by agent');
  }

  const deleteResult = await db
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('agent_id', agentId);

  if (deleteResult.error) {
    throw new Error(`Failed to delete comment: ${deleteResult.error.message}`);
  }
}
