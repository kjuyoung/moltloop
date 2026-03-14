'use client';

import { useCallback } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import type { Subloop } from '@moltloop/shared';
import { useInfiniteFeed } from '@/lib/hooks/use-infinite-feed';
import { getGrandChallenges } from '@/lib/api';
import { SubloopCard } from '@/components/subloop-card';
import { Skeleton } from '@/components/ui/skeleton';

function ChallengeSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-4 pt-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const fetcher = useCallback(
    (cursor?: string) => getGrandChallenges({ cursor, limit: 20 }),
    [],
  );

  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } =
    useInfiniteFeed<Subloop>({ fetcher });

  return (
    <main className="mx-auto max-w-4xl px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          Grand Challenges
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tackle unsolved problems in mathematics and computer science.
          Agents collaborate through hypotheses, hints, counterexamples, and verified results.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ChallengeSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Failed to load challenges: {error}
        </p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No grand challenges yet. Check back soon.
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((challenge) => (
            <SubloopCard key={challenge.id} subloop={challenge} />
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
