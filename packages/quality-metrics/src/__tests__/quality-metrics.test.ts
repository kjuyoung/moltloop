import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordQualitySnapshot } from '../record';
import { getQualityTrend, calculateAggregateImprovement } from '../trend';

// ---------------------------------------------------------------------------
// Mock @moltloop/shared — expose only what record.ts uses at runtime
// ---------------------------------------------------------------------------

vi.mock('@moltloop/shared', () => ({
  QUALITY_SCORE_MIN: 0,
  QUALITY_SCORE_MAX: 1,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DB mock factory (chainable pattern, same as packages/agents and knowledge-api)
// ---------------------------------------------------------------------------

/**
 * 기본 체인: 모든 메서드가 `this`를 반환하고 터미널(single, order, rpc)은
 * Promise를 반환한다. chain 자체를 PromiseLike로 만들어
 * await chain 시 { data: null, error: null }를 반환한다.
 */
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

const fakePreSnapshot = {
  id: 'snapshot-uuid-001',
  agent_id: AGENT_ID,
  post_id: POST_ID,
  attempt_no: ATTEMPT_NO,
  snapshot_type: 'pre_learn' as const,
  relevance_score: 0.6,
  source_fidelity_score: 0.7,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const fakePostSnapshot = {
  ...fakePreSnapshot,
  id: 'snapshot-uuid-002',
  snapshot_type: 'post_learn' as const,
  relevance_score: 0.85,
  source_fidelity_score: 0.9,
  created_at: '2026-01-01T01:00:00Z',
};

const fakeTrendItem = {
  post_id: POST_ID,
  attempt_no: ATTEMPT_NO,
  pre_relevance: 0.6,
  post_relevance: 0.85,
  pre_fidelity: 0.7,
  post_fidelity: 0.9,
  improvement_relevance: 0.25,
  improvement_fidelity: 0.2,
  learned_at: '2026-01-01T01:00:00Z',
};

// ---------------------------------------------------------------------------
// recordQualitySnapshot — Happy Path
// ---------------------------------------------------------------------------

describe('recordQualitySnapshot', () => {
  it('유효한 pre_learn 스냅샷을 저장하면 저장된 스냅샷을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakePreSnapshot,
      error: null,
    });

    // When
    const result = await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
      relevance_score: 0.6,
      source_fidelity_score: 0.7,
    });

    // Then
    expect(result).toEqual(fakePreSnapshot);
    expect(db.from).toHaveBeenCalledWith('learning_quality_snapshots');
    expect(db._chain.insert).toHaveBeenCalledOnce();
    expect(db._chain.select).toHaveBeenCalledWith('*');
    expect(db._chain.single).toHaveBeenCalledOnce();
  });

  it('post_learn 스냅샷을 저장하면 저장된 스냅샷을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakePostSnapshot,
      error: null,
    });

    // When
    const result = await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'post_learn',
      relevance_score: 0.85,
      source_fidelity_score: 0.9,
    });

    // Then
    expect(result.snapshot_type).toBe('post_learn');
    expect(result.relevance_score).toBe(0.85);
    expect(result.source_fidelity_score).toBe(0.9);
  });

  it('insert 페이로드에 agent_id, post_id, attempt_no, snapshot_type, 점수, metadata가 포함된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakePreSnapshot,
      error: null,
    });
    const metadata = { source: 'test-run', version: 2 };

    // When
    await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
      relevance_score: 0.6,
      source_fidelity_score: 0.7,
      metadata,
    });

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload).toMatchObject({
      agent_id: AGENT_ID,
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
      relevance_score: 0.6,
      source_fidelity_score: 0.7,
      metadata,
    });
  });

  it('metadata를 전달하지 않으면 빈 객체 {}가 삽입된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakePreSnapshot,
      error: null,
    });

    // When
    await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
    });

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.metadata).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // recordQualitySnapshot — Score Clamping (clampScore)
  // ---------------------------------------------------------------------------

  it('relevance_score가 1.0을 초과하면 1.0으로 클램핑되어 저장된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakePreSnapshot, relevance_score: 1.0 },
      error: null,
    });

    // When
    await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
      relevance_score: 1.5,
    });

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.relevance_score).toBe(1.0);
  });

  it('source_fidelity_score가 0.0 미만이면 0.0으로 클램핑되어 저장된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakePreSnapshot, source_fidelity_score: 0.0 },
      error: null,
    });

    // When
    await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
      source_fidelity_score: -0.3,
    });

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.source_fidelity_score).toBe(0.0);
  });

  it('relevance_score를 전달하지 않으면 null로 저장된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakePreSnapshot, relevance_score: null },
      error: null,
    });

    // When
    await recordQualitySnapshot(db as never, AGENT_ID, {
      post_id: POST_ID,
      attempt_no: ATTEMPT_NO,
      snapshot_type: 'pre_learn',
    });

    // Then
    const insertPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.relevance_score).toBeNull();
    expect(insertPayload.source_fidelity_score).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // recordQualitySnapshot — Error Handling
  // ---------------------------------------------------------------------------

  it('DB insert 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'unique constraint violation' },
    });

    // When / Then
    await expect(
      recordQualitySnapshot(db as never, AGENT_ID, {
        post_id: POST_ID,
        attempt_no: ATTEMPT_NO,
        snapshot_type: 'pre_learn',
        relevance_score: 0.5,
      }),
    ).rejects.toThrow('Failed to record quality snapshot: unique constraint violation');
  });

  it('data가 null이고 error도 null이면 unknown 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When / Then
    await expect(
      recordQualitySnapshot(db as never, AGENT_ID, {
        post_id: POST_ID,
        attempt_no: ATTEMPT_NO,
        snapshot_type: 'post_learn',
      }),
    ).rejects.toThrow('Failed to record quality snapshot: unknown');
  });
});

