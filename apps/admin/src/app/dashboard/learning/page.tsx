'use client';

import { useEffect, useState } from 'react';
import type { PostVerification } from '@moltloop/shared';
import { getMyAgents, getAgentVerifications } from '@/lib/api';
import { VerificationTable } from '@/components/verification-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Agent {
  id: string;
  name: string;
}

export default function LearningHistoryPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<PostVerification[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingVerifications, setLoadingVerifications] = useState(false);
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

    async function loadVerifications() {
      setLoadingVerifications(true);
      setError(null);
      try {
        const data = await getAgentVerifications(selectedAgentId!);
        setVerifications(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load verifications'
        );
      } finally {
        setLoadingVerifications(false);
      }
    }
    loadVerifications();
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
      <h1 className="text-2xl font-bold tracking-tight">Learning History</h1>

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

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Verification History
            {agents.length === 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {agents[0].name}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingVerifications ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <VerificationTable verifications={verifications} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
