import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports that use them)
// ---------------------------------------------------------------------------

vi.mock('@moltloop/memory-writer', () => ({
  resolveMemoryPath: vi.fn().mockReturnValue('/tmp/test-memory.md'),
  listLearnedBlocks: vi.fn().mockResolvedValue([]),
  appendLearningBlock: vi.fn().mockResolvedValue(true),
  removeLearningBlock: vi.fn().mockResolvedValue(true),
}));

vi.mock('@moltloop/sanitizer', () => ({
  sanitize: vi.fn().mockReturnValue({ safe: true, content: 'clean content' }),
}));

import { MoltLoopClient } from '../client';
import {
  resolveMemoryPath,
  listLearnedBlocks,
  appendLearningBlock,
  removeLearningBlock,
} from '@moltloop/memory-writer';
import { sanitize } from '@moltloop/sanitizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SERVER_URL = 'http://localhost';
const TEST_API_KEY = 'ml_' + 'a'.repeat(32); // 35 chars

function createFetchMock(
  responses: Record<string, { status: number; body: unknown }>,
) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [path, response] of Object.entries(responses)) {
      if ((url as string).includes(path)) {
        return Promise.resolve({
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: () => Promise.resolve(response.body),
          text: () => Promise.resolve(JSON.stringify(response.body)),
        });
      }
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });
}

const defaultAuthResponse = {
  token: 'test-jwt',
  agent_id: 'agent-1',
  owner_id: 'owner-1',
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};

const defaultSyncResponse = { adjustments: [] };

/** Set up fetch mock with auth + sync + any extra route responses. */
function setupFetchWithAuth(
  extra: Record<string, { status: number; body: unknown }> = {},
) {
  const mock = createFetchMock({
    '/api/auth/token': { status: 200, body: defaultAuthResponse },
    '/sync/memory-state': { status: 200, body: defaultSyncResponse },
    ...extra,
  });
  globalThis.fetch = mock;
  return mock;
}

/** Create a client and initialise it (mocking auth + sync). */
async function createInitializedClient(
  extra: Record<string, { status: number; body: unknown }> = {},
) {
  const fetchMock = setupFetchWithAuth(extra);
  const client = new MoltLoopClient({
    serverUrl: TEST_SERVER_URL,
    apiKey: TEST_API_KEY,
  });
  await client.init();
  return { client, fetchMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoltLoopClient.init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should authenticate and sync on init', async () => {
    const fetchMock = setupFetchWithAuth();
    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });

    const result = await client.init();

    expect(result).toEqual({ adjustments: [] });
    // Should have called auth/token first, then sync
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/auth/token');
    expect(fetchMock.mock.calls[1][0]).toContain('/sync/memory-state');
  });

  it('should throw if authentication fails', async () => {
    globalThis.fetch = createFetchMock({
      '/api/auth/token': { status: 401, body: { error: 'Unauthorized' } },
    });

    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });

    await expect(client.init()).rejects.toThrow(/Authentication failed/);
  });

  it('should use agentId from config if provided', async () => {
    setupFetchWithAuth();
    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
      agentId: 'custom-agent',
    });

    await client.init();

    // resolveMemoryPath should NOT be called because agentId was set but
    // memoryPath was not, so it should resolve with the custom agent id
    expect(resolveMemoryPath).toHaveBeenCalledWith('custom-agent');
  });
});

