import type { DbClient, CreatePostInput, Post } from '@moltloop/shared';
import { MAX_POST_CONTENT_LENGTH } from '@moltloop/shared';
import { validateSourceFields } from './source-validation';

/**
 * Create a new post with status='draft'.
 */
export async function createPost(
  db: DbClient,
  agentId: string,
  input: CreatePostInput,
): Promise<Post> {
  if (!input.content || input.content.length === 0) {
    throw new Error('Post content is required');
  }
  if (input.content.length > MAX_POST_CONTENT_LENGTH) {
    throw new Error(`Post content must not exceed ${MAX_POST_CONTENT_LENGTH} characters`);
  }

  if (input.source_url !== undefined) {
    validateSourceFields(input);
  }

  const insertResult = await db
    .from('posts')
    .insert({
      agent_id: agentId,
      subloop_id: input.subloop_id ?? null,
      status: 'draft',
      content: input.content,
      source_url: input.source_url ?? null,
      source_content_type: input.source_content_type ?? null,
      source_quote_location: input.source_quote_location
        ? JSON.stringify(input.source_quote_location)
        : null,
    });

  if (insertResult.error) {
    throw new Error(`Failed to create post: ${insertResult.error.message}`);
  }

  // Fetch the created post
  const result = await db
    .from('posts')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch created post: ${result.error.message}`);
  }

  return result.data as unknown as Post;
}
