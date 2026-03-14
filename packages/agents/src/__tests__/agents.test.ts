import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAgent } from '../registration';
import { getAgent, getAgentsByOwner, updateAgent } from '../profile';
import { setInterestTags, getInterestTags } from '../interest-tags';
import { verifyOwnership } from '../ownership';

// ---------------------------------------------------------------------------
// Mock @moltloop/auth
// ---------------------------------------------------------------------------

vi.mock('@moltloop/auth', () => ({
  generateApiKey: vi.fn(),
  verifyBlueskyClaimPost: vi.fn(),
}));

import { generateApiKey, verifyBlueskyClaimPost } from '@moltloop/auth';

const mockGenerateApiKey = vi.mocked(generateApiKey);
const mockVerifyBlueskyClaimPost = vi.mocked(verifyBlueskyClaimPost);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

/**
 * 기본 체인: 모든 메서드가 `this`를 반환하고 터미널(single, maybeSingle, order)은
 * Promise를 반환한다. eq는 항상 this를 반환하므로 다중 .eq() 체이닝이 가능하다.
 * 단, update/delete 체인의 마지막 .eq() 가 직접 await되는 경우 eq 자체가
 * Promise를 resolve해야 한다 — 이를 위해 chain 자체를 PromiseLike로 만들어
 * await chain 시 { data: null, error: null }를 반환하도록 한다.
 */
function createChain(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line prefer-const
  let chain: Record<string, unknown>;

  // chain을 thenable로 만들어 `await chain` 시 { data: null, error: null }를 반환
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
    // PromiseLike interface: 직접 await 시 사용
    then: thenFn,
    ...overrides,
  };

  return chain;
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  const chain = createChain(overrides);
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

/**
 * from() 호출마다 다른 체인을 반환해야 하는 복잡한 시나리오용 팩토리.
 * chains 배열의 순서대로 각 from() 호출에 반환된다.
 */
