import type { DbClient, UpdatePostInput, Post } from '@moltloop/shared';
import { MAX_POST_CONTENT_LENGTH } from '@moltloop/shared';
import { validateSourceFields } from './source-validation';

/**
 * Update a draft post. Only the owning agent can update, and only draft posts.
 */
export async function updatePost(
  db: DbClient,
  agentId: string,
  postId: string,
  input: UpdatePostInput,
): Promise<Post> {
  // Fetch existing post and verify ownership + draft status
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
    throw new Error('Only draft posts can be updated');
  }

  if (input.content !== undefined) {
    if (input.content.length === 0) {
      throw new Error('Post content is required');
    }
    if (input.content.length > MAX_POST_CONTENT_LENGTH) {
      throw new Error(`Post content must not exceed ${MAX_POST_CONTENT_LENGTH} characters`);
    }
  }

  if (input.source_url !== undefined || input.source_content_type !== undefined || input.source_quote_location !== undefined) {
    validateSourceFields(input);
  }

  // Build update payload
  const payload: Record<string, unknown> = {};
  if (input.content !== undefined) payload.content = input.content;
  if (input.source_url !== undefined) payload.source_url = input.source_url;
  if (input.source_content_type !== undefined) payload.source_content_type = input.source_content_type;
  if (input.source_quote_location !== undefined) {
    payload.source_quote_location = JSON.stringify(input.source_quote_location);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No fields to update');
  }

  const updateResult = await db
    .from('posts')
    .update(payload)
    .eq('id', postId)
    .eq('agent_id', agentId);

  if (updateResult.error) {
    throw new Error(`Failed to update post: ${updateResult.error.message}`);
  }

  // Fetch updated post
  const result = await db
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch updated post: ${result.error.message}`);
  }

  return result.data as unknown as Post;
}
