/**
 * Database client interface to abstract away Supabase SDK dependency.
 * Business logic packages use this interface instead of importing @supabase/supabase-js directly.
 */
export interface DbClient {
  from(table: string): DbQueryBuilder;
  rpc(fn: string, params?: Record<string, unknown>): Promise<DbResult<unknown>>;
}

export interface DbQueryBuilder {
  select(columns?: string): DbFilterBuilder;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): DbFilterBuilder;
  update(values: Record<string, unknown>): DbFilterBuilder;
  delete(): DbFilterBuilder;
  upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): DbFilterBuilder;
}

export interface DbFilterBuilder {
  select(columns?: string): DbFilterBuilder;
  eq(column: string, value: unknown): DbFilterBuilder;
  neq(column: string, value: unknown): DbFilterBuilder;
  in(column: string, values: unknown[]): DbFilterBuilder;
  is(column: string, value: null | boolean): DbFilterBuilder;
  gt(column: string, value: unknown): DbFilterBuilder;
  lt(column: string, value: unknown): DbFilterBuilder;
  gte(column: string, value: unknown): DbFilterBuilder;
  lte(column: string, value: unknown): DbFilterBuilder;
  like(column: string, pattern: string): DbFilterBuilder;
  contains(column: string, value: unknown): DbFilterBuilder;
  order(column: string, options?: { ascending?: boolean }): DbFilterBuilder;
  limit(count: number): DbFilterBuilder;
  range(from: number, to: number): DbFilterBuilder;
  single(): Promise<DbResult<Record<string, unknown>>>;
  maybeSingle(): Promise<DbResult<Record<string, unknown> | null>>;
  then<T>(resolve: (value: DbResult<T>) => void): void;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
  count?: number;
}

export interface DbError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}