function createMultiChainDb(chains: ReturnType<typeof createChain>[]) {
  const fromMock = vi.fn();
  chains.forEach((c) => fromMock.mockReturnValueOnce(c));
  // 기본 fallback
  const fallback = createChain();
  fromMock.mockReturnValue(fallback);
  return { from: fromMock, _chains: chains, _fallback: fallback };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_ID = 'owner-uuid-001';
const AGENT_ID = 'agent-uuid-001';

const fakeAgent = {
  id: AGENT_ID,
  owner_id: OWNER_ID,
  name: 'my-agent',
  platform: 'moltloop',
  description: 'A test agent',
  avatar_url: null,
  llm_provider: 'openai',
  llm_model: 'gpt-4o',
  homepage_url: null,
  bluesky_handle: '@agent.bsky.social',
  bluesky_did: null,
  bluesky_claim_uri: null,
  ownership_verified: false,
  api_key_hash: 'hash-abc',
  signing_public_key: null,
  learning_mode: 'knowledge_api',
  anomaly_count: 0,
  learning_suspended: false,
  learning_suspended_at: null,
  learning_suspended_reason: null,
  moderation_status: 'active',
  moderation_reason: null,
  moderated_at: null,
  moderated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registerAgent', () => {
  beforeEach(() => {
    mockGenerateApiKey.mockResolvedValue({ key: 'mltk_plaintext', hash: 'hash-abc' });
  });

  it('이름과 모든 필드를 제공하면 에이전트를 성공적으로 등록한다', async () => {
    // Given
    const db = createMockDb();

    // maybeSingle: 중복 없음
    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    // insert agents: 에러 없음 (chain already returns { data: null, error: null } via eq)
    // single: 생성된 에이전트 반환
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeAgent,
      error: null,
    });
    // insert agent_interest_tags: 에러 없음 (chain resolves via insert mock default)
    (db._chain.insert as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(db._chain) // first insert (agents) returns chain
      .mockResolvedValueOnce({ data: null, error: null }); // second insert (tags) resolves

    // When
    const result = await registerAgent(
      OWNER_ID,
      {
        name: 'my-agent',
        platform: 'moltloop',
        description: 'A test agent',
        llm_provider: 'openai',
        llm_model: 'gpt-4o',
        bluesky_handle: '@agent.bsky.social',
        interest_topics: ['ai', 'ml'],
      },
      db as never,
    );

    // Then
    expect(result.agent).toEqual(fakeAgent);
    expect(result.api_key).toBe('mltk_plaintext');
    expect(mockGenerateApiKey).toHaveBeenCalledOnce();
  });

  it('최소 필드(이름만)로 에이전트를 성공적으로 등록한다', async () => {
    // Given
    const db = createMockDb();
    const minimalAgent = { ...fakeAgent, description: null, llm_provider: null };

    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    (db._chain.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(db._chain);
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: minimalAgent,
      error: null,
    });

    // When
    const result = await registerAgent(OWNER_ID, { name: 'my-agent' }, db as never);

    // Then
    expect(result.agent).toEqual(minimalAgent);
    expect(result.api_key).toBe('mltk_plaintext');
    // 태그 insert는 호출되지 않아야 한다
    expect(db._chain.insert).toHaveBeenCalledTimes(1);
  });

  it('이름이 최소 길이(2자) 미만이면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();

    // When / Then
    await expect(
      registerAgent(OWNER_ID, { name: 'x' }, db as never),
    ).rejects.toThrow('between 2 and 50 characters');
  });

  it('이름이 최대 길이(50자)를 초과하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    const longName = 'a'.repeat(51);

    // When / Then
    await expect(
      registerAgent(OWNER_ID, { name: longName }, db as never),
    ).rejects.toThrow('between 2 and 50 characters');
  });

  it('이름에 허용되지 않는 문자(공백, 특수문자)가 포함되면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();

    // When / Then
    await expect(
      registerAgent(OWNER_ID, { name: 'invalid name!' }, db as never),
    ).rejects.toThrow('letters, numbers, hyphens, and underscores');
  });

  it('이미 존재하는 이름으로 등록을 시도하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: 'existing-id' },
      error: null,
    });

    // When / Then
    await expect(
      registerAgent(OWNER_ID, { name: 'my-agent' }, db as never),
    ).rejects.toThrow("already taken");
  });

  it('interest_topics를 제공하면 agent_interest_tags 테이블에 insert한다', async () => {
    // Given
    const db = createMockDb();

    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    (db._chain.insert as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(db._chain) // agents insert
      .mockResolvedValueOnce({ data: null, error: null }); // tags insert
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeAgent,
      error: null,
    });

    // When
    await registerAgent(
      OWNER_ID,
      { name: 'my-agent', interest_topics: ['nlp', 'robotics', 'vision'] },
      db as never,
    );

    // Then
    expect(db.from).toHaveBeenCalledWith('agent_interest_tags');
    // 두 번째 insert 호출 시 올바른 태그 레코드가 전달되어야 한다
    const insertCalls = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls;
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[1][0]).toEqual([
      { agent_id: AGENT_ID, tag: 'nlp' },
      { agent_id: AGENT_ID, tag: 'robotics' },
      { agent_id: AGENT_ID, tag: 'vision' },
    ]);
  });

  it('learning_mode를 명시하지 않으면 knowledge_api가 기본값으로 저장된다', async () => {
    // Given
    const db = createMockDb();

    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    (db._chain.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(db._chain);
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeAgent,
      error: null,
    });

    // When
    await registerAgent(OWNER_ID, { name: 'my-agent' }, db as never);

    // Then
    const insertedPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedPayload.learning_mode).toBe('knowledge_api');
  });

  it('learning_mode를 명시하면 해당 값이 저장된다', async () => {
    // Given
    const db = createMockDb();

    (db._chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    (db._chain.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(db._chain);
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakeAgent, learning_mode: 'memory_file' },
      error: null,
    });

    // When
    const result = await registerAgent(
      OWNER_ID,
      { name: 'my-agent', learning_mode: 'memory_file' },
      db as never,
    );

    // Then
    const insertedPayload = (db._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedPayload.learning_mode).toBe('memory_file');
    expect(result.agent.learning_mode).toBe('memory_file');
  });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

describe('getAgent', () => {
  it('존재하는 에이전트 ID로 조회하면 에이전트 데이터를 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeAgent,
      error: null,
    });

    // When
    const result = await getAgent(AGENT_ID, db as never);

    // Then
    expect(result).toEqual(fakeAgent);
    expect(db.from).toHaveBeenCalledWith('agents');
    expect(db._chain.eq).toHaveBeenCalledWith('id', AGENT_ID);
  });

  it('존재하지 않는 에이전트 ID로 조회하면 null을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    });

    // When
    const result = await getAgent('nonexistent-id', db as never);

    // Then
    expect(result).toBeNull();
  });
});

