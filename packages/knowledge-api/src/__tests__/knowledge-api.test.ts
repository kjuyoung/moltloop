import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEmbedding } from '../embedding';
import { storeKnowledge, removeKnowledge } from '../store';
import { searchKnowledge } from '../search';

// ---------------------------------------------------------------------------
// Constants (mirrors @moltloop/shared to avoid circular imports in tests)
// ---------------------------------------------------------------------------

const EMBEDDING_DIMENSION = 384;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_KNOWLEDGE_SEARCH_LIMIT = 10;
const MAX_KNOWLEDGE_SEARCH_LIMIT = 50;

// ---------------------------------------------------------------------------
// Mock @moltloop/shared — expose only what embedding.ts uses at runtime
// ---------------------------------------------------------------------------

vi.mock('@moltloop/shared', () => ({
  EMBEDDING_DIMENSION: 384,
  DEFAULT_SIMILARITY_THRESHOLD: 0.7,
  DEFAULT_KNOWLEDGE_SEARCH_LIMIT: 10,
  MAX_KNOWLEDGE_SEARCH_LIMIT: 50,
}));

// ---------------------------------------------------------------------------
// Mock global fetch (used by generateEmbedding)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DB mock factory (same pattern as packages/agents)
// ---------------------------------------------------------------------------

function createChain(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line prefer-const
  let chain: Record<string, unknown>;

  const thenFn = vi.fn((resolve: (v: unknown) => void) => {
    resolve({ data: null, error: null });
  });

  chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: thenFn,
    ...overrides,
  };

  return chain;
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  const chain = createChain(overrides);
  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    _chain: chain,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT_ID = 'agent-uuid-001';
const POST_ID = 'post-uuid-001';
const ATTEMPT_NO = 1;
const SUPABASE_URL = 'https://project.supabase.co';
const SERVICE_KEY = 'service-role-key';

/** 384-element zero vector used as a stub embedding */
const stubEmbedding: number[] = Array(EMBEDDING_DIMENSION).fill(0.1);

const fakeKnowledgeEmbedding = {
  id: 'ke-uuid-001',
  agent_id: AGENT_ID,
  post_id: POST_ID,
  attempt_no: ATTEMPT_NO,
  content: 'Machine learning is a subset of AI.',
  source_url: 'https://example.com/article',
  created_at: '2026-01-01T00:00:00Z',
};

const fakeSearchResult = {
  id: 'ke-uuid-001',
  post_id: POST_ID,
  content: 'Machine learning is a subset of AI.',
  source_url: 'https://example.com/article',
  similarity: 0.92,
};

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