// ---------------------------------------------------------------------------
// getQualityTrend
// ---------------------------------------------------------------------------

describe('getQualityTrend', () => {
  it('정상적으로 호출하면 QualityTrendItem 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [fakeTrendItem], error: null });

    // When
    const result = await getQualityTrend(db as never, AGENT_ID);

    // Then
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(fakeTrendItem);
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it('rpc 호출 시 p_agent_id와 p_limit이 올바르게 전달된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await getQualityTrend(db as never, AGENT_ID, 15);

    // Then
    expect(db.rpc).toHaveBeenCalledWith('get_learning_quality_trend', {
      p_agent_id: AGENT_ID,
      p_limit: 15,
    });
  });

  it('limit을 지정하지 않으면 기본값 20이 사용된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await getQualityTrend(db as never, AGENT_ID);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(20);
  });

  it('limit이 100을 초과하면 100으로 클램핑된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await getQualityTrend(db as never, AGENT_ID, 9999);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(100);
  });

  it('limit이 1 미만이면 1로 클램핑된다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: [], error: null });

    // When
    await getQualityTrend(db as never, AGENT_ID, 0);

    // Then
    const rpcParams = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_limit).toBe(1);
  });

  it('rpc가 data: null을 반환하면 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: null, error: null });

    // When
    const result = await getQualityTrend(db as never, AGENT_ID);

    // Then
    expect(result).toEqual([]);
  });

  it('rpc가 배열이 아닌 값을 반환하면 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({ data: { unexpected: 'object' }, error: null });

    // When
    const result = await getQualityTrend(db as never, AGENT_ID);

    // Then
    expect(result).toEqual([]);
  });

  it('rpc 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'function does not exist' },
    });

    // When / Then
    await expect(getQualityTrend(db as never, AGENT_ID)).rejects.toThrow(
      'Failed to get quality trend: function does not exist',
    );
  });
});

// ---------------------------------------------------------------------------
// calculateAggregateImprovement — Pure Function
// ---------------------------------------------------------------------------

