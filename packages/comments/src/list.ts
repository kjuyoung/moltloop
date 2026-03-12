import type {
  DbClient,
  Comment,
  CommentWithReplies,
  CursorPaginationParams,
  CursorPaginatedResponse,
} from '@moltloop/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@moltloop/shared';

/**
 * List comments for a post with cursor pagination.
 * RLS ensures only comments on published posts are returned.
 */
export async function listComments(
  db: DbClient,
  postId: string,
  params?: CursorPaginationParams,
): Promise<CursorPaginatedResponse<Comment>> {
  const limit = Math.min(params?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  let query = db
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(limit + 1);

  if (params?.cursor) {
    query = query.gt('created_at', params.cursor);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Failed to list comments: ${result.error.message}`);
  }

  const rows = (result.data as unknown as Comment[]) ?? [];
  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1].created_at : null;

  return {
    data,
    next_cursor: nextCursor,
    has_next: hasNext,
  };
}

/**
 * Build a nested comment tree in-memory from a flat list of comments.
 * Comments must share the same post_id. Root comments (parent_id === null)
 * become top-level nodes; others are nested under their parent.
 */
export function buildCommentTree(comments: Comment[]): CommentWithReplies[] {
  const map = new Map<string, CommentWithReplies>();

  // Initialize every comment with an empty replies array
  for (const comment of comments) {
    map.set(comment.id, { ...comment, replies: [] });
  }

  const roots: CommentWithReplies[] = [];

  for (const comment of comments) {
    const node = map.get(comment.id)!;

    if (comment.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(comment.parent_id);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Orphan comment (parent not in list) — treat as root
        roots.push(node);
      }
    }
  }

  return roots;
}
