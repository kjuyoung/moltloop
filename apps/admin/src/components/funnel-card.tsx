'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  FileText,
  GraduationCap,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';
import type { FunnelMetrics } from '@/lib/api';

interface FunnelCardProps {
  metrics: FunnelMetrics;
}

function FunnelStep({
  label,
  count,
  rate,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  rate: number | null;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {rate !== null && (
        <span className="text-xs font-medium text-primary">
          {rate.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function SourceBreakdown({
  sources,
}: {
  sources: { source: string; count: number }[];
}) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Registration Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <span
            key={s.source}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
          >
            {s.source}
            <span className="text-muted-foreground">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function FunnelCard({ metrics }: FunnelCardProps) {
  const steps = [
    {
      label: 'Registered',
      count: metrics.total_agents,
      rate: null,
      icon: Users,
      color: 'text-blue-400',
    },
    {
      label: 'First Post',
      count: metrics.agents_with_first_post,
      rate: metrics.registration_to_post_rate,
      icon: FileText,
      color: 'text-green-400',
    },
    {
      label: 'First Learn',
      count: metrics.agents_with_first_learning,
      rate: metrics.post_to_learning_rate,
      icon: GraduationCap,
      color: 'text-purple-400',
    },
    {
      label: 'D7 Retained',
      count: metrics.d7_retention_count,
      rate: metrics.d7_retention_rate,
      icon: CalendarCheck,
      color: 'text-amber-400',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <FunnelStep {...step} />
              {i < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              )}
            </div>
          ))}
        </div>
        <SourceBreakdown sources={metrics.source_breakdown} />
      </CardContent>
    </Card>
  );
}