describe('getAgentsByOwner', () => {
  it('소유자 ID로 조회하면 에이전트 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    const agents = [fakeAgent, { ...fakeAgent, id: 'agent-uuid-002', name: 'second-agent' }];
    (db._chain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: agents,
      error: null,
    });

    // When
    const result = await getAgentsByOwner(OWNER_ID, db as never);

    // Then
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('my-agent');
    expect(db._chain.eq).toHaveBeenCalledWith('owner_id', OWNER_ID);
  });

  it('소유자의 에이전트가 없으면 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When
    const result = await getAgentsByOwner(OWNER_ID, db as never);

    // Then
    expect(result).toEqual([]);
  });

  it('DB 조회 오류가 발생하면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'connection error' },
    });

    // When / Then
    await expect(getAgentsByOwner(OWNER_ID, db as never)).rejects.toThrow('connection error');
  });
});

describe('updateAgent', () => {
  it('유효한 소유자가 허용된 필드를 업데이트하면 변경된 에이전트를 반환한다', async () => {
    // Given
    const updatedAgent = { ...fakeAgent, description: 'Updated description' };

    // updateAgent 내부 from() 호출 순서:
    //   1. select('id').eq().eq().single()  → 소유권 확인
    //   2. update().eq().eq()               → 업데이트 실행 (체인 직접 await)
    //   3. select('*').eq().single()        → 변경된 에이전트 조회
    const ownershipChain = createChain();
    (ownershipChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: AGENT_ID },
      error: null,
    });

    const updateChain = createChain(); // then: resolves { data: null, error: null } by default

    const refetchChain = createChain();
    (refetchChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: updatedAgent,
      error: null,
    });

    const db = createMultiChainDb([ownershipChain, updateChain, refetchChain]);

    // When
    const result = await updateAgent(
      AGENT_ID,
      OWNER_ID,
      { description: 'Updated description' },
      db as never,
    );

    // Then
    expect(result.description).toBe('Updated description');
  });

  it('소유권이 없거나 에이전트가 존재하지 않으면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    });

    // When / Then
    await expect(
      updateAgent(AGENT_ID, 'wrong-owner-id', { description: 'hacked' }, db as never),
    ).rejects.toThrow('Agent not found or not owned by user');
  });

  it('업데이트할 필드를 하나도 제공하지 않으면 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: AGENT_ID },
      error: null,
    });

    // When / Then
    await expect(
      updateAgent(AGENT_ID, OWNER_ID, {}, db as never),
    ).rejects.toThrow('No fields to update');
  });
});

// ---------------------------------------------------------------------------
// Interest Tags
// ---------------------------------------------------------------------------

describe('setInterestTags', () => {
  it('기존 태그가 없을 때 새 태그를 insert한다', async () => {
    // Given
    const db = createMockDb();
    // delete().eq() resolves
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null });
    // insert resolves
    (db._chain.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When
    const result = await setInterestTags(AGENT_ID, ['ai', 'ml'], db as never);

    // Then
    expect(result).toEqual([
      { agent_id: AGENT_ID, tag: 'ai' },
      { agent_id: AGENT_ID, tag: 'ml' },
    ]);
    expect(db._chain.delete).toHaveBeenCalledOnce();
    expect(db._chain.insert).toHaveBeenCalledOnce();
  });

  it('기존 태그를 모두 삭제한 뒤 새 태그로 교체한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null });
    (db._chain.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When
    const result = await setInterestTags(AGENT_ID, ['nlp', 'vision'], db as never);

    // Then
    // delete가 먼저 호출되고, 이후 insert가 호출되어야 한다
    const deleteMock = db._chain.delete as ReturnType<typeof vi.fn>;
    const insertMock = db._chain.insert as ReturnType<typeof vi.fn>;
    expect(deleteMock.mock.invocationCallOrder[0]).toBeLessThan(
      insertMock.mock.invocationCallOrder[0],
    );
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe('nlp');
    expect(result[1].tag).toBe('vision');
  });

  it('태그 문자열은 trim + lowercase 처리되어 저장된다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null });
    (db._chain.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When
    const result = await setInterestTags(AGENT_ID, ['  AI  ', 'MachineLearning'], db as never);

    // Then
    expect(result[0].tag).toBe('ai');
    expect(result[1].tag).toBe('machinelearning');
  });

  it('빈 태그 배열을 전달하면 삭제 후 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null });

    // When
    const result = await setInterestTags(AGENT_ID, [], db as never);

    // Then
    expect(result).toEqual([]);
    // 태그가 없으므로 insert는 호출되지 않아야 한다
    expect(db._chain.insert).not.toHaveBeenCalled();
  });
});

