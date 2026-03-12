import { describe, it, expect } from 'vitest';
import { createChallenge, verifySolution } from '../pow';
import {
  POW_DEFAULT_DIFFICULTY,
  POW_CHALLENGE_EXPIRY_MS,
  POW_MIN_SOLVE_TIME_MS,
  POW_MAX_SOLVE_TIME_MS,
} from '@moltloop/shared';
import type { PowChallenge } from '@moltloop/shared';

/**
 * 주어진 nonce에 대해 최소 1개의 선행 제로 비트를 만족하는 solution을 채굴한다.
 * difficulty=1을 사용하는 테스트에서만 사용한다.
 */
async function mineSolution(nonce: string): Promise<string> {
  for (let i = 0; ; i++) {
    const solution = i.toString(16);
    const input = `${nonce}${solution}`;
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashBytes = new Uint8Array(hashBuffer);
    if ((hashBytes[0] & 0x80) === 0) {
      return solution;
    }
  }
}

describe('createChallenge', () => {
  it('유효한 challenge 객체를 반환한다', () => {
    // When
    const challenge = createChallenge();

    // Then
    expect(challenge).toHaveProperty('nonce');
    expect(challenge).toHaveProperty('difficulty');
    expect(challenge).toHaveProperty('issued_at');
    expect(challenge).toHaveProperty('expires_at');
  });

  it('nonce는 32자리 hex 문자열이다', () => {
    const challenge = createChallenge();
    expect(challenge.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('기본 difficulty는 POW_DEFAULT_DIFFICULTY(20)이다', () => {
    const challenge = createChallenge();
    expect(challenge.difficulty).toBe(POW_DEFAULT_DIFFICULTY);
    expect(challenge.difficulty).toBe(20);
  });

  it('커스텀 difficulty가 올바르게 설정된다', () => {
    // Given
    const customDifficulty = 5;

    // When
    const challenge = createChallenge(customDifficulty);

    // Then
    expect(challenge.difficulty).toBe(customDifficulty);
  });

  it('expires_at은 issued_at + POW_CHALLENGE_EXPIRY_MS이다', () => {
    // Given
    const before = Date.now();
    const challenge = createChallenge();
    const after = Date.now();

    // Then
    expect(challenge.issued_at).toBeGreaterThanOrEqual(before);
    expect(challenge.issued_at).toBeLessThanOrEqual(after);
    expect(challenge.expires_at).toBe(challenge.issued_at + POW_CHALLENGE_EXPIRY_MS);
  });

  it('호출마다 서로 다른 nonce를 생성한다', () => {
    const challenge1 = createChallenge();
    const challenge2 = createChallenge();
    expect(challenge1.nonce).not.toBe(challenge2.nonce);
  });

  it('difficulty=1로 challenge를 생성할 수 있다', () => {
    const challenge = createChallenge(1);
    expect(challenge.difficulty).toBe(1);
  });
});

describe('verifySolution', () => {
  it('만료된 challenge는 거부한다', async () => {
    // Given: 이미 만료된 challenge
    const expiredChallenge: PowChallenge = {
      nonce: 'abc123',
      difficulty: 1,
      issued_at: Date.now() - 10_000,
      expires_at: Date.now() - 1, // 이미 만료
    };

    // When
    const result = await verifySolution(expiredChallenge, {
      nonce: 'abc123',
      solution: '0',
      solve_time_ms: 500,
    });

    // Then
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('nonce가 일치하지 않으면 거부한다', async () => {
    // Given
    const challenge = createChallenge(1);

    // When
    const result = await verifySolution(challenge, {
      nonce: 'wrong_nonce',
      solution: '0',
      solve_time_ms: 500,
    });

    // Then
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Nonce mismatch');
  });

  it('solve_time_ms가 POW_MIN_SOLVE_TIME_MS(100ms)보다 짧으면 거부한다', async () => {
    // Given
    const challenge = createChallenge(1);

    // When
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution: '0',
      solve_time_ms: POW_MIN_SOLVE_TIME_MS - 1, // 99ms
    });

    // Then
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too fast');
  });

  it('solve_time_ms가 정확히 POW_MIN_SOLVE_TIME_MS(100ms)이면 타이밍 조건은 통과한다', async () => {
    // Given: difficulty=1로 채굴하여 올바른 solution 확보
    const challenge = createChallenge(1);
    const solution = await mineSolution(challenge.nonce);

    // When: 경계값 100ms
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution,
      solve_time_ms: POW_MIN_SOLVE_TIME_MS,
    });

    // Then: 타이밍 조건은 통과 (hash 검증도 통과해야 valid=true)
    expect(result.valid).toBe(true);
  });

  it('solve_time_ms가 POW_MAX_SOLVE_TIME_MS(30000ms)보다 길면 거부한다', async () => {
    // Given
    const challenge = createChallenge(1);

    // When
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution: '0',
      solve_time_ms: POW_MAX_SOLVE_TIME_MS + 1, // 30001ms
    });

    // Then
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too slow');
  });

  it('solve_time_ms가 정확히 POW_MAX_SOLVE_TIME_MS(30000ms)이면 타이밍 조건은 통과한다', async () => {
    // Given
    const challenge = createChallenge(1);
    const solution = await mineSolution(challenge.nonce);

    // When: 경계값 30000ms
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution,
      solve_time_ms: POW_MAX_SOLVE_TIME_MS,
    });

    // Then
    expect(result.valid).toBe(true);
  });

  it('올바른 solution은 유효하다 (difficulty=1)', async () => {
    // Given
    const challenge = createChallenge(1);
    const solution = await mineSolution(challenge.nonce);

    // When
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution,
      solve_time_ms: 500,
    });

    // Then
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('difficulty를 만족하지 못하는 solution은 거부한다', async () => {
    // Given: difficulty=1인 challenge, 하지만 첫 비트가 1인 solution을 강제로 주입
    const challenge = createChallenge(1);

    // 첫 번째 해시 바이트의 최상위 비트가 1이 되는(= 선행 제로 비트 0개) solution을 찾는다
    let badSolution = '';
    for (let i = 0; i < 100000; i++) {
      const candidate = i.toString(16);
      const input = `${challenge.nonce}${candidate}`;
      const encoded = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      const hashBytes = new Uint8Array(hashBuffer);
      if ((hashBytes[0] & 0x80) !== 0) {
        // 최상위 비트가 1 → 선행 제로 비트 0개
        badSolution = candidate;
        break;
      }
    }

    // When
    const result = await verifySolution(challenge, {
      nonce: challenge.nonce,
      solution: badSolution,
      solve_time_ms: 500,
    });

    // Then
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insufficient difficulty');
  });

  it('만료 검사는 nonce 검사보다 먼저 수행된다', async () => {
    // Given: 만료된 challenge에 잘못된 nonce 제공
    const expiredChallenge: PowChallenge = {
      nonce: 'correct_nonce',
      difficulty: 1,
      issued_at: Date.now() - 10_000,
      expires_at: Date.now() - 1,
    };

    // When
    const result = await verifySolution(expiredChallenge, {
      nonce: 'wrong_nonce',
      solution: '0',
      solve_time_ms: 500,
    });

    // Then: 만료 에러가 우선
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });
});
