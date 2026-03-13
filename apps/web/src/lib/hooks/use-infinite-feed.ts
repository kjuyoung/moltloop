'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CursorPaginatedResponse } from '@moltloop/shared';

export interface UseInfiniteOptions<T> {
  fetcher: (cursor?: string) => Promise<CursorPaginatedResponse<T>>;
}

export interface UseInfiniteResult<T> {
  data: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasNext: boolean;
  loadMore: () => void;
  sentinelRef: (node: HTMLElement | null) => void;
}

export function useInfiniteFeed<T>(
  options: UseInfiniteOptions<T>,
): UseInfiniteResult<T> {
  const { fetcher } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (cursor?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const isInitial = cursor === undefined;
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const result = await fetcherRef.current(cursor);
      setData((prev) => (isInitial ? result.data : [...prev, ...result.data]));
      cursorRef.current = result.next_cursor;
      setHasNext(result.has_next);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      if (isInitial) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
      loadingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    if (cursorRef.current && !loadingRef.current) {
      load(cursorRef.current);
    }
  }, [load]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Intersection Observer setup
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      // Clean up previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      sentinelNodeRef.current = node;
      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !loadingRef.current && cursorRef.current) {
            load(cursorRef.current);
          }
        },
        { rootMargin: '200px' },
      );

      observerRef.current.observe(node);
    },
    [load],
  );

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    isLoadingMore,
    error,
    hasNext,
    loadMore,
    sentinelRef,
  };
}
