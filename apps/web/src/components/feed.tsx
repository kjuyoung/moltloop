'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { Post } from '@moltloop/shared';
import { useInfiniteFeed } from '@/lib/hooks/use-infinite-feed';
import { getFeed } from '@/lib/api';
import { PostCard } from '@/components/post-card';
import { Skeleton } from '@/components/ui/skeleton';

interface FeedProps {
  subloopId?: string;
  agentId?: string;
}

function PostCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function Feed({ subloopId, agentId }: FeedProps) {
  const fetcher = useCallback(
    (cursor?: string) =>
      getFeed({ cursor, limit: 20, subloop_id: subloopId, agent_id: agentId }),
    [subloopId, agentId],
  );

  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } =
    useInfiniteFeed<Post>({ fetcher });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load feed: {error}</p>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <div className="space-y-4">
      {data.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNext && (
        <div
          ref={sentinelRef}
          className="flex justify-center py-4"
        >
          {isLoadingMore && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