describe('getInterestTags', () => {
  it('에이전트의 태그가 있을 때 태그 문자열 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{ tag: 'ai' }, { tag: 'ml' }, { tag: 'nlp' }],
      error: null,
    });

    // When
    const result = await getInterestTags(AGENT_ID, db as never);

    // Then
    expect(result).toEqual(['ai', 'ml', 'nlp']);
    expect(db.from).toHaveBeenCalledWith('agent_interest_tags');
    expect(db._chain.eq).toHaveBeenCalledWith('agent_id', AGENT_ID);
  });

  it('에이전트의 태그가 없을 때(data null) 빈 배열을 반환한다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // When
    const result = await getInterestTags(AGENT_ID, db as never);

    // Then
    expect(result).toEqual([]);
  });

  it('DB 오류 발생 시 에러를 던진다', async () => {
    // Given
    const db = createMockDb();
    (db._chain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });

    // When / Then
    await expect(getInterestTags(AGENT_ID, db as never)).rejects.toThrow('permission denied');
  });
});

// ---------------------------------------------------------------------------
// Ownership Verification (bonus coverage)
// ---------------------------------------------------------------------------

describe('verifyOwnership', () => {
  it('Bluesky 클레임 검증에 성공하면 verified: true와 did를 반환한다', async () => {
    // Given
    // verifyOwnership 내부 from() 호출 순서:
    //   1. select('*').eq().eq().single()  → 에이전트 조회
    //   2. update().eq()                   → 검증 결과 저장 (체인 직접 await)
    const fetchChain = createChain();
    (fetchChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakeAgent, bluesky_handle: 'agent.bsky.social' },
      error: null,
    });

    const updateChain = createChain(); // then: resolves { data: null, error: null } by default

    const db = createMultiChainDb([fetchChain, updateChain]);

    mockVerifyBlueskyClaimPost.mockResolvedValueOnce({
      handle: 'agent.bsky.social',
      did: 'did:plc:abc123',
      claim_uri: 'at://did:plc:abc123/post/xyz',
      agent_name: 'my-agent',
      verified: true,
    });

    // When
    const result = await verifyOwnership(AGENT_ID, OWNER_ID, db as never);

    // Then
    expect(result.verified).toBe(true);
    expect(result.did).toBe('did:plc:abc123');
    expect(result.claim_uri).toBe('at://did:plc:abc123/post/xyz');
  });

  it('Bluesky 클레임 검증 실패 시 verified: false를 반환한다', async () => {
    // Given
    const fetchChain = createChain();
    (fetchChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakeAgent, bluesky_handle: 'agent.bsky.social' },
      error: null,
    });
    const db = createMultiChainDb([fetchChain]);

    mockVerifyBlueskyClaimPost.mockResolvedValueOnce({
      handle: 'agent.bsky.social',
      did: '',
      claim_uri: '',
      agent_name: 'my-agent',
      verified: false,
    });

    // When
    const result = await verifyOwnership(AGENT_ID, OWNER_ID, db as never);

    // Then
    expect(result.verified).toBe(false);
    expect(result.did).toBeUndefined();
  });

  it('bluesky_handle이 설정되지 않은 에이전트는 에러를 던진다', async () => {
    // Given
    const fetchChain = createChain();
    (fetchChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { ...fakeAgent, bluesky_handle: null },
      error: null,
    });
    const db = createMultiChainDb([fetchChain]);

    // When / Then
    await expect(verifyOwnership(AGENT_ID, OWNER_ID, db as never)).rejects.toThrow(
      'Bluesky handle',
    );
  });
});
