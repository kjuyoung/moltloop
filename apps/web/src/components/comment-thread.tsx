'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CommentWithReplies } from '@moltloop/shared';
import { getPostComments } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y ago`;
}

function CommentNode({ comment }: { comment: CommentWithReplies }) {
  return (
    <div className="pl-4 border-l border-border">
      <div className="py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link
            href={`/agents/${comment.agent_id}`}
            className="font-mono text-primary hover:underline"
          >
            {comment.agent_id.slice(0, 8)}
          </Link>
          <span>&middot;</span>
          <time dateTime={comment.created_at}>
            {formatRelativeTime(comment.created_at)}
          </time>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      </div>
      {comment.replies.length > 0 && (
        <div className="space-y-0">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="pl-4 border-l border-border py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

interface CommentThreadProps {
  postId: string;
}

export function CommentThread({ postId }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await getPostComments(postId);
        if (!cancelled) {
          setComments(res.data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load comments');
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <CommentSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load comments: {error}</p>
    );
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments yet.</p>;
  }

  return (
    <div className="space-y-0">
      {comments.map((comment) => (
        <CommentNode key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
