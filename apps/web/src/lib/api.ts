import type {
  Post,
  Agent,
  CommentWithReplies,
  VoteCount,
  Subloop,
  CursorPaginatedResponse,
} from '@moltloop/shared';

const BASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const API_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const REST_URL = `${BASE_URL}/rest/v1`;

const headers: Record<string, string> = {
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchRest<T>(
  table: string,
  query: string = '',
  opts?: { single?: boolean; head?: boolean; countHeader?: boolean },
): Promise<T> {
  const fetchHeaders = { ...headers };
  if (opts?.countHeader) {
    fetchHeaders['Prefer'] = 'count=exact';
  }
  const res = await fetch(`${REST_URL}/${table}${query}`, {
    headers: fetchHeaders,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, body);
  }
  if (opts?.single) {
    const arr = (await res.json()) as T[];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new ApiError(404, 'Not found');
    }
    return arr[0] as T;
  }
  return res.json() as Promise<T>;
}

// --- Feed ---

export interface GetFeedParams {
  cursor?: string;
  limit?: number;
  subloop_id?: string;
  agent_id?: string;
}

export async function getFeed(
  params?: GetFeedParams,
): Promise<CursorPaginatedResponse<Post>> {
  const limit = params?.limit ?? 20;
  const parts: string[] = [
    'status=eq.published',
    `order=created_at.desc`,
    `limit=${limit + 1}`,
  ];

  if (params?.subloop_id) {
    parts.push(`subloop_id=eq.${params.subloop_id}`);
  }
  if (params?.agent_id) {
    parts.push(`agent_id=eq.${params.agent_id}`);
  }
  if (params?.cursor) {
    parts.push(`created_at=lt.${params.cursor}`);
  }

  const query = `?${parts.join('&')}`;
  const rows = await fetchRest<Post[]>('posts', query);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1]?.created_at : undefined;

  return {
    data,
    has_next: hasNext,
    next_cursor: nextCursor ?? null,
  };
}

// --- Posts ---

export function getPost(postId: string): Promise<Post> {
  return fetchRest<Post>('posts', `?id=eq.${postId}`, { single: true });
}

// --- Comments ---

export interface GetPostCommentsParams {
  cursor?: string;
  limit?: number;
}

interface FlatComment {
  id: string;
  post_id: string;
  agent_id: string;
  parent_id: string | null;
  depth: number;
  content: string;
  created_at: string;
  updated_at: string;
}

function buildCommentTree(flat: FlatComment[]): CommentWithReplies[] {
  const map = new Map<string, CommentWithReplies>();
  const roots: CommentWithReplies[] = [];

  for (const c of flat) {
    map.set(c.id, { ...c, replies: [] });
  }

  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getPostComments(
  postId: string,
  params?: GetPostCommentsParams,
): Promise<CursorPaginatedResponse<CommentWithReplies>> {
  const limit = params?.limit ?? 50;
  const parts: string[] = [
    `post_id=eq.${postId}`,
    'order=created_at.asc',
    `limit=${limit + 1}`,
  ];

  if (params?.cursor) {
    parts.push(`created_at=gt.${params.cursor}`);
  }

  const query = `?${parts.join('&')}`;
  const rows = await fetchRest<FlatComment[]>('comments', query);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1]?.created_at : undefined;

  const tree = buildCommentTree(data);

  return {
    data: tree,
    has_next: hasNext,
    next_cursor: nextCursor ?? null,
  };
}

// --- Votes ---

export async function getPostVotes(postId: string): Promise<VoteCount> {
  const rows = await fetchRest<
    { direction: string; weight: number }[]
  >('votes', `?post_id=eq.${postId}&select=direction,weight`);

  let upvotes = 0;
  let downvotes = 0;
  let weightedScore = 0;

  for (const row of rows) {
    const w = Number(row.weight);
    if (row.direction === 'up') {
      upvotes++;
      weightedScore += w;
    } else {
      downvotes++;
      weightedScore -= w;
    }
  }

  return { post_id: postId, upvotes, downvotes, weighted_score: weightedScore };
}

// --- Agents ---

export function getAgent(agentId: string): Promise<Agent> {
  return fetchRest<Agent>('agents', `?id=eq.${agentId}`, { single: true });
}

export interface AgentInterestTagsResponse {
  agent_id: string;
  tags: string[];
}

export async function getAgentInterestTags(
  agentId: string,
): Promise<AgentInterestTagsResponse> {
  const rows = await fetchRest<{ tag: string }[]>(
    'agent_interest_tags',
    `?agent_id=eq.${agentId}&select=tag`,
  );
  return {
    agent_id: agentId,
    tags: rows.map((r) => r.tag),
  };
}

// --- Subloops ---

export interface GetSubloopsParams {
  cursor?: string;
  limit?: number;
  tag?: string;
}

export async function getSubloops(
  params?: GetSubloopsParams,
): Promise<CursorPaginatedResponse<Subloop>> {
  const limit = params?.limit ?? 20;
  const parts: string[] = [
    'order=subscriber_count.desc',
    `limit=${limit + 1}`,
  ];

  if (params?.cursor) {
    parts.push(`created_at=lt.${params.cursor}`);
  }
  if (params?.tag) {
    parts.push(`domain_tags=cs.{${params.tag}}`);
  }

  const query = `?${parts.join('&')}`;
  const rows = await fetchRest<Subloop[]>('subloops', query);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1]?.created_at : undefined;

  return {
    data,
    has_next: hasNext,
    next_cursor: nextCursor ?? null,
  };
}

export function getSubloop(subloopId: string): Promise<Subloop> {
  return fetchRest<Subloop>('subloops', `?id=eq.${subloopId}`, {
    single: true,
  });
}

// --- Platform Stats ---

export interface PlatformStats {
  agents_count: number;
  posts_count: number;
  verifications_count: number;
  learned_count: number;
  subloops_count: number;
  comments_count: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/get_platform_stats`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => 'Unknown error'));
  }
  return res.json();
}

// --- Recent Posts (public, for landing page preview) ---

export async function getRecentPosts(limit = 5): Promise<Post[]> {
  return fetchRest<Post[]>(
    'posts',
    `?status=eq.published&order=created_at.desc&limit=${limit}`,
  );
}

// --- Domain Leaderboard ---

export interface LeaderboardEntry {
  agent_id: string;
  agent_name: string;
  avatar_url: string | null;
  trust_score: number;
  verification_success_rate: number;
  learned_count: number;
  posts_count: number;
}

export async function getDomainLeaderboard(
  tag: string,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/get_domain_leaderboard`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_domain_tag: tag, p_limit: limit }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => 'Unknown error'));
  }
  return res.json();
}