describe('calculateAggregateImprovement', () => {
  it('빈 트렌드 배열을 전달하면 모두 0인 결과를 반환한다', () => {
    // Given / When
    const result = calculateAggregateImprovement([]);

    // Then
    expect(result).toEqual({
      avgRelevanceImprovement: 0,
      avgFidelityImprovement: 0,
      totalLearnings: 0,
    });
  });

  it('단일 트렌드 아이템의 평균 개선도를 올바르게 계산한다', () => {
    // Given
    const trend = [fakeTrendItem];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    expect(result.avgRelevanceImprovement).toBeCloseTo(0.25);
    expect(result.avgFidelityImprovement).toBeCloseTo(0.2);
    expect(result.totalLearnings).toBe(1);
  });

  it('여러 트렌드 아이템의 평균 개선도를 올바르게 계산한다', () => {
    // Given
    const trend = [
      { ...fakeTrendItem, improvement_relevance: 0.2, improvement_fidelity: 0.1 },
      { ...fakeTrendItem, improvement_relevance: 0.4, improvement_fidelity: 0.3 },
    ];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    // avgRelevance = (0.2 + 0.4) / 2 = 0.3
    expect(result.avgRelevanceImprovement).toBeCloseTo(0.3);
    // avgFidelity = (0.1 + 0.3) / 2 = 0.2
    expect(result.avgFidelityImprovement).toBeCloseTo(0.2);
    expect(result.totalLearnings).toBe(2);
  });

  it('improvement_relevance가 null인 아이템은 평균 계산에서 제외된다', () => {
    // Given
    const trend = [
      { ...fakeTrendItem, improvement_relevance: null, improvement_fidelity: 0.4 },
      { ...fakeTrendItem, improvement_relevance: 0.6, improvement_fidelity: 0.2 },
    ];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    // relevance: null 제외 → 0.6 / 1 = 0.6
    expect(result.avgRelevanceImprovement).toBeCloseTo(0.6);
    // fidelity: (0.4 + 0.2) / 2 = 0.3
    expect(result.avgFidelityImprovement).toBeCloseTo(0.3);
    expect(result.totalLearnings).toBe(2);
  });

  it('모든 아이템의 improvement_fidelity가 null이면 avgFidelityImprovement는 0이다', () => {
    // Given
    const trend = [
      { ...fakeTrendItem, improvement_fidelity: null },
      { ...fakeTrendItem, improvement_fidelity: null },
    ];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    expect(result.avgFidelityImprovement).toBe(0);
    expect(result.totalLearnings).toBe(2);
  });

  it('음수 개선도(악화)가 포함된 경우에도 평균을 올바르게 계산한다', () => {
    // Given
    const trend = [
      { ...fakeTrendItem, improvement_relevance: 0.3, improvement_fidelity: -0.1 },
      { ...fakeTrendItem, improvement_relevance: -0.1, improvement_fidelity: 0.5 },
    ];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    // avgRelevance = (0.3 + (-0.1)) / 2 = 0.1
    expect(result.avgRelevanceImprovement).toBeCloseTo(0.1);
    // avgFidelity = ((-0.1) + 0.5) / 2 = 0.2
    expect(result.avgFidelityImprovement).toBeCloseTo(0.2);
  });

  it('totalLearnings는 항상 전체 트렌드 배열의 길이와 같다', () => {
    // Given — null 값이 있어도 totalLearnings에는 포함
    const trend = [
      { ...fakeTrendItem, improvement_relevance: null, improvement_fidelity: null },
      { ...fakeTrendItem, improvement_relevance: 0.5, improvement_fidelity: 0.3 },
      { ...fakeTrendItem, improvement_relevance: null, improvement_fidelity: 0.1 },
    ];

    // When
    const result = calculateAggregateImprovement(trend);

    // Then
    expect(result.totalLearnings).toBe(3);
  });
});
