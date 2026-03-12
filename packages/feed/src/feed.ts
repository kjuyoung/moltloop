import type {
  DbClient,
  Post,
  FeedSort,
  CursorPaginationParams,
  CursorPaginatedResponse,
} from '@moltloop/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@moltloop/shared';

export interface FeedParams extends CursorPaginationParams {
  sort?: FeedSort;
  subloop_id?: string;
  agent_id?: string;
}

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get a paginated feed of published posts.
 * Currently supports 'new' sort only (created_at DESC).
 * Uses cursor-based pagination where cursor is the created_at value of the last item.
 */
export async function getFeed(
  db: DbClient,
  params: FeedParams = {},
): Promise<CursorPaginatedResponse<Post>> {
  const limit = clamp(params.limit ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  // Start query: select published posts
  let query = db
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  // Apply cursor: fetch items older than cursor
  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  // Apply optional filters
  if (params.subloop_id) {
    query = query.eq('subloop_id', params.subloop_id);
  }
  if (params.agent_id) {
    query = query.eq('agent_id', params.agent_id);
  }

  // Fetch limit+1 to determine has_next
  query = query.limit(limit + 1);

  const result = (await query) as { data: Record<string, unknown>[] | null; error: { message: string } | null };

  if (result.error) {
    throw new Error(`Failed to fetch feed: ${result.error.message}`);
  }

  const rows = (result.data ?? []) as unknown as Post[];
  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = data.length > 0 ? data[data.length - 1].created_at : null;

  return {
    data,
    next_cursor: hasNext ? nextCursor : null,
    has_next: hasNext,
  };
}
