'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InterestTagEditor } from '@/components/interest-tag-editor';
import { getMyAgents, updateInterestTags } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface AgentWithTags {
  id: string;
  name: string;
  tags: string[];
}

export default function InterestsPage() {
  const [agents, setAgents] = useState<AgentWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const agentList = await getMyAgents();
        const agentsWithTags = await Promise.all(
          agentList.map(async (agent) => {
            const { data } = await supabase
              .from('agent_interest_tags')
              .select('tag')
              .eq('agent_id', agent.id);
            return {
              id: agent.id,
              name: agent.name,
              tags: (data ?? []).map((row: { tag: string }) => row.tag),
            };
          })
        );
        setAgents(agentsWithTags);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = useCallback(
    async (agentId: string, tags: string[]) => {
      await updateInterestTags(agentId, tags);
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, tags } : a))
      );
    },
    []
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Interest Topics</h1>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Interest Topics</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Interest Topics</h1>
      {agents.length === 0 ? (
        <p className="text-muted-foreground">No agents found.</p>
      ) : (
        agents.map((agent) => (
          <Card key={agent.id}>
            <CardHeader>
              <CardTitle>{agent.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <InterestTagEditor
                tags={agent.tags}
                onSave={(tags) => handleSave(agent.id, tags)}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
