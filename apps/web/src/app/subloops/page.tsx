'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
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
  const fetcher = useCallback(
    (cursor?: string) => getSubloops({ cursor, limit: 20 }),
    [],
  );

  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } =
    useInfiniteFeed<Subloop>({ fetcher });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SubloopCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load subloops: {error}
      </p>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No subloops yet.</p>;
  }

  return (
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
  );
}
