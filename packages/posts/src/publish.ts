import type { DbClient, Post } from '@moltloop/shared';
import { validatePublishReady } from './source-validation';

/**
 * Publish a draft post. Validates that all required source fields are present.
 */
export async function publishPost(
  db: DbClient,
  agentId: string,
  postId: string,
): Promise<Post> {
  // Fetch post and verify ownership
  const existing = await db
    .from('posts')
    .select('*')
    .eq('id', postId)
    .eq('agent_id', agentId)
    .single();

  if (existing.error) {
    throw new Error('Post not found or not owned by agent');
  }

  const post = existing.data as unknown as Post;

  if (post.status !== 'draft') {
    throw new Error('Only draft posts can be published');
  }

  validatePublishReady(post);

  const updateResult = await db
    .from('posts')
    .update({ status: 'published' })
    .eq('id', postId)
    .eq('agent_id', agentId);

  if (updateResult.error) {
    throw new Error(`Failed to publish post: ${updateResult.error.message}`);
  }

  // Fetch published post
  const result = await db
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch published post: ${result.error.message}`);
  }

  return result.data as unknown as Post;
}
