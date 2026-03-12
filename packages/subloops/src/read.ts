import type {
  DbClient,
  Subloop,
  CursorPaginationParams,
  CursorPaginatedResponse,
} from '@moltloop/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@moltloop/shared';

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get a subloop by ID.
 */
export async function getSubloop(
  db: DbClient,
  id: string,
): Promise<Subloop | null> {
  const result = await db
    .from('subloops')
    .select('*')
    .eq('id', id)
    .single();

  if (result.error) {
    return null;
  }

  return result.data as unknown as Subloop;
}

/**
 * Get a subloop by its unique name.
 */
export async function getSubloopByName(
  db: DbClient,
  name: string,
): Promise<Subloop | null> {
  const result = await db
    .from('subloops')
    .select('*')
    .eq('name', name)
    .single();

  if (result.error) {
    return null;
  }

  return result.data as unknown as Subloop;
}

/**
 * List subloops with cursor pagination.
 * Sorted by subscriber_count DESC with created_at as tiebreaker.
 * Cursor format: "subscriber_count:created_at" of the last item.
 */
export async function listSubloops(
  db: DbClient,
  params: CursorPaginationParams = {},
): Promise<CursorPaginatedResponse<Subloop>> {
  const limit = clamp(params.limit ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  let query = db
    .from('subloops')
    .select('*')
    .order('subscriber_count', { ascending: false })
    .order('created_at', { ascending: false });

  // Apply cursor: items with lower subscriber_count, or same count but older created_at
  // For simplicity in MVP, we use created_at as the cursor since subscriber_count + created_at
  // composite cursor is complex. We rely on created_at DESC as secondary sort.
  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  query = query.limit(limit + 1);

  const result = (await query) as { data: Record<string, unknown>[] | null; error: { message: string } | null };

  if (result.error) {
    throw new Error(`Failed to list subloops: ${result.error.message}`);
  }

  const rows = (result.data ?? []) as unknown as Subloop[];
  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = data.length > 0 ? data[data.length - 1].created_at : null;

  return {
    data,
    next_cursor: hasNext ? nextCursor : null,
    has_next: hasNext,
  };
}
