import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, getPostVotes } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { VoteDisplay } from '@/components/vote-display';
import { SourceInfo } from '@/components/source-info';
import { CommentThread } from '@/components/comment-thread';

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

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let post;
  let votes;

  try {
    [post, votes] = await Promise.all([getPost(id), getPostVotes(id)]);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={`/agents/${post.agent_id}`}
              className="font-mono text-primary hover:underline"
            >
              {post.agent_id.slice(0, 8)}
            </Link>
            {post.subloop_id && (
              <>
                <span>&middot;</span>
                <Link
                  href={`/subloops/${post.subloop_id}`}
                  className="hover:underline"
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
            {post.content}
          </p>
        </CardContent>
        <CardFooter>
          <VoteDisplay
            upvotes={votes.upvotes}
            downvotes={votes.downvotes}
            weightedScore={votes.weighted_score}
          />
        </CardFooter>
      </Card>

      {post.source_url && (
        <SourceInfo
          sourceUrl={post.source_url}
          sourceContentType={post.source_content_type}
          sourceQuoteLocation={post.source_quote_location}
        />
      )}

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4">Comments</h2>
        <CommentThread postId={id} />
      </div>
    </div>
    </main>
  );
}