describe('MoltLoopClient.learn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if not initialized', async () => {
    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });

    await expect(client.learn('post-1')).rejects.toThrow(
      /not initialized/,
    );
  });

  it('should complete full learn flow', async () => {
    const { client, fetchMock } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'verified',
          extracted_text: 'raw content',
          source_url: 'https://example.com/source',
        },
      },
      '/api/learn/start': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'learning_pending' },
      },
      '/ack/learn': {
        status: 200,
        body: {
          post_id: 'post-1',
          attempt_no: 1,
          status: 'learned',
          learned_at: '2026-01-01T00:00:00Z',
        },
      },
    });

    const result = await client.learn('post-1');

    expect(result).toEqual({
      success: true,
      post_id: 'post-1',
      attempt_no: 1,
      learned_at: '2026-01-01T00:00:00Z',
    });

    // sanitize should have been called with the extracted text
    expect(sanitize).toHaveBeenCalledWith('raw content');
    // appendLearningBlock should have been called
    expect(appendLearningBlock).toHaveBeenCalledWith(
      '/tmp/test-memory.md',
      expect.objectContaining({
        post_id: 'post-1',
        attempt_no: 1,
        content: 'clean content',
        source_url: 'https://example.com/source',
      }),
      undefined, // maxMemorySize
    );

    // Verify correct endpoints called: auth + sync + verify + learn/start + ack/learn
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(urls).toContainEqual(expect.stringContaining('/verify'));
    expect(urls).toContainEqual(expect.stringContaining('/api/learn/start'));
    expect(urls).toContainEqual(expect.stringContaining('/ack/learn'));
  });

  it('should return failure on verification rejection', async () => {
    const { client } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'rejected',
          reason: 'source_mismatch',
          detail: 'Quote not found in source',
        },
      },
    });

    const result = await client.learn('post-1');

    expect(result).toEqual({
      success: false,
      post_id: 'post-1',
      reason: 'source_mismatch',
      detail: 'Quote not found in source',
    });
  });

  it('should return failure on verification HTTP error', async () => {
    const { client } = await createInitializedClient({
      '/verify': { status: 500, body: { error: 'Internal Server Error' } },
    });

    const result = await client.learn('post-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('verification_error');
    }
  });

  it('should return failure on sanitization rejection', async () => {
    (sanitize as Mock).mockReturnValueOnce({
      safe: false,
      content: '',
      rejected_reason: 'instruction_override',
    });

    const { client, fetchMock } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'verified',
          extracted_text: 'malicious content',
          source_url: 'https://example.com',
        },
      },
      '/api/learn/start': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'learning_pending' },
      },
      '/ack/learn': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'failed' },
      },
    });

    const result = await client.learn('post-1');

    expect(result).toEqual({
      success: false,
      post_id: 'post-1',
      reason: 'sanitization_rejected',
      detail: 'instruction_override',
    });

    // Should have called ack with failure
    const ackCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('/ack/learn'),
    );
    expect(ackCall).toBeDefined();
    const ackBody = JSON.parse(ackCall![1].body);
    expect(ackBody.result).toBe('failure');
    expect(ackBody.reason).toContain('sanitization_rejected');
  });

  it('should return failure on memory write failure', async () => {
    (appendLearningBlock as Mock).mockRejectedValueOnce(
      new Error('disk full'),
    );

    const { client } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'verified',
          extracted_text: 'content',
          source_url: 'https://example.com',
        },
      },
      '/api/learn/start': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'learning_pending' },
      },
      '/ack/learn': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'failed' },
      },
    });

    const result = await client.learn('post-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('memory_write_failed');
    }
  });

  it('should return failure on ack error', async () => {
    const { client } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'verified',
          extracted_text: 'content',
          source_url: 'https://example.com',
        },
      },
      '/api/learn/start': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'learning_pending' },
      },
      '/ack/learn': { status: 500, body: { error: 'server error' } },
    });

    const result = await client.learn('post-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('ack_error');
      expect(result.detail).toContain('acknowledgement failed');
    }
  });

  it('should return failure on learn/start error', async () => {
    const { client } = await createInitializedClient({
      '/verify': {
        status: 200,
        body: {
          post_id: 'post-1',
          agent_id: 'agent-1',
          attempt_no: 1,
          status: 'verified',
          extracted_text: 'content',
          source_url: 'https://example.com',
        },
      },
      '/api/learn/start': { status: 409, body: { error: 'conflict' } },
    });

    const result = await client.learn('post-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('learn_start_error');
    }
  });
});

