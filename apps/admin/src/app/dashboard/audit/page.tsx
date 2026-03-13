'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuditLogs } from '@/lib/api';
import { AuditLogTable, type AuditLog } from '@/components/audit-log-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 50;

const EVENT_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Auth', value: 'auth.%' },
  { label: 'Agent', value: 'agent.%' },
  { label: 'Post', value: 'post.%' },
  { label: 'Comment', value: 'comment.%' },
  { label: 'Vote', value: 'vote.%' },
  { label: 'Learn', value: 'learn.%' },
  { label: 'Rollback', value: 'rollback.%' },
  { label: 'Subloop', value: 'subloop.%' },
] as const;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        event_type: filter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setLogs(result.data);
      setTotalCount(result.count);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(value: string) {
    setFilter(value);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Audit Logs</span>
            <span className="text-sm font-normal text-muted-foreground">
              {totalCount.toLocaleString()} total entries
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EVENT_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <AuditLogTable logs={logs} />
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
