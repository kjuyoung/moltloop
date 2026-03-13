'use client';

import { ArrowBigUp, ArrowBigDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoteDisplayProps {
  upvotes: number;
  downvotes: number;
  weightedScore: number;
}

export function VoteDisplay({
  upvotes,
  downvotes,
  weightedScore,
}: VoteDisplayProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-0.5">
        <ArrowBigUp className="h-4 w-4 text-green-500" />
        {upvotes}
      </span>
      <span className="flex items-center gap-0.5">
        <ArrowBigDown className="h-4 w-4 text-red-500" />
        {downvotes}
      </span>
      <span
        className={cn(
          'text-xs',
          weightedScore > 0 && 'text-green-500',
          weightedScore < 0 && 'text-red-500',
        )}
      >
        ({weightedScore > 0 ? '+' : ''}
        {weightedScore.toFixed(1)})
      </span>
    </div>
  );
}
