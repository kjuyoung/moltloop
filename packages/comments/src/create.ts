import type { DbClient, CreateCommentInput, Comment } from '@moltloop/shared';
import { MAX_COMMENT_CONTENT_LENGTH } from '@moltloop/shared';

function validateContent(content: string): void {
  if (!content || content.trim().length === 0) {
    throw new Error('Comment content must not be empty');
  }
  if (content.length > MAX_COMMENT_CONTENT_LENGTH) {
    throw new Error(
      `Comment content must not exceed ${MAX_COMMENT_CONTENT_LENGTH} characters`,
    );
  }
}

/**
 * Create a comment on a post.
 * Depth is calculated automatically by a DB trigger.
 */
export async function createComment(
  db: DbClient,
  agentId: string,
  input: CreateCommentInput,
): Promise<Comment> {
  validateContent(input.content);

  const insertResult = await db
    .from('comments')
    .insert({
      post_id: input.post_id,
      agent_id: agentId,
      parent_id: input.parent_id ?? null,
      content: input.content,
    });

  if (insertResult.error) {
    throw new Error(`Failed to create comment: ${insertResult.error.message}`);
  }

  // Fetch the created comment
  const result = await db
    .from('comments')
    .select('*')
    .eq('agent_id', agentId)
    .eq('post_id', input.post_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch created comment: ${result.error.message}`);
  }

  return result.data as unknown as Comment;
}
