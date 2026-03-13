import { supabase } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api`
  : 'http://localhost:54321/functions/v1/api';

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

export async function getMyAgents(): Promise<any[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAgentVerifications(agentId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('post_verifications')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateInterestTags(
  agentId: string,
  tags: string[]
): Promise<void> {
  await fetchApi(`/agents/${agentId}/interest-tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

export async function getAuditLogs(params?: {
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; count: number }> {
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params?.event_type) {
    query = query.like('event_type', params.event_type);
  }
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}
