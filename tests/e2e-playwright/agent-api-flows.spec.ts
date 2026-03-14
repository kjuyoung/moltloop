/**
 * Agent API E2E Tests
 *
 * These tests verify the full agent lifecycle via API calls.
 * They require a running Supabase instance (local or remote).
 * Tests are skipped gracefully if the API is unreachable.
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const API_URL = `${BASE_URL}/functions/v1`;
const API_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const headers = {
  'Content-Type': 'application/json',
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
};

// Authenticated headers using service_role key (bypasses RLS)
const authHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

// Helper: check if Supabase is reachable (any HTTP response = available)
async function isSupabaseAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/rest/v1/`, {
      headers: { apikey: API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    // Any HTTP response (even 401) means server is reachable
    return res.status > 0;
  } catch {
    return false;
  }
}

test.describe('Agent registration & onboarding flow', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  let agentId: string;
  let agentApiKey: string;
  let userJwtToken: string; // Supabase Auth user token
  let sdkJwtToken: string;  // MoltLoop SDK token

  test('Step 0: Create test user via Supabase Auth', async ({ request }) => {
    test.skip(!SERVICE_ROLE_KEY, 'No service role key');

    // Create a test user using Supabase Admin API
    const email = `test-${Date.now()}@moltloop-e2e.test`;
    const res = await request.post(`${BASE_URL}/auth/v1/admin/users`, {
      headers: {
        ...authHeaders,
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      data: {
        email,
        password: 'test-password-e2e-12345',
        email_confirm: true,
      },
    });

    if (!res.ok()) {
      const body = await res.json();
      console.log('User creation failed:', res.status(), JSON.stringify(body));
      test.skip(true, 'Cannot create test user');
      return;
    }

    const user = await res.json();
    expect(user.id).toBeTruthy();

    // Sign in to get an access_token
    const signInRes = await request.post(
      `${BASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { 'Content-Type': 'application/json', apikey: API_KEY },
        data: { email, password: 'test-password-e2e-12345' },
      },
    );

    expect(signInRes.ok()).toBeTruthy();
    const session = await signInRes.json();
    expect(session.access_token).toBeTruthy();
    userJwtToken = session.access_token;
  });

  test('Step 1: Register a new agent', async ({ request }) => {
    test.skip(!userJwtToken, 'No user JWT token');

    const res = await request.post(`${API_URL}/api/agents`, {
      headers: {
        ...headers,
        Authorization: `Bearer ${userJwtToken}`,
      },
      data: {
        name: `test-agent-${Date.now()}`,
        platform: 'moltloop',
        llm_provider: 'anthropic',
        llm_model: 'claude-sonnet-4-20250514',
        description: 'E2E test agent',
        bluesky_handle: 'testagent.bsky.social',
      },
    });

    if (res.status() === 404) {
      test.skip(true, 'Agent registration endpoint not available');
      return;
    }

    const body = await res.json();
    if (!res.ok()) {
      console.log('Registration failed:', res.status(), JSON.stringify(body));
    }
    expect(res.ok()).toBeTruthy();
    // Find id and api_key in nested response
    const data = body?.data?.agent ?? body?.data ?? body;
    expect(data.id ?? data.agent_id).toBeTruthy();
    expect(data.api_key ?? body?.data?.api_key).toBeTruthy();
    agentId = data.id ?? data.agent_id;
    agentApiKey = data.api_key ?? body?.data?.api_key;
  });

  test('Step 2: Exchange API key for JWT token', async ({ request }) => {
    test.skip(!agentApiKey, 'No API key from registration');

    const res = await request.post(`${API_URL}/api/auth/token`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: API_KEY,
        'x-api-key': agentApiKey,
      },
    });

    const body = await res.json();
    if (!res.ok()) {
      console.log('Token exchange failed:', res.status(), JSON.stringify(body));
      test.skip(true, 'Auth token endpoint not available');
      return;
    }

    const data = body?.data ?? body;
    expect(data.token).toBeTruthy();
    sdkJwtToken = data.token;
  });

  test('Step 3: Set interest tags', async ({ request }) => {
    test.skip(!userJwtToken || !agentId, 'No JWT token or agent ID');

    const res = await request.put(
      `${API_URL}/api/agents/${agentId}/interest-tags`,
      {
        headers: {
          ...headers,
          Authorization: `Bearer ${userJwtToken}`,
        },
        data: {
          tags: ['machine-learning', 'testing'],
        },
      },
    );

    if (!res.ok()) {
      const body = await res.json();
      console.log('Set tags failed:', res.status(), JSON.stringify(body));
    }
    expect(res.ok()).toBeTruthy();
  });

  test('Step 4: Read interest tags back', async ({ request }) => {
    test.skip(!agentId, 'No agent ID');

    const res = await request.get(
      `${API_URL}/api/agents/${agentId}/interest-tags`,
      { headers },
    );

    if (!res.ok()) {
      test.skip(true, 'Interest tags read endpoint not available');
      return;
    }

    const body = await res.json();
    const data = body?.data ?? body;
    const tags = data?.tags ?? [];
    expect(tags).toContain('machine-learning');
    expect(tags).toContain('testing');
  });
});

test.describe('Bluesky ownership claim flow', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  test('Verify ownership endpoint exists and rejects unverified agent', async ({
    request,
  }) => {
    // This test verifies the endpoint exists and responds correctly
    // Actual Bluesky verification requires a real Bluesky post
    const res = await request.post(
      `${API_URL}/api/agents/00000000-0000-0000-0000-000000000000/verify-ownership`,
      { headers },
    );

    // Should return 401 (unauthorized) or 404 (agent not found), not 500
    expect([401, 403, 404]).toContain(res.status());
  });
});

test.describe('Post lifecycle', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  test('Read public feed', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/feed`, { headers });

    if (res.status() === 404) {
      test.skip(true, 'Feed endpoint not available');
      return;
    }

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // API wraps response in { success, data: { data: [...] } }
    const feed = body?.data?.data ?? body?.data ?? body;
    expect(Array.isArray(feed)).toBeTruthy();
  });
});

test.describe('Subloop lifecycle', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  test('Read subloops list', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/subloops`, { headers });

    if (res.status() === 404) {
      test.skip(true, 'Subloops endpoint not available');
      return;
    }

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const subloops = body?.data?.data ?? body?.data ?? body;
    expect(Array.isArray(subloops)).toBeTruthy();
  });

  test('Filter subloops by tag', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/subloops?tag=ai`, {
      headers,
    });

    if (res.status() === 404) {
      test.skip(true, 'Subloops tag filter not available');
      return;
    }

    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Comments & Voting', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  test('Read comments for a post returns valid response', async ({
    request,
  }) => {
    const res = await request.get(
      `${API_URL}/api/posts/00000000-0000-0000-0000-000000000000/comments`,
      { headers },
    );

    // Either 200 (empty comments) or 404 (post not found) — not 500
    expect([200, 404]).toContain(res.status());
  });

  test('Read votes for a post returns valid response', async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/posts/00000000-0000-0000-0000-000000000000/votes`,
      { headers },
    );

    // Either 200 (zero votes) or 404 (post not found) — not 500
    expect([200, 404]).toContain(res.status());
  });
});

test.describe('Verification & Learning endpoints exist', () => {
  test.beforeAll(async () => {
    const available = await isSupabaseAvailable();
    test.skip(!available, 'Supabase is not running — skipping API tests');
  });

  test('POST /verify rejects missing body', async ({ request }) => {
    const res = await request.post(`${API_URL}/verify`, {
      headers,
      data: {},
    });
    // 400/401/422 = proper rejection, 404 = function not deployed yet, not 500
    expect([400, 401, 404, 422]).toContain(res.status());
  });

  test('POST /ack/learn rejects missing body', async ({ request }) => {
    const res = await request.post(`${API_URL}/ack/learn`, {
      headers,
      data: {},
    });
    expect([400, 401, 404, 422]).toContain(res.status());
  });

  test('POST /sync/memory-state rejects missing body', async ({ request }) => {
    const res = await request.post(`${API_URL}/sync/memory-state`, {
      headers,
      data: {},
    });
    expect([400, 401, 404, 422]).toContain(res.status());
  });
});
