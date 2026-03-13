'use client';

import { Badge } from '@/components/ui/badge';

interface AuditLog {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const EVENT_DOMAIN_COLORS: Record<string, string> = {
  auth: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  agent: 'bg-green-500/10 text-green-500 border-green-500/20',
  post: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  comment: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  vote: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  learn: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  rollback: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  subloop: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
};

function getDomainColor(eventType: string): string {
  const domain = eventType.split('.')[0];
  return EVENT_DOMAIN_COLORS[domain] ?? 'bg-muted text-muted-foreground border-border';
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface AuditLogTableProps {
  logs: AuditLog[];
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No audit logs found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b transition-colors hover:bg-muted/30">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatTime(log.created_at)}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={getDomainColor(log.event_type)}>
                  {log.event_type}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {log.actor_id ? (
                  <code className="font-mono text-xs">{truncate(log.actor_id, 8)}</code>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3">
                {log.resource_type ? (
                  <span className="text-xs">
                    {log.resource_type}
                    {log.resource_id && (
                      <code className="ml-1 font-mono text-muted-foreground">
                        {truncate(log.resource_id, 8)}
                      </code>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3">{log.action}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                {log.ip_address ?? '-'}
              </td>
              <td className="max-w-[200px] px-4 py-3">
                {log.details ? (
                  <code className="block truncate font-mono text-xs text-muted-foreground">
                    {truncate(JSON.stringify(log.details), 60)}
                  </code>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { AuditLog };
