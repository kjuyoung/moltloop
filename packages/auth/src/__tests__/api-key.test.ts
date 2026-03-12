import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from '../api-key';
import { API_KEY_PREFIX, API_KEY_LENGTH } from '@moltloop/shared';

describe('generateApiKey', () => {
  it('ml_ 접두사로 시작하는 키를 반환한다', async () => {
    // When
    const { key } = await generateApiKey();

    // Then
    expect(key.startsWith('ml_')).toBe(true);
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('총 길이가 API_KEY_LENGTH(35)인 키를 반환한다', async () => {
    // When
    const { key } = await generateApiKey();

    // Then
    expect(key.length).toBe(API_KEY_LENGTH);
    expect(key.length).toBe(35);
  });

  it('호출마다 서로 다른 키를 반환한다', async () => {
    // When
    const { key: key1 } = await generateApiKey();
    const { key: key2 } = await generateApiKey();

    // Then
    expect(key1).not.toBe(key2);
  });

  it('hash는 64자리 hex 문자열이다 (SHA-256)', async () => {
    // When
    const { hash } = await generateApiKey();

    // Then
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.length).toBe(64);
  });

  it('key와 hash를 함께 반환한다', async () => {
    // When
    const result = await generateApiKey();

    // Then
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('hash');
    expect(typeof result.key).toBe('string');
    expect(typeof result.hash).toBe('string');
  });

  it('반환된 hash는 key를 SHA-256으로 해시한 값과 동일하다', async () => {
    // When
    const { key, hash } = await generateApiKey();
    const expectedHash = await hashApiKey(key);

    // Then
    expect(hash).toBe(expectedHash);
  });

  it('키 뒤에 오는 랜덤 부분은 32자리 hex 문자열이다 (16바이트)', async () => {
    // When
    const { key } = await generateApiKey();
    const randomPart = key.slice(API_KEY_PREFIX.length);

    // Then: 16바이트 = 32개의 hex 문자
    expect(randomPart).toMatch(/^[0-9a-f]{32}$/);
    expect(randomPart.length).toBe(32);
  });
});

describe('hashApiKey', () => {
  it('동일한 키에 대해 항상 같은 해시를 반환한다', async () => {
    // Given
    const key = 'ml_abcdef1234567890abcdef1234567890';

    // When
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);

    // Then
    expect(hash1).toBe(hash2);
  });

  it('서로 다른 키는 서로 다른 해시를 반환한다', async () => {
    // Given
    const key1 = 'ml_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const key2 = 'ml_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    // When
    const hash1 = await hashApiKey(key1);
    const hash2 = await hashApiKey(key2);

    // Then
    expect(hash1).not.toBe(hash2);
  });

  it('반환되는 해시는 64자리 hex 문자열이다', async () => {
    // Given
    const key = 'ml_testkey12345678901234567890123';

    // When
    const hash = await hashApiKey(key);

    // Then
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('빈 문자열도 해시할 수 있다', async () => {
    // When
    const hash = await hashApiKey('');

    // Then
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('키 1문자 차이도 완전히 다른 해시를 반환한다 (눈사태 효과)', async () => {
    // Given
    const key1 = 'ml_0000000000000000000000000000000a';
    const key2 = 'ml_0000000000000000000000000000000b';

    // When
    const hash1 = await hashApiKey(key1);
    const hash2 = await hashApiKey(key2);

    // Then
    expect(hash1).not.toBe(hash2);
  });
});

describe('isValidApiKeyFormat', () => {
  it('올바른 형식의 키를 수락한다', () => {
    // Given: ml_ + 32자리 hex = 총 35자
    const validKey = 'ml_' + 'a'.repeat(32);

    // When / Then
    expect(isValidApiKeyFormat(validKey)).toBe(true);
  });

  it('실제 generateApiKey로 생성된 키를 수락한다', async () => {
    // Given
    const { key } = await generateApiKey();

    // When / Then
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it('잘못된 접두사를 가진 키를 거부한다', () => {
    // Given
    const wrongPrefix = 'sk_' + 'a'.repeat(32);

    // When / Then
    expect(isValidApiKeyFormat(wrongPrefix)).toBe(false);
  });

  it('접두사가 없는 키를 거부한다', () => {
    const noPrefix = 'a'.repeat(35);
    expect(isValidApiKeyFormat(noPrefix)).toBe(false);
  });

  it('길이가 짧은 키를 거부한다 (34자)', () => {
    // Given: ml_ + 31자 = 34자
    const shortKey = 'ml_' + 'a'.repeat(31);

    // When / Then
    expect(isValidApiKeyFormat(shortKey)).toBe(false);
    expect(shortKey.length).toBe(34);
  });

  it('길이가 긴 키를 거부한다 (36자)', () => {
    // Given: ml_ + 33자 = 36자
    const longKey = 'ml_' + 'a'.repeat(33);

    // When / Then
    expect(isValidApiKeyFormat(longKey)).toBe(false);
    expect(longKey.length).toBe(36);
  });

  it('빈 문자열을 거부한다', () => {
    expect(isValidApiKeyFormat('')).toBe(false);
  });

  it('접두사만 있는 키를 거부한다', () => {
    expect(isValidApiKeyFormat('ml_')).toBe(false);
  });

  it('API_KEY_LENGTH 상수 기준의 경계값 검증 — 정확히 35자면 수락한다', () => {
    const key = 'ml_' + 'f'.repeat(32);
    expect(key.length).toBe(API_KEY_LENGTH);
    expect(isValidApiKeyFormat(key)).toBe(true);
  });
});
