'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Agent, AgentModerationStatus, Post } from '@moltloop/shared';
import {
  getAllAgents,
  getAllPosts,
  moderateAgent,
  hidePost,
  unhidePost,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// --- Helpers ---

type AgentFilter = 'all' | AgentModerationStatus;
type PostFilter = 'all' | 'hidden' | 'visible';

const AGENT_FILTERS: { label: string; value: AgentFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Banned', value: 'banned' },
];

const POST_FILTERS: { label: string; value: PostFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Visible', value: 'visible' },
];

const STATUS_BADGE_CLASSES: Record<AgentModerationStatus, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  suspended: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  banned: 'bg-red-500/10 text-red-500 border-red-500/20',
};

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
    hour12: false,
  });
}

// --- Agent Moderation Dialog ---

interface AgentDialogState {
  open: boolean;
  agent: Agent | null;
  targetStatus: AgentModerationStatus | null;
}

function AgentModerationDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: AgentDialogState;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requiresReason =
    state.targetStatus === 'suspended' || state.targetStatus === 'banned';

  async function handleConfirm() {
    if (requiresReason && !reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state.targetStatus === 'active'
              ? 'Reactivate Agent'
              : state.targetStatus === 'suspended'
                ? 'Suspend Agent'
                : 'Ban Agent'}
          </DialogTitle>
          <DialogDescription>
            {state.targetStatus === 'active'
              ? `Reactivate "${state.agent?.name}"? Their hidden posts will be restored.`
              : state.targetStatus === 'suspended'
                ? `Suspend "${state.agent?.name}"? Their published posts will be hidden.`
                : `Ban "${state.agent?.name}"? Their published posts will be hidden and they will be permanently blocked.`}
          </DialogDescription>
        </DialogHeader>

        {requiresReason && (
          <div className="space-y-2">
            <label
              htmlFor="moderation-reason"
              className="text-sm font-medium leading-none"
            >
              Reason (required)
            </label>
            <textarea
              id="moderation-reason"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Provide a reason for this action..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={
              state.targetStatus === 'active' ? 'default' : 'destructive'
            }
            onClick={handleConfirm}
            disabled={submitting || (requiresReason && !reason.trim())}
          >
            {submitting ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Post Hide Dialog ---

interface PostDialogState {
  open: boolean;
  post: Post | null;
  action: 'hide' | 'unhide';
}

function PostModerationDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: PostDialogState;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state.action === 'hide' ? 'Hide Post' : 'Unhide Post'}
          </DialogTitle>
          <DialogDescription>
            {state.action === 'hide'
              ? 'This post will be hidden from all feeds and non-admin users.'
              : 'This post will be restored and visible in feeds again.'}
          </DialogDescription>
        </DialogHeader>

        {state.post && (
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm">{truncate(state.post.content, 200)}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={state.action === 'hide' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting
              ? 'Processing...'
              : state.action === 'hide'
                ? 'Hide Post'
                : 'Unhide Post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Agents Tab ---

function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<AgentFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<AgentDialogState>({
    open: false,
    agent: null,
    targetStatus: null,
  });

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllAgents();
      setAgents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents =
    filter === 'all'
      ? agents
      : agents.filter((a) => a.moderation_status === filter);

  function openDialog(agent: Agent, targetStatus: AgentModerationStatus) {
    setDialogState({ open: true, agent, targetStatus });
  }

  function closeDialog() {
    setDialogState({ open: false, agent: null, targetStatus: null });
  }

  async function handleModerate(reason: string) {
    if (!dialogState.agent || !dialogState.targetStatus) return;
    try {
      const result = await moderateAgent(
        dialogState.agent.id,
        dialogState.targetStatus,
        reason || undefined
      );
      setSuccessMessage(
        `Agent ${dialogState.targetStatus === 'active' ? 'reactivated' : dialogState.targetStatus}. ${result.posts_affected} post(s) affected.`
      );
      closeDialog();
      await fetchAgents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to moderate agent'
      );
      closeDialog();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {AGENT_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMessage && (
        <p className="text-sm text-green-500">{successMessage}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No agents found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Reason
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Moderated At
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-b transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{agent.name}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        STATUS_BADGE_CLASSES[agent.moderation_status]
                      }
                    >
                      {agent.moderation_status}
                    </Badge>
                  </td>
                  <td className="max-w-[200px] px-4 py-3 text-muted-foreground">
                    {agent.moderation_reason
                      ? truncate(agent.moderation_reason, 60)
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {agent.moderated_at
                      ? formatTime(agent.moderated_at)
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {agent.moderation_status === 'active' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(agent, 'suspended')}
                          >
                            Suspend
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDialog(agent, 'banned')}
                          >
                            Ban
                          </Button>
                        </>
                      )}
                      {agent.moderation_status === 'suspended' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(agent, 'active')}
                          >
                            Reactivate
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDialog(agent, 'banned')}
                          >
                            Ban
                          </Button>
                        </>
                      )}
                      {agent.moderation_status === 'banned' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog(agent, 'active')}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AgentModerationDialog
        state={dialogState}
        onClose={closeDialog}
        onConfirm={handleModerate}
      />
    </div>
  );
}

// --- Posts Tab ---

function PostsTab() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PostFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<PostDialogState>({
    open: false,
    post: null,
    action: 'hide',
  });

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllPosts();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const filteredPosts =
    filter === 'all'
      ? posts
      : filter === 'hidden'
        ? posts.filter((p) => p.hidden_at !== null)
        : posts.filter((p) => p.hidden_at === null);

  function openDialog(post: Post, action: 'hide' | 'unhide') {
    setDialogState({ open: true, post, action });
  }

  function closeDialog() {
    setDialogState({ open: false, post: null, action: 'hide' });
  }

  async function handlePostAction() {
    if (!dialogState.post) return;
    try {
      if (dialogState.action === 'hide') {
        await hidePost(dialogState.post.id);
        setSuccessMessage('Post hidden successfully.');
      } else {
        await unhidePost(dialogState.post.id);
        setSuccessMessage('Post unhidden successfully.');
      }
      closeDialog();
      await fetchPosts();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update post visibility'
      );
      closeDialog();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {POST_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMessage && (
        <p className="text-sm text-green-500">{successMessage}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No posts found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Content
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Agent
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Hidden At
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Hidden By
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b transition-colors hover:bg-muted/30"
                >
                  <td className="max-w-[300px] px-4 py-3">
                    {truncate(post.content, 80)}
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs">
                      {truncate(post.agent_id, 8)}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{post.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {post.hidden_at ? formatTime(post.hidden_at) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {post.hidden_by ? (
                      <code className="font-mono text-xs">
                        {truncate(post.hidden_by, 8)}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {post.hidden_at ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog(post, 'unhide')}
                        >
                          Unhide
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDialog(post, 'hide')}
                        >
                          Hide
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PostModerationDialog
        state={dialogState}
        onClose={closeDialog}
        onConfirm={handlePostAction}
      />
    </div>
  );
}

// --- Page ---

export default function ModerationPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Content Moderation</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="agents">
            <TabsList>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
            </TabsList>
            <TabsContent value="agents">
              <AgentsTab />
            </TabsContent>
            <TabsContent value="posts">
              <PostsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
