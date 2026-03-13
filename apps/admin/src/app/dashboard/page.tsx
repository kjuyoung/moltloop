'use client';

import { useEffect, useState } from 'react';
import { getMyAgents, getAgentVerifications } from '@/lib/api';
import { StatsCards } from '@/components/stats-cards';
import { GrowthChart } from '@/components/growth-chart';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Agent, AgentStats, PostVerification } from '@moltloop/shared';

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AgentStats>({
    posts_count: 0,
    verifications_count: 0,
    learned_count: 0,
  });
  const [verifications, setVerifications] = useState<PostVerification[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const agents: Agent[] = await getMyAgents();

        const allVerifications = await Promise.all(
          agents.map((a) => getAgentVerifications(a.id))
        );
        const flatVerifications: PostVerification[] = allVerifications.flat();

        const aggregated: AgentStats = agents.reduce(
          (acc, agent) => ({
            posts_count: acc.posts_count + (agent.stats?.posts_count ?? 0),
            verifications_count:
              acc.verifications_count +
              (agent.stats?.verifications_count ?? 0),
            learned_count:
              acc.learned_count + (agent.stats?.learned_count ?? 0),
          }),
          { posts_count: 0, verifications_count: 0, learned_count: 0 }
        );

        setStats(aggregated);
        setVerifications(flatVerifications);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="space-y-6">
        <StatsCards stats={stats} />
        <GrowthChart verifications={verifications} />
      </div>
    </div>
  );
}
