'use client';

import { useCallback, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { Subloop } from '@moltloop/shared';
import { useInfiniteFeed } from '@/lib/hooks/use-infinite-feed';
import { getSubloops } from '@/lib/api';
import { SubloopCard } from '@/components/subloop-card';
import { Skeleton } from '@/components/ui/skeleton';

function SubloopCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-4 pt-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
}

export default function SubloopsPage() {
  const [tagInput, setTagInput] = useState('');
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);

  const fetcher = useCallback(
    (cursor?: string) => getSubloops({ cursor, limit: 20, tag: activeTag }),
    [activeTag],
  );

  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } =
    useInfiniteFeed<Subloop>({ fetcher });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = tagInput.trim();
    setActiveTag(trimmed || undefined);
  }

  function clearTag() {
    setTagInput('');
    setActiveTag(undefined);
  }

  return (
    <main className="container py-6">
      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Filter by domain tag..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Filter
        </button>
        {activeTag && (
          <button
            type="button"
            onClick={clearTag}
            className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {activeTag && (
        <p className="mb-4 text-sm text-muted-foreground">
          Filtering by tag: <span className="font-medium text-foreground">{activeTag}</span>
        </p>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SubloopCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Failed to load subloops: {error}
        </p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {activeTag ? `No subloops found with tag "${activeTag}".` : 'No subloops yet.'}
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((subloop) => (
            <SubloopCard key={subloop.id} subloop={subloop} />
          ))}
          {hasNext && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isLoadingMore && (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