describe('MoltLoopClient.rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if not initialized', async () => {
    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });

    await expect(client.rollback('post-1', 1)).rejects.toThrow(
      /not initialized/,
    );
  });

  it('should complete full rollback flow', async () => {
    const { client } = await createInitializedClient({
      '/api/learn/rollback-start': {
        status: 200,
        body: {
          post_id: 'post-1',
          attempt_no: 1,
          status: 'rollback_pending',
        },
      },
      '/ack/rollback': {
        status: 200,
        body: {
          post_id: 'post-1',
          attempt_no: 1,
          status: 'rolled_back',
          rolled_back_at: '2026-01-01T00:00:00Z',
        },
      },
    });

    const result = await client.rollback('post-1', 1);

    expect(result).toEqual({
      success: true,
      post_id: 'post-1',
      attempt_no: 1,
      rolled_back_at: '2026-01-01T00:00:00Z',
    });

    expect(removeLearningBlock).toHaveBeenCalledWith(
      '/tmp/test-memory.md',
      'post-1',
      1,
    );
  });

  it('should return failure on memory remove failure', async () => {
    (removeLearningBlock as Mock).mockRejectedValueOnce(
      new Error('file locked'),
    );

    const { client } = await createInitializedClient({
      '/api/learn/rollback-start': {
        status: 200,
        body: {
          post_id: 'post-1',
          attempt_no: 1,
          status: 'rollback_pending',
        },
      },
      '/ack/rollback': {
        status: 200,
        body: { post_id: 'post-1', attempt_no: 1, status: 'failed' },
      },
    });

    const result = await client.rollback('post-1', 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('memory_remove_failed');
    }
  });

  it('should return failure on rollback-start error', async () => {
    const { client } = await createInitializedClient({
      '/api/learn/rollback-start': {
        status: 409,
        body: { error: 'invalid state transition' },
      },
    });

    const result = await client.rollback('post-1', 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('rollback_start_error');
    }
  });

  it('should return failure on ack/rollback error', async () => {
    const { client } = await createInitializedClient({
      '/api/learn/rollback-start': {
        status: 200,
        body: {
          post_id: 'post-1',
          attempt_no: 1,
          status: 'rollback_pending',
        },
      },
      '/ack/rollback': { status: 500, body: { error: 'server error' } },
    });

    const result = await client.rollback('post-1', 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('ack_error');
    }
  });
});

describe('MoltLoopClient.sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send local blocks to server', async () => {
    const localBlocks = [
      {
        post_id: 'post-1',
        attempt_no: 1,
        timestamp: '2026-01-01T00:00:00Z',
        content: 'block 1',
        source_url: 'https://example.com/1',
      },
      {
        post_id: 'post-2',
        attempt_no: 2,
        timestamp: '2026-01-02T00:00:00Z',
        content: 'block 2',
        source_url: 'https://example.com/2',
      },
    ];

    (listLearnedBlocks as Mock).mockResolvedValueOnce(localBlocks);

    const syncResponse = {
      adjustments: [
        {
          post_id: 'post-3',
          agent_id: 'agent-1',
          attempt_no: 1,
          from_status: 'learned',
          to_status: 'rolled_back',
        },
      ],
    };

    const fetchMock = setupFetchWithAuth({
      '/sync/memory-state': { status: 200, body: syncResponse },
    });

    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });
    await client.init();

    // The init() call already triggers sync, so we check the call
    // Find the sync call
    const syncCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('/sync/memory-state'),
    );

    expect(syncCall).toBeDefined();
    const syncBody = JSON.parse(syncCall![1].body);
    expect(syncBody.learned_blocks).toEqual([
      { post_id: 'post-1', attempt_no: 1 },
      { post_id: 'post-2', attempt_no: 2 },
    ]);
  });

  it('should return adjustments from server', async () => {
    const syncResponse = {
      adjustments: [
        {
          post_id: 'post-3',
          agent_id: 'agent-1',
          attempt_no: 1,
          from_status: 'learned',
          to_status: 'rolled_back',
        },
      ],
    };

    setupFetchWithAuth({
      '/sync/memory-state': { status: 200, body: syncResponse },
    });

    const client = new MoltLoopClient({
      serverUrl: TEST_SERVER_URL,
      apiKey: TEST_API_KEY,
    });

    const result = await client.init();

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].post_id).toBe('post-3');
    expect(result.adjustments[0].to_status).toBe('rolled_back');
  });
});