describe('generateEmbedding', () => {
  it('HTTP 응답이 정상이면 384차원 임베딩 배열을 반환한다', async () => {
    // Given
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: stubEmbedding }),
    });

    // When
    const result = await generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'hello world');

    // Then
    expect(result).toHaveLength(EMBEDDING_DIMENSION);
    expect(result[0]).toBe(0.1);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/functions/v1/knowledge/embed`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ text: 'hello world' }),
      }),
    );
  });

  it('HTTP 응답이 실패(4xx/5xx)이면 에러를 던진다', async () => {
    // Given
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    // When / Then
    await expect(generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'test')).rejects.toThrow(
      'Embedding generation failed (503)',
    );
  });

  it('반환된 임베딩 차원이 384가 아니면 에러를 던진다', async () => {
    // Given — 차원이 맞지 않는 벡터 (100차원)
    const wrongDimEmbedding = Array(100).fill(0.5);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: wrongDimEmbedding }),
    });

    // When / Then
    await expect(generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'test')).rejects.toThrow(
      `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got 100`,
    );
  });

  it('응답 JSON에 embedding 필드가 없으면 에러를 던진다', async () => {
    // Given
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'no embedding here' }),
    });

    // When / Then
    await expect(generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'test')).rejects.toThrow(
      'Invalid embedding dimension',
    );
  });

  it('embedding 배열이 빈 배열이면 에러를 던진다', async () => {
    // Given
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: [] }),
    });

    // When / Then
    await expect(generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'test')).rejects.toThrow(
      `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got 0`,
    );
  });

  it('네트워크 오류(fetch 자체 실패) 시 에러가 전파된다', async () => {
    // Given
    mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

    // When / Then
    await expect(generateEmbedding(SUPABASE_URL, SERVICE_KEY, 'test')).rejects.toThrow(
      'Network unreachable',
    );
  });
});

// ---------------------------------------------------------------------------
// storeKnowledge
// ---------------------------------------------------------------------------

describe('storeKnowledge', () => {
  it('유효한 입력으로 호출하면 저장된 KnowledgeEmbedding을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeKnowledgeEmbedding,
      error: null,
    });

    const input = {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'Machine learning is a subset of AI.',
      source_url: 'https://example.com/article',
    };

    // When
    const result = await storeKnowledge(db as never, AGENT_ID, input, stubEmbedding);

    // Then
    expect(result).toEqual(fakeKnowledgeEmbedding);
    expect(db.from).toHaveBeenCalledWith('knowledge_embeddings');
    expect(db._chain.insert).toHaveBeenCalledOnce();
  });

  it('insert 시 agent_id, post_id, attempt_no, content, source_url, embedding이 모두 전달된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeKnowledgeEmbedding,
      error: null,
    });

    const input = {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'Some content',
      source_url: 'https://example.com',
    };

    // When
    await storeKnowledge(db as never, AGENT_ID, input, stubEmbedding);

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload).toMatchObject({
      agent_id: AGENT_ID,
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'Some content',
      source_url: 'https://example.com',
      embedding: JSON.stringify(stubEmbedding),
    });
  });

  it('embedding은 JSON.stringify된 문자열로 저장된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeKnowledgeEmbedding,
      error: null,
    });

    const smallEmbedding = [0.1, 0.2, 0.3];
    const input = {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'test',
      source_url: 'https://example.com',
    };

    // When
    await storeKnowledge(db as never, AGENT_ID, input, smallEmbedding);

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.embedding).toBe('[0.1,0.2,0.3]');
  });

  it('DB insert 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'unique constraint violation' },
    });

    const input = {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'test',
      source_url: 'https://example.com',
    };

    // When / Then
    await expect(storeKnowledge(db as never, AGENT_ID, input, stubEmbedding)).rejects.toThrow(
      'Failed to store knowledge: unique constraint violation',
    );
  });

  it('data가 null이고 error도 null이면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const input = {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      content: 'test',
      source_url: 'https://example.com',
    };

    // When / Then
    await expect(storeKnowledge(db as never, AGENT_ID, input, stubEmbedding)).rejects.toThrow(
      'Failed to store knowledge: unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// removeKnowledge
// ---------------------------------------------------------------------------

describe('removeKnowledge', () => {
  it('정상적으로 삭제되면 void를 반환한다', async () => {
    // Given
    const db = createMockDb();
    // eq().eq().eq() 체인의 마지막이 then으로 resolve되어 { data: null, error: null } 반환

    // When
    await expect(
      removeKnowledge(db as never, AGENT_ID, POST_ID, ATTEMPT_NO),
    ).resolves.toBeUndefined();

    // Then
    expect(db.from).toHaveBeenCalledWith('knowledge_embeddings');
    expect(db._chain.delete).toHaveBeenCalledOnce();
  });

  it('delete 쿼리에 agent_id, post_id, attempt_no 조건이 모두 포함된다', async () => {
    // Given
    const db = createMockDb();

    // When
    await removeKnowledge(db as never, AGENT_ID, POST_ID, ATTEMPT_NO);

    // Then
    const eqCalls = (db._chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(['agent_id', AGENT_ID]);
    expect(eqCalls).toContainEqual(['post_id', POST_ID]);
    expect(eqCalls).toContainEqual(['attempt_no', ATTEMPT_NO]);
  });

  it('DB delete 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    // then 콜백이 error를 포함하도록 재정의
    (db._chain.then as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (resolve: (v: unknown) => void) => {
        resolve({ data: null, error: { message: 'permission denied' } });
      },
    );

    // When / Then
    await expect(
      removeKnowledge(db as never, AGENT_ID, POST_ID, ATTEMPT_NO),
    ).rejects.toThrow('Failed to remove knowledge: permission denied');
  });

  it('다른 attempt_no로 삭제해도 올바른 조건이 전달된다', async () => {
    // Given
    const db = createMockDb();
    const differentAttempt = 5;

    // When
    await removeKnowledge(db as never, AGENT_ID, POST_ID, differentAttempt);

    // Then
    const eqCalls = (db._chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(['attempt_no', differentAttempt]);
  });
});

// ---------------------------------------------------------------------------
// searchKnowledge
// ---------------------------------------------------------------------------

describe('searchKnowledge', () => {
  it('정상적인 쿼리 임베딩으로 검색하면 결과 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [fakeSearchResult], error: null });

    // When
    const results = await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(fakeSearchResult);
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it('rpc 호출 시 p_agent_id, p_query_embedding, p_limit, p_similarity_threshold가 전달된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await searchKnowledge(db as never, AGENT_ID, stubEmbedding, 15, 0.8);

    // Then
    expect(db.rpc).toHaveBeenCalledWith('search_knowledge', {
      p_agent_id: AGENT_ID,
      p_query_embedding: JSON.stringify(stubEmbedding),
      p_limit: 15,
      p_similarity_threshold: 0.8,
    });
  });

  it('limit을 지정하지 않으면 DEFAULT_KNOWLEDGE_SEARCH_LIMIT(10)이 사용된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(DEFAULT_KNOWLEDGE_SEARCH_LIMIT);
  });

  it('similarityThreshold를 지정하지 않으면 DEFAULT_SIMILARITY_THRESHOLD(0.7)이 사용된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_similarity_threshold).toBe(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('limit이 MAX_KNOWLEDGE_SEARCH_LIMIT(50)을 초과하면 50으로 클램핑된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await searchKnowledge(db as never, AGENT_ID, stubEmbedding, 9999);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(MAX_KNOWLEDGE_SEARCH_LIMIT);
  });

  it('limit이 1 미만이면 1로 클램핑된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await searchKnowledge(db as never, AGENT_ID, stubEmbedding, 0);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(1);
  });

  it('검색 결과가 없으면 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    const results = await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    expect(results).toEqual([]);
  });

  it('rpc가 data: null을 반환하면 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: null, error: null });

    // When
    const results = await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    expect(results).toEqual([]);
  });

  it('rpc 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } });

    // When / Then
    await expect(searchKnowledge(db as never, AGENT_ID, stubEmbedding)).rejects.toThrow(
      'Knowledge search failed: function does not exist',
    );
  });

  it('복수의 결과가 반환되면 similarity 기준으로 순서가 보존된다', async () => {
    // Given
    const db = createMockDb();
    const results = [
      { ...fakeSearchResult, id: 'ke-001', similarity: 0.95 },
      { ...fakeSearchResult, id: 'ke-002', similarity: 0.88 },
      { ...fakeSearchResult, id: 'ke-003', similarity: 0.75 },
    ];
    db.rpc.mockResolvedValueOnce({ data: results, error: null });

    // When
    const found = await searchKnowledge(db as never, AGENT_ID, stubEmbedding);

    // Then
    expect(found).toHaveLength(3);
    // RPC가 반환한 순서가 그대로 유지되어야 한다 (정렬은 DB 책임)
    expect(found[0].similarity).toBe(0.95);
    expect(found[1].similarity).toBe(0.88);
    expect(found[2].similarity).toBe(0.75);
  });

  it('query embedding은 JSON.stringify된 문자열로 rpc에 전달된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });
    const shortEmbedding = [0.1, 0.2, 0.3];

    // When
    await searchKnowledge(db as never, AGENT_ID, shortEmbedding);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_query_embedding).toBe('[0.1,0.2,0.3]');
  });
});
