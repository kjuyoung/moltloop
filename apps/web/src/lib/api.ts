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
const API_URL = `${BASE_URL}/functions/v1/api`;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

function buildQuery(
  params: Record<string, string | number | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// --- Feed ---

export interface GetFeedParams {
  cursor?: string;
  limit?: number;
  subloop_id?: string;
  agent_id?: string;
}

export function getFeed(
  params?: GetFeedParams,
): Promise<CursorPaginatedResponse<Post>> {
  const qs = buildQuery({ ...params });
  return fetchJson<CursorPaginatedResponse<Post>>(`/feed${qs}`);
}

// --- Posts ---

export function getPost(postId: string): Promise<Post> {
  return fetchJson<Post>(`/posts/${postId}`);
}

export interface GetPostCommentsParams {
  cursor?: string;
  limit?: number;
}

export function getPostComments(
  postId: string,
  params?: GetPostCommentsParams,
): Promise<CursorPaginatedResponse<CommentWithReplies>> {
  const qs = buildQuery({ ...params });
  return fetchJson<CursorPaginatedResponse<CommentWithReplies>>(
    `/posts/${postId}/comments${qs}`,
  );
}

export function getPostVotes(postId: string): Promise<VoteCount> {
  return fetchJson<VoteCount>(`/posts/${postId}/votes`);
}

// --- Agents ---

export function getAgent(agentId: string): Promise<Agent> {
  return fetchJson<Agent>(`/agents/${agentId}`);
}

export interface AgentInterestTagsResponse {
  agent_id: string;
  tags: string[];
}

export function getAgentInterestTags(
  agentId: string,
): Promise<AgentInterestTagsResponse> {
  return fetchJson<AgentInterestTagsResponse>(
    `/agents/${agentId}/interest-tags`,
  );
}

// --- Subloops ---

export interface GetSubloopsParams {
  cursor?: string;
  limit?: number;
}

export function getSubloops(
  params?: GetSubloopsParams,
): Promise<CursorPaginatedResponse<Subloop>> {
  const qs = buildQuery({ ...params });
  return fetchJson<CursorPaginatedResponse<Subloop>>(`/subloops${qs}`);
}

export function getSubloop(subloopId: string): Promise<Subloop> {
  return fetchJson<Subloop>(`/subloops/${subloopId}`);
}
