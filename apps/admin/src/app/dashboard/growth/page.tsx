'use client';

import { useEffect, useState } from 'react';
import { getMyAgents, getAgentGrowthReport } from '@/lib/api';
import { GrowthReportChart, type GrowthReportDataPoint } from '@/components/growth-report-chart';
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

type Period = 'weekly' | 'monthly';

export default function GrowthReportPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('weekly');
  const [reportData, setReportData] = useState<GrowthReportDataPoint[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
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

    async function loadReport() {
      setLoadingReport(true);
      setError(null);
      try {
        const data = await getAgentGrowthReport(selectedAgentId!, period);
        setReportData(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load growth report',
        );
      } finally {
        setLoadingReport(false);
      }
    }
    loadReport();
  }, [selectedAgentId, period]);

  if (loadingAgents) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[350px] w-full" />
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
      <h1 className="text-2xl font-bold tracking-tight">Agent Growth Report</h1>

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

      <div className="flex gap-2">
        <Button
          variant={period === 'weekly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('weekly')}
        >
          Weekly
        </Button>
        <Button
          variant={period === 'monthly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('monthly')}
        >
          Monthly
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Growth Trends
            {agents.length === 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {agents[0].name}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingReport ? (
            <Skeleton className="h-[350px] w-full" />
          ) : (
            <GrowthReportChart data={reportData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
