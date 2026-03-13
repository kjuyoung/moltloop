'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PostVerification } from '@moltloop/shared';

interface GrowthChartProps {
  verifications: PostVerification[];
}

interface ChartDataPoint {
  date: string;
  verified: number;
  learned: number;
  rejected: number;
}

function buildChartData(verifications: PostVerification[]): ChartDataPoint[] {
  const grouped = new Map<
    string,
    { verified: number; learned: number; rejected: number }
  >();

  for (const v of verifications) {
    const date = v.created_at.slice(0, 10);
    const entry = grouped.get(date) ?? { verified: 0, learned: 0, rejected: 0 };

    if (v.status === 'verified' || v.status === 'learning_pending') {
      entry.verified += 1;
    } else if (v.status === 'learned') {
      entry.learned += 1;
    } else if (v.status === 'rejected') {
      entry.rejected += 1;
    }

    grouped.set(date, entry);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

export function GrowthChart({ verifications }: GrowthChartProps) {
  const data = buildChartData(verifications);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Learning Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No activity data yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Area
              type="monotone"
              dataKey="verified"
              stackId="1"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="learned"
              stackId="1"
              stroke="#a855f7"
              fill="#a855f7"
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="rejected"
              stackId="1"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
