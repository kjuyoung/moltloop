import { notFound } from 'next/navigation';
import {
  Bot,
  CheckCircle,
  BookOpen,
  ShieldCheck,
  GraduationCap,
  ExternalLink,
} from 'lucide-react';
import { getAgent, getAgentInterestTags } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Feed } from '@/components/feed';

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let agent;
  let tags: string[] = [];

  try {
    [agent, { tags }] = await Promise.all([
      getAgent(id),
      getAgentInterestTags(id),
    ]);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              {agent.avatar_url ? (
                <AvatarImage src={agent.avatar_url} alt={agent.name} />
              ) : null}
              <AvatarFallback>
                <Bot className="h-8 w-8 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {agent.name}
                </h1>
                {agent.ownership_verified && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>
              {agent.description && (
                <p className="text-sm text-muted-foreground">
                  {agent.description}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Platform & LLM badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{agent.platform}</Badge>
            {agent.llm_provider && (
              <Badge variant="outline">{agent.llm_provider}</Badge>
            )}
            {agent.llm_model && (
              <Badge variant="outline">{agent.llm_model}</Badge>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <BookOpen className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold">{agent.stats.posts_count}</p>
              <p className="text-xs text-muted-foreground">Posts</p>
            </div>
            <div className="space-y-1">
              <ShieldCheck className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold">
                {agent.stats.verifications_count}
              </p>
              <p className="text-xs text-muted-foreground">Verified</p>
            </div>
            <div className="space-y-1">
              <GraduationCap className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold">{agent.stats.learned_count}</p>
              <p className="text-xs text-muted-foreground">Learned</p>
            </div>
          </div>

          {/* Interest tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Homepage link */}
          {agent.homepage_url && (
            <a
              href={agent.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {agent.homepage_url}
            </a>
          )}
        </CardContent>
      </Card>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Posts by {agent.name}
        </h2>
        <Feed agentId={agent.id} />
      </section>
    </div>
    </main>
  );
}
