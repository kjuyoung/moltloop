export type FeedSort = 'new';

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_next: boolean;
}
