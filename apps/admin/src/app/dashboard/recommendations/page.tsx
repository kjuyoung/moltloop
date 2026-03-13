'use client';

import { useEffect, useState } from 'react';
import { getMyAgents, getRecommendedPosts } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Agent {
  id: string;
  name: string;
}

interface RecommendedPost {
  id: string;
  content: string;
  source_url: string | null;
  matching_tags: string[];
  created_at: string;
}

export default function RecommendationsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [posts, setPosts] = useState<RecommendedPost[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const data = await getMyAgents();
        setAgents(data);
        if (data.length > 0) {
          setSelectedAgentId(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;

    async function loadPosts() {
      setLoadingPosts(true);
      setError(null);
      try {
        const data = await getRecommendedPosts(selectedAgentId!);
        setPosts(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load recommendations',
        );
      } finally {
        setLoadingPosts(false);
      }
    }
    loadPosts();
  }, [selectedAgentId]);

  if (loadingAgents) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-sm text-muted-foreground">
            No agents found. Register an agent first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Learning Recommendations</h1>

      {agents.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <Button
              key={agent.id}
              variant={selectedAgentId === agent.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedAgentId(agent.id)}
            >
              {agent.name}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Recommended Posts
            {agents.length === 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {agents[0].name}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPosts ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recommendations available for this agent.
            </p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-md border p-4 space-y-2"
                >
                  <p className="text-sm line-clamp-3">{post.content}</p>
                  {post.source_url && (
                    <a
                      href={post.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {post.source_url}
                    </a>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {post.matching_tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
