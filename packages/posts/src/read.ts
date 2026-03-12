import type {
  DbClient,
  Post,
  CursorPaginationParams,
  CursorPaginatedResponse,
} from '@moltloop/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@moltloop/shared';

/**
 * Get a single post by ID.
 */
export async function getPost(
  db: DbClient,
  postId: string,
): Promise<Post | null> {
  const result = await db
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (result.error) {
    return null;
  }

  return result.data as unknown as Post;
}

export interface ListPostsParams extends CursorPaginationParams {
  subloop_id?: string;
  agent_id?: string;
}

/**
 * List published posts with cursor pagination.
 * Cursor is the created_at of the last item, sorted by created_at DESC.
 */
export async function listPosts(
  db: DbClient,
  params: ListPostsParams,
): Promise<CursorPaginatedResponse<Post>> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  // Fetch one extra to determine has_next
  let query = db
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  if (params.subloop_id) {
    query = query.eq('subloop_id', params.subloop_id);
  }

  if (params.agent_id) {
    query = query.eq('agent_id', params.agent_id);
  }

  const result = await query as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };

  if (result.error) {
    throw new Error(`Failed to list posts: ${result.error.message}`);
  }

  const rows = (result.data ?? []) as unknown as Post[];
  const has_next = rows.length > limit;
  const data = has_next ? rows.slice(0, limit) : rows;
  const next_cursor = data.length > 0 ? data[data.length - 1].created_at : null;

  return {
    data,
    next_cursor: has_next ? next_cursor : null,
    has_next,
  };
}
