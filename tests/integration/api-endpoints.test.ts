/**
 * API Endpoint Integration Tests
 *
 * Tests each major API flow by importing business logic packages and
 * verifying their behavior with mocked Supabase (DbClient).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  DbClient,
  Comment,
  AgentStats,
} from '@moltloop/shared';

// ---------------------------------------------------------------------------
// Shared mock DB infrastructure
// ---------------------------------------------------------------------------

type TableRow = Record<string, unknown>;

interface MockTable {
  rows: TableRow[];
}

interface MockStore {
  tables: Record<string, MockTable>;
  rpcHandlers: Record<string, (params: Record<string, unknown>) => unknown>;
}

let store: MockStore;

function resetStore(): void {
  store = {
    tables: {
      agents: { rows: [] },
      agent_interest_tags: { rows: [] },
      posts: { rows: [] },
      comments: { rows: [] },
      votes: { rows: [] },
      post_verifications: { rows: [] },
    },
    rpcHandlers: {},
  };
}

/**
 * Create a mock DbClient backed by in-memory tables.
 * Supports eq filtering, order, limit, single, insert, update, upsert, delete.
 */
function createMockDb(): DbClient {
  function matchesFilter(row: TableRow, filters: Array<{ column: string; op: string; value: unknown }>): boolean {
    return filters.every((f) => {
      const val = row[f.column];
      switch (f.op) {
        case 'eq':
          return val === f.value;
        case 'neq':
          return val !== f.value;
        case 'gt':
          return (val as string) > (f.value as string);
        case 'lt':
          return (val as string) < (f.value as string);
        case 'is':
          return f.value === null ? val === null || val === undefined : val === f.value;
        default:
          return true;
      }
    });
  }

  function createBuilder(
    tableName: string,
    operation: string,
    insertData?: TableRow | TableRow[],
    updateData?: TableRow,
    upsertConflictOption?: string,
  ): DbFilterBuilder {
    const filters: Array<{ column: string; op: string; value: unknown }> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    const upsertConflict: string | undefined = upsertConflictOption;

    const builder: DbFilterBuilder = {
      eq(column, value) { filters.push({ column, op: 'eq', value }); return builder; },
      neq(column, value) { filters.push({ column, op: 'neq', value }); return builder; },
      in(column, values) { filters.push({ column, op: 'in', value: values }); return builder; },
      is(column, value) { filters.push({ column, op: 'is', value }); return builder; },
      gt(column, value) { filters.push({ column, op: 'gt', value }); return builder; },
      lt(column, value) { filters.push({ column, op: 'lt', value }); return builder; },
      gte(column, value) { filters.push({ column, op: 'gte', value }); return builder; },
      lte(column, value) { filters.push({ column, op: 'lte', value }); return builder; },
      like(_c, _p) { return builder; },
      order(column, options) { orderCol = column; orderAsc = options?.ascending ?? true; return builder; },
      limit(count) { limitN = count; return builder; },
      range(_f, _t) { return builder; },
      async single() {
        const table = store.tables[tableName];
        if (!table) return { data: null, error: { message: `Table ${tableName} not found` } };
        const row = table.rows.find((r) => matchesFilter(r, filters));
        if (!row) return { data: null, error: { message: 'Row not found' } };
        return { data: { ...row }, error: null };
      },
      async maybeSingle() {
        const table = store.tables[tableName];
        if (!table) return { data: null, error: null };
        const row = table.rows.find((r) => matchesFilter(r, filters));
        return { data: row ? { ...row } : null, error: null };
      },
      then(resolve) {
        const table = store.tables[tableName];
        if (!table) {
          resolve({ data: null, error: { message: `Table ${tableName} not found` } } as any);
          return;
        }

        if (operation === 'insert') {
          const items = Array.isArray(insertData) ? insertData : [insertData!];
          for (const item of items) {
            // Auto-generate id if not present
            const row: TableRow = {
              id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...item,
            };
            table.rows.push(row);
          }
          resolve({ data: null, error: null } as any);
          return;
        }

        if (operation === 'update') {
          for (const row of table.rows) {
            if (matchesFilter(row, filters)) {
              Object.assign(row, updateData);
            }
          }
          resolve({ data: null, error: null } as any);
          return;
        }

        if (operation === 'upsert') {
          const items = Array.isArray(insertData) ? insertData : [insertData!];
          for (const item of items) {
            const conflictCols = upsertConflict?.split(',').map((c) => c.trim()) ?? ['id'];
            const existing = table.rows.find((r) =>
              conflictCols.every((c) => r[c] === item[c]),
            );
            if (existing) {
              Object.assign(existing, item, { updated_at: new Date().toISOString() });
            } else {
              table.rows.push({
                id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...item,
              });
            }
          }
          resolve({ data: null, error: null } as any);
          return;
        }

        if (operation === 'delete') {
          table.rows = table.rows.filter((r) => !matchesFilter(r, filters));
          resolve({ data: null, error: null } as any);
          return;
        }

        // select
        let rows = table.rows.filter((r) => matchesFilter(r, filters));
        if (orderCol) {
          const col = orderCol;
          const asc = orderAsc;
          rows = [...rows].sort((a, b) => {
            const va = a[col] as string;
            const vb = b[col] as string;
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        }
        if (limitN !== null) {
          rows = rows.slice(0, limitN);
        }
        resolve({ data: rows.map((r) => ({ ...r })), error: null } as any);
      },
    };

    return builder;
  }

  return {
    from(table: string): DbQueryBuilder {
      return {
        select(_columns?: string) { return createBuilder(table, 'select'); },
        insert(values) { return createBuilder(table, 'insert', values as TableRow | TableRow[]); },
        update(values) { return createBuilder(table, 'update', undefined, values as TableRow); },
        delete() { return createBuilder(table, 'delete'); },
        upsert(values, options) { return createBuilder(table, 'upsert', values as TableRow | TableRow[], undefined, options?.onConflict); },
      };
    },
    async rpc(fn: string, params?: Record<string, unknown>): Promise<DbResult<unknown>> {
      const handler = store.rpcHandlers[fn];
      if (handler) {
        return { data: handler(params ?? {}), error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Agent Registration Flow
// ---------------------------------------------------------------------------

// We need to mock @moltloop/auth since generateApiKey uses crypto
vi.mock('@moltloop/auth', () => ({
  generateApiKey: vi.fn().mockResolvedValue({
    key: 'ml_' + 'a'.repeat(32),
    hash: 'hash_' + 'a'.repeat(32),
  }),
  verifyBlueskyClaimPost: vi.fn().mockResolvedValue({
    verified: true,
    did: 'did:plc:test123',
    claim_uri: 'at://did:plc:test123/app.bsky.feed.post/abc',
    agent_name: 'test-agent',
    handle: 'test.bsky.social',
  }),
}));

describe('Agent Registration Flow', () => {
  let db: DbClient;

  beforeEach(() => {
    resetStore();
    db = createMockDb();
  });

  it('should register an agent and return api_key', async () => {
    const { registerAgent } = await import('@moltloop/agents');

    const result = await registerAgent('owner-1', {
      name: 'test-agent',
      platform: 'moltloop',
      description: 'A test agent',
      interest_topics: ['ai', 'research'],
    }, db);

    expect(result.api_key).toBe('ml_' + 'a'.repeat(32));
    expect(result.agent).toBeTruthy();
    expect(result.agent.name).toBe('test-agent');
    expect(result.agent.owner_id).toBe('owner-1');

    // Interest tags should be inserted
    expect(store.tables.agent_interest_tags.rows).toHaveLength(2);
    expect(store.tables.agent_interest_tags.rows.map((r) => r.tag)).toEqual(['ai', 'research']);
  });

  it('should reject duplicate agent names', async () => {
    const { registerAgent } = await import('@moltloop/agents');

    // Pre-populate an agent with the same name
    store.tables.agents.rows.push({
      id: 'existing-id',
      owner_id: 'owner-0',
      name: 'taken-name',
    });

    await expect(
      registerAgent('owner-1', { name: 'taken-name' }, db),
    ).rejects.toThrow(/already taken/);
  });

  it('should verify ownership via Bluesky', async () => {
    const { verifyOwnership } = await import('@moltloop/agents');

    // Set up agent with bluesky handle
    store.tables.agents.rows.push({
      id: 'agent-1',
      owner_id: 'owner-1',
      name: 'my-agent',
      bluesky_handle: 'test.bsky.social',
      ownership_verified: false,
    });

    const result = await verifyOwnership('agent-1', 'owner-1', db);

    expect(result.verified).toBe(true);
    expect(result.did).toBe('did:plc:test123');
    expect(result.claim_uri).toBeTruthy();

    // Agent should be updated
    const agent = store.tables.agents.rows[0];
    expect(agent.ownership_verified).toBe(true);
    expect(agent.bluesky_did).toBe('did:plc:test123');
  });

  it('should get agent profile', async () => {
    const { getAgent } = await import('@moltloop/agents');

    store.tables.agents.rows.push({
      id: 'agent-1',
      owner_id: 'owner-1',
      name: 'profile-agent',
      platform: 'moltloop',
      description: 'Test desc',
    });

    const agent = await getAgent('agent-1', db);
    expect(agent).toBeTruthy();
    expect(agent!.name).toBe('profile-agent');
  });
});

// ---------------------------------------------------------------------------
// 2. Post Creation Flow
// ---------------------------------------------------------------------------

describe('Post Creation Flow', () => {
  let db: DbClient;

  beforeEach(() => {
    resetStore();
    db = createMockDb();
  });

  it('should create a draft post', async () => {
    const { createPost } = await import('@moltloop/posts');

    const post = await createPost(db, 'agent-1', {
      content: 'Draft content here.',
      source_url: 'https://example.com/source',
      source_content_type: 'text/html',
      source_quote_location: {
        type: 'html',
        selector: 'p',
        text_fragment: 'Draft content here.',
      },
    });

    expect(post).toBeTruthy();
    expect(post.status).toBe('draft');
    expect(post.agent_id).toBe('agent-1');
    expect(post.source_url).toBe('https://example.com/source');
  });

  it('should reject post without content', async () => {
    const { createPost } = await import('@moltloop/posts');

    await expect(
      createPost(db, 'agent-1', { content: '' }),
    ).rejects.toThrow(/content is required/);
  });

  it('should reject non-https source URL', async () => {
    const { createPost } = await import('@moltloop/posts');

    await expect(
      createPost(db, 'agent-1', {
        content: 'Content',
        source_url: 'http://insecure.com',
      }),
    ).rejects.toThrow(/https/);
  });

  it('should publish a draft post with complete source fields', async () => {
    const { publishPost } = await import('@moltloop/posts');

    // Pre-populate a draft post
    store.tables.posts.rows.push({
      id: 'post-1',
      agent_id: 'agent-1',
      status: 'draft',
      content: 'Publishable content',
      source_url: 'https://example.com/article',
      source_content_type: 'text/html',
      source_quote_location: JSON.stringify({
        type: 'html',
        selector: 'p',
        text_fragment: 'content',
      }),
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const published = await publishPost(db, 'agent-1', 'post-1');

    expect(published.status).toBe('published');
  });

  it('should reject publishing post without source_url', async () => {
    const { publishPost } = await import('@moltloop/posts');

    store.tables.posts.rows.push({
      id: 'post-2',
      agent_id: 'agent-1',
      status: 'draft',
      content: 'No source',
      source_url: null,
      source_content_type: null,
      source_quote_location: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    await expect(
      publishPost(db, 'agent-1', 'post-2'),
    ).rejects.toThrow(/source_url/);
  });

  it('should appear in feed after publishing', async () => {
    const { getFeed } = await import('@moltloop/feed');

    store.tables.posts.rows.push({
      id: 'post-pub',
      agent_id: 'agent-1',
      status: 'published',
      content: 'Visible in feed.',
      source_url: 'https://example.com/source',
      source_content_type: 'text/html',
      source_quote_location: '{}',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const feed = await getFeed(db, { limit: 10 });

    expect(feed.data).toHaveLength(1);
    expect(feed.data[0].id).toBe('post-pub');
    expect(feed.data[0].status).toBe('published');
  });

  it('drafts should NOT appear in feed', async () => {
    const { getFeed } = await import('@moltloop/feed');

    store.tables.posts.rows.push({
      id: 'draft-1',
      agent_id: 'agent-1',
      status: 'draft',
      content: 'Draft not in feed.',
      source_url: null,
      source_content_type: null,
      source_quote_location: null,
      created_at: '2026-01-01T00:00:00Z',
    });

    const feed = await getFeed(db, { limit: 10 });
    expect(feed.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Comment Flow
// ---------------------------------------------------------------------------

describe('Comment Flow', () => {
  let db: DbClient;

  beforeEach(() => {
    resetStore();
    db = createMockDb();
  });

  it('should create a root comment', async () => {
    const { createComment } = await import('@moltloop/comments');

    const comment = await createComment(db, 'agent-1', {
      post_id: 'post-1',
      content: 'This is a comment.',
    });

    expect(comment).toBeTruthy();
    expect(comment.content).toBe('This is a comment.');
    expect(comment.agent_id).toBe('agent-1');
    expect(comment.parent_id).toBeNull();
  });

  it('should create a reply (nested comment)', async () => {
    const { createComment } = await import('@moltloop/comments');

    // Create root comment first
    store.tables.comments.rows.push({
      id: 'comment-root',
      post_id: 'post-1',
      agent_id: 'agent-1',
      parent_id: null,
      depth: 0,
      content: 'Root comment',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    // Create reply
    const reply = await createComment(db, 'agent-2', {
      post_id: 'post-1',
      parent_id: 'comment-root',
      content: 'This is a reply.',
    });

    expect(reply.content).toBe('This is a reply.');
    expect(reply.parent_id).toBe('comment-root');
  });

  it('should reject empty comment', async () => {
    const { createComment } = await import('@moltloop/comments');

    await expect(
      createComment(db, 'agent-1', {
        post_id: 'post-1',
        content: '',
      }),
    ).rejects.toThrow(/empty/);
  });

  it('should build comment tree from flat list', async () => {
    const { buildCommentTree } = await import('@moltloop/comments');

    const comments: Comment[] = [
      {
        id: 'c1',
        post_id: 'p1',
        agent_id: 'a1',
        parent_id: null,
        depth: 0,
        content: 'Root 1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        post_id: 'p1',
        agent_id: 'a2',
        parent_id: 'c1',
        depth: 1,
        content: 'Reply to Root 1',
        created_at: '2026-01-01T00:01:00Z',
        updated_at: '2026-01-01T00:01:00Z',
      },
      {
        id: 'c3',
        post_id: 'p1',
        agent_id: 'a1',
        parent_id: 'c2',
        depth: 2,
        content: 'Reply to reply',
        created_at: '2026-01-01T00:02:00Z',
        updated_at: '2026-01-01T00:02:00Z',
      },
      {
        id: 'c4',
        post_id: 'p1',
        agent_id: 'a3',
        parent_id: null,
        depth: 0,
        content: 'Root 2',
        created_at: '2026-01-01T00:03:00Z',
        updated_at: '2026-01-01T00:03:00Z',
      },
    ];

    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(2); // 2 root comments
    expect(tree[0].id).toBe('c1');
    expect(tree[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe('c2');
    expect(tree[0].replies[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].replies[0].id).toBe('c3');
    expect(tree[1].id).toBe('c4');
    expect(tree[1].replies).toHaveLength(0);
  });

  it('should list comments with pagination', async () => {
    const { listComments } = await import('@moltloop/comments');

    // Add 3 comments
    for (let i = 1; i <= 3; i++) {
      store.tables.comments.rows.push({
        id: `c${i}`,
        post_id: 'post-1',
        agent_id: 'agent-1',
        parent_id: null,
        depth: 0,
        content: `Comment ${i}`,
        created_at: `2026-01-0${i}T00:00:00Z`,
        updated_at: `2026-01-0${i}T00:00:00Z`,
      });
    }

    const result = await listComments(db, 'post-1', { limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.has_next).toBe(true);
    expect(result.next_cursor).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. Voting Flow
// ---------------------------------------------------------------------------

describe('Voting Flow', () => {
  let db: DbClient;

  beforeEach(() => {
    resetStore();
    db = createMockDb();

    // Set up RPC handler for trust score
    store.rpcHandlers['calculate_trust_score'] = (params) => {
      // Agent with some activity gets a higher score
      const agentId = params.p_agent_id as string;
      if (agentId === 'active-agent') return 15;
      return 1; // default
    };

    store.rpcHandlers['get_post_vote_counts'] = (params) => {
      const postId = params.p_post_id as string;
      const votes = store.tables.votes.rows.filter((v) => v.post_id === postId);
      const upvotes = votes.filter((v) => v.direction === 'up').length;
      const downvotes = votes.filter((v) => v.direction === 'down').length;
      const weightedScore = votes.reduce((sum, v) => {
        const w = v.weight as number;
        return sum + (v.direction === 'up' ? w : -w);
      }, 0);
      return { post_id: postId, upvotes, downvotes, weighted_score: weightedScore };
    };
  });

  it('should calculate trust score from agent stats', async () => {
    const { calculateTrustScore } = await import('@moltloop/voting');

    const stats: AgentStats = {
      posts_count: 5,
      verifications_count: 3,
      learned_count: 2,
    };

    // 5*1 + 3*2 + 2*3 = 5 + 6 + 6 = 17
    const score = calculateTrustScore(stats);
    expect(score).toBe(17);
  });

  it('should clamp trust score to min/max', async () => {
    const { calculateTrustScore } = await import('@moltloop/voting');

    // Zero activity -> min score
    const minScore = calculateTrustScore({
      posts_count: 0,
      verifications_count: 0,
      learned_count: 0,
    });
    expect(minScore).toBe(1); // TRUST_SCORE_MIN

    // Very high activity -> max score
    const maxScore = calculateTrustScore({
      posts_count: 100,
      verifications_count: 100,
      learned_count: 100,
    });
    expect(maxScore).toBe(100); // TRUST_SCORE_MAX
  });

  it('should cast an upvote with trust-weighted weight', async () => {
    const { castVote } = await import('@moltloop/voting');

    const vote = await castVote(db, 'agent-1', {
      post_id: 'post-1',
      direction: 'up',
    });

    expect(vote).toBeTruthy();
    expect(vote.direction).toBe('up');
    expect(vote.weight).toBe(1); // default trust score
    expect(vote.post_id).toBe('post-1');
    expect(vote.agent_id).toBe('agent-1');
  });

  it('should upsert vote when changing direction', async () => {
    const { castVote } = await import('@moltloop/voting');

    // First: upvote
    await castVote(db, 'agent-1', {
      post_id: 'post-1',
      direction: 'up',
    });

    expect(store.tables.votes.rows).toHaveLength(1);
    expect(store.tables.votes.rows[0].direction).toBe('up');

    // Change to downvote (upsert)
    const downvote = await castVote(db, 'agent-1', {
      post_id: 'post-1',
      direction: 'down',
    });

    // Should still be 1 record (upserted)
    expect(store.tables.votes.rows).toHaveLength(1);
    expect(downvote.direction).toBe('down');
  });

  it('should get vote counts for a post', async () => {
    const { getVoteCounts } = await import('@moltloop/voting');

    // Add some votes directly
    store.tables.votes.rows.push(
      { post_id: 'post-1', agent_id: 'a1', direction: 'up', weight: 5 },
      { post_id: 'post-1', agent_id: 'a2', direction: 'up', weight: 3 },
      { post_id: 'post-1', agent_id: 'a3', direction: 'down', weight: 2 },
    );

    const counts = await getVoteCounts(db, 'post-1');

    expect(counts.post_id).toBe('post-1');
    expect(counts.upvotes).toBe(2);
    expect(counts.downvotes).toBe(1);
    expect(counts.weighted_score).toBe(6); // 5 + 3 - 2
  });

  it('should remove a vote', async () => {
    const { removeVote } = await import('@moltloop/voting');

    store.tables.votes.rows.push({
      post_id: 'post-1',
      agent_id: 'agent-1',
      direction: 'up',
      weight: 1,
    });

    expect(store.tables.votes.rows).toHaveLength(1);

    await removeVote(db, 'agent-1', 'post-1');

    expect(store.tables.votes.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Feed Pagination Flow
// ---------------------------------------------------------------------------

describe('Feed Pagination Flow', () => {
  let db: DbClient;

  beforeEach(() => {
    resetStore();
    db = createMockDb();

    // Create 5 published posts with different timestamps
    for (let i = 1; i <= 5; i++) {
      store.tables.posts.rows.push({
        id: `post-${i}`,
        agent_id: 'agent-1',
        subloop_id: null,
        status: 'published',
        content: `Post content ${i}`,
        source_url: `https://example.com/source-${i}`,
        source_content_type: 'text/html',
        source_quote_location: '{}',
        created_at: `2026-01-0${i}T00:00:00Z`,
        updated_at: `2026-01-0${i}T00:00:00Z`,
      });
    }
  });

  it('should return posts ordered by created_at DESC', async () => {
    const { getFeed } = await import('@moltloop/feed');

    const feed = await getFeed(db, { limit: 10 });

    expect(feed.data).toHaveLength(5);
    // Should be newest first
    expect(feed.data[0].id).toBe('post-5');
    expect(feed.data[4].id).toBe('post-1');
    expect(feed.has_next).toBe(false);
  });

  it('should paginate with cursor', async () => {
    const { getFeed } = await import('@moltloop/feed');

    // First page: get 2 items
    const page1 = await getFeed(db, { limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page1.has_next).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Second page: use cursor
    const page2 = await getFeed(db, {
      limit: 2,
      cursor: page1.next_cursor!,
    });

    expect(page2.data).toHaveLength(2);
    // Pages should not overlap
    const page1Ids = page1.data.map((p) => p.id);
    const page2Ids = page2.data.map((p) => p.id);
    expect(page1Ids).not.toEqual(expect.arrayContaining(page2Ids));
  });

  it('should filter by subloop_id', async () => {
    const { getFeed } = await import('@moltloop/feed');

    // Add a post in a subloop
    store.tables.posts.rows.push({
      id: 'post-sub',
      agent_id: 'agent-2',
      subloop_id: 'subloop-1',
      status: 'published',
      content: 'Subloop post',
      source_url: 'https://example.com/sub',
      source_content_type: 'text/html',
      source_quote_location: '{}',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    });

    const feed = await getFeed(db, {
      limit: 10,
      subloop_id: 'subloop-1',
    });

    expect(feed.data).toHaveLength(1);
    expect(feed.data[0].id).toBe('post-sub');
  });

  it('should filter by agent_id', async () => {
    const { getFeed } = await import('@moltloop/feed');

    // Add a post by a different agent
    store.tables.posts.rows.push({
      id: 'post-other',
      agent_id: 'agent-2',
      subloop_id: null,
      status: 'published',
      content: 'Other agent post',
      source_url: 'https://example.com/other',
      source_content_type: 'text/html',
      source_quote_location: '{}',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    });

    const feed = await getFeed(db, {
      limit: 10,
      agent_id: 'agent-2',
    });

    expect(feed.data).toHaveLength(1);
    expect(feed.data[0].agent_id).toBe('agent-2');
  });

  it('should respect max page size', async () => {
    const { getFeed } = await import('@moltloop/feed');

    // Request more than MAX_PAGE_SIZE
    const feed = await getFeed(db, { limit: 999 });

    // Should still return data (clamped to MAX_PAGE_SIZE)
    expect(feed.data.length).toBeLessThanOrEqual(100);
  });

  it('should exclude draft posts from feed', async () => {
    const { getFeed } = await import('@moltloop/feed');

    // Add a draft post
    store.tables.posts.rows.push({
      id: 'draft-hidden',
      agent_id: 'agent-1',
      subloop_id: null,
      status: 'draft',
      content: 'This is a draft',
      source_url: null,
      source_content_type: null,
      source_quote_location: null,
      created_at: '2026-01-15T00:00:00Z',
    });

    const feed = await getFeed(db, { limit: 20 });

    const ids = feed.data.map((p) => p.id);
    expect(ids).not.toContain('draft-hidden');
  });
});
