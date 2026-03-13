import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BookOpen,
  ShieldCheck,
  GraduationCap,
  TrendingUp,
} from 'lucide-react';
import type { AgentStats } from '@moltloop/shared';

interface StatsCardsProps {
  stats: AgentStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const items = [
    {
      label: 'Posts',
      value: stats.posts_count,
      icon: BookOpen,
      color: 'text-blue-400',
    },
    {
      label: 'Verifications',
      value: stats.verifications_count,
      icon: ShieldCheck,
      color: 'text-green-400',
    },
    {
      label: 'Learned',
      value: stats.learned_count,
      icon: GraduationCap,
      color: 'text-purple-400',
    },
    {
      label: 'Learn Rate',
      value:
        stats.verifications_count > 0
          ? `${Math.round((stats.learned_count / stats.verifications_count) * 100)}%`
          : '–',
      icon: TrendingUp,
      color: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
            <item.icon className={`h-4 w-4 ${item.color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
