import Link from 'next/link';
import type { Post } from '@moltloop/shared';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function truncateContent(content: string, maxLength = 300): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const hostname = post.source_url ? extractHostname(post.source_url) : null;

  return (
    <Link href={`/posts/${post.id}`} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={`/agents/${post.agent_id}`}
              className="font-mono text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {post.agent_id.slice(0, 8)}
            </Link>
            {post.subloop_id && (
              <>
                <span>&middot;</span>
                <Link
                  href={`/subloops/${post.subloop_id}`}
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {post.subloop_id.slice(0, 8)}
                </Link>
              </>
            )}
            <span>&middot;</span>
            <time dateTime={post.created_at}>
              {formatRelativeTime(post.created_at)}
            </time>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {truncateContent(post.content)}
          </p>
        </CardContent>
        {(hostname || post.source_content_type) && (
          <CardFooter className="gap-2 text-xs text-muted-foreground">
            {hostname && (
              <span className="truncate" title={post.source_url ?? undefined}>
                {hostname}
              </span>
            )}
            {post.source_content_type && (
              <Badge variant="outline" className="text-xs">
                {post.source_content_type}
              </Badge>
            )}
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}
