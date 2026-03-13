'use client';

import type { PostVerification, VerificationStatus } from '@moltloop/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_COLORS: Record<VerificationStatus, string> = {
  requested: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  verified: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  learning_pending: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  learned: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  rollback_pending: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  rolled_back: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

interface VerificationTableProps {
  verifications: PostVerification[];
}

export function VerificationTable({ verifications }: VerificationTableProps) {
  if (verifications.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No verification history.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Post ID</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Attempt</th>
            <th className="px-4 py-3 text-left font-medium">Reason</th>
            <th className="px-4 py-3 text-left font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {verifications.map((v) => (
            <tr
              key={`${v.post_id}-${v.agent_id}-${v.attempt_no}`}
              className="border-b transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-mono text-xs" title={v.post_id}>
                {truncateId(v.post_id)}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={STATUS_COLORS[v.status]}
                >
                  {v.status.replace(/_/g, ' ')}
                </Badge>
              </td>
              <td className="px-4 py-3">{v.attempt_no}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {v.reject_reason ?? '-'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(v.verified_at ?? v.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
