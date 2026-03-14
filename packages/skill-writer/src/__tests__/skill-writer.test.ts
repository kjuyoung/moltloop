import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { LearnedBlock } from '@moltloop/shared';
import { MAX_LEARNING_BLOCK_SIZE } from '@moltloop/shared';
import { resolveSkillPath } from '../path-resolver';
import { parseSkillBlocks, formatSkillBlock } from '../block-parser';
import { appendSkillBlock, removeSkillBlock, listSkillBlocks } from '../writer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeBlock = (postId: string, attemptNo = 1, ts?: string): LearnedBlock => ({
  post_id: postId,
  attempt_no: attemptNo,
  timestamp: ts ?? new Date().toISOString(),
  content: `학습 내용 for ${postId}`,
  source_url: `https://example.com/${postId}`,
});

// ---------------------------------------------------------------------------
// resolveSkillPath
// ---------------------------------------------------------------------------

describe('resolveSkillPath', () => {
  const originalEnv = process.env.MOLTLOOP_SKILL_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MOLTLOOP_SKILL_PATH;
    } else {
      process.env.MOLTLOOP_SKILL_PATH = originalEnv;
    }
  });

  it('MOLTLOOP_SKILL_PATH 환경변수가 설정되어 있으면 해당 경로를 반환한다', () => {
    // Given
    const customPath = '/custom/path/skill.md';
    process.env.MOLTLOOP_SKILL_PATH = customPath;

    // When
    const result = resolveSkillPath('agent-123');

    // Then
    expect(result).toBe(customPath);
  });

  it('환경변수가 없으면 OpenClaw 기본 경로를 반환한다', () => {
    // Given
    delete process.env.MOLTLOOP_SKILL_PATH;

    // When
    const result = resolveSkillPath('agent-abc');

    // Then
    expect(result).toContain('.openclaw');
    expect(result).toContain('agents');
    expect(result).toContain('skill.md');
  });

  it('에이전트 ID가 기본 경로에 올바르게 포함된다', () => {
    // Given
    delete process.env.MOLTLOOP_SKILL_PATH;
    const agentId = 'my-special-agent';

    // When
    const result = resolveSkillPath(agentId);

    // Then
    const expected = path.join(os.homedir(), '.openclaw', 'agents', agentId, 'skill.md');
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// parseSkillBlocks
// ---------------------------------------------------------------------------

describe('parseSkillBlocks', () => {
  it('블록이 없는 내용에서 빈 배열을 반환한다', () => {
    // Given / When / Then
    expect(parseSkillBlocks('아무 마커도 없는 일반 텍스트')).toHaveLength(0);
    expect(parseSkillBlocks('')).toHaveLength(0);
  });

  it('단일 skill-learned 블록을 올바르게 파싱한다', () => {
    // Given
    const content = [
      '<!-- moltloop:skill-learned post_id=post-1 attempt=1 ts=2026-01-01T00:00:00Z -->',
      '### MoltLoop Context',
      '학습한 내용입니다.',
      'Source: https://example.com/post-1',
      '<!-- /moltloop:skill-learned -->',
    ].join('\n');

    // When
    const blocks = parseSkillBlocks(content);

    // Then
    expect(blocks).toHaveLength(1);
    expect(blocks[0].post_id).toBe('post-1');
    expect(blocks[0].attempt_no).toBe(1);
    expect(blocks[0].timestamp).toBe('2026-01-01T00:00:00Z');
    expect(blocks[0].content).toBe('학습한 내용입니다.');
    expect(blocks[0].source_url).toBe('https://example.com/post-1');
  });

  it('여러 블록을 타임스탬프 오름차순으로 정렬하여 반환한다', () => {
    // Given — 의도적으로 최신 블록을 먼저 배치
    const content = [
      '<!-- moltloop:skill-learned post_id=later attempt=1 ts=2026-03-01T00:00:00Z -->',
      '### MoltLoop Context',
      '나중 블록',
      'Source: https://example.com/later',
      '<!-- /moltloop:skill-learned -->',
      '',
      '<!-- moltloop:skill-learned post_id=earlier attempt=1 ts=2026-01-01T00:00:00Z -->',
      '### MoltLoop Context',
      '이전 블록',
      'Source: https://example.com/earlier',
      '<!-- /moltloop:skill-learned -->',
    ].join('\n');

    // When
    const blocks = parseSkillBlocks(content);

    // Then
    expect(blocks).toHaveLength(2);
    expect(blocks[0].post_id).toBe('earlier');
    expect(blocks[1].post_id).toBe('later');
  });

  it('블록 본문에서 소스 URL과 컨텍스트 내용을 분리하여 추출한다', () => {
    // Given
    const content = [
      '<!-- moltloop:skill-learned post_id=xyz attempt=2 ts=2026-06-01T12:00:00Z -->',
      '### MoltLoop Context',
      '첫 번째 줄',
      '두 번째 줄',
      'Source: https://example.com/source',
      '<!-- /moltloop:skill-learned -->',
    ].join('\n');

    // When
    const [block] = parseSkillBlocks(content);

    // Then
    expect(block.source_url).toBe('https://example.com/source');
    expect(block.content).toContain('첫 번째 줄');
    expect(block.content).not.toContain('Source:');
  });
});

// ---------------------------------------------------------------------------
// formatSkillBlock
// ---------------------------------------------------------------------------

describe('formatSkillBlock', () => {
  it('올바른 마커 형식으로 블록 문자열을 생성한다', () => {
    // Given
    const block: LearnedBlock = {
      post_id: 'test-post',
      attempt_no: 3,
      timestamp: '2026-05-01T09:00:00Z',
      content: '테스트 학습 내용',
      source_url: 'https://example.com/test',
    };

    // When
    const formatted = formatSkillBlock(block);

    // Then
    expect(formatted).toContain('<!-- moltloop:skill-learned');
    expect(formatted).toContain('post_id=test-post');
    expect(formatted).toContain('attempt=3');
    expect(formatted).toContain('ts=2026-05-01T09:00:00Z');
    expect(formatted).toContain('### MoltLoop Context');
    expect(formatted).toContain('테스트 학습 내용');
    expect(formatted).toContain('Source: https://example.com/test');
    expect(formatted).toContain('<!-- /moltloop:skill-learned -->');
  });

  it(`content가 MAX_LEARNING_BLOCK_SIZE(${MAX_LEARNING_BLOCK_SIZE})를 초과하면 잘라낸다`, () => {
    // Given
    const longContent = 'a'.repeat(MAX_LEARNING_BLOCK_SIZE + 100);
    const block: LearnedBlock = {
      post_id: 'truncate-test',
      attempt_no: 1,
      timestamp: '2026-01-01T00:00:00Z',
      content: longContent,
      source_url: 'https://example.com',
    };

    // When
    const formatted = formatSkillBlock(block);

    // Then
    // 잘린 내용만 포함되어야 함 — 원본 전체가 들어가서는 안 됨
    expect(formatted).toContain('a'.repeat(MAX_LEARNING_BLOCK_SIZE));
    expect(formatted).not.toContain('a'.repeat(MAX_LEARNING_BLOCK_SIZE + 1));
  });
});

// ---------------------------------------------------------------------------
// appendSkillBlock / removeSkillBlock / listSkillBlocks
// ---------------------------------------------------------------------------

describe('writer', () => {
  let tmpDir: string;
  let skillPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-writer-test-'));
    skillPath = path.join(tmpDir, 'skill.md');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // appendSkillBlock
  // -------------------------------------------------------------------------

  describe('appendSkillBlock', () => {
    it('파일이 존재하지 않으면 새로 생성한다', async () => {
      // Given — skillPath 파일 없음
      // When
      await appendSkillBlock(skillPath, makeBlock('p1'));

      // Then
      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('post_id=p1');
    });

    it('기존 파일에 블록을 추가하고 기존 내용을 보존한다', async () => {
      // Given
      await fs.writeFile(skillPath, '# Skill Notes\n');

      // When
      await appendSkillBlock(skillPath, makeBlock('p1'));

      // Then
      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('# Skill Notes');
      expect(content).toContain('post_id=p1');
    });

    it('같은 post_id + attempt_no를 중복 추가해도 블록이 하나만 존재한다 (멱등성)', async () => {
      // Given
      const block = makeBlock('p1', 1);

      // When
      const firstResult = await appendSkillBlock(skillPath, block);
      const secondResult = await appendSkillBlock(skillPath, block);

      // Then
      expect(firstResult).toBe(true);
      expect(secondResult).toBe(true); // skill-writer는 중복 시 true 반환
      const blocks = await listSkillBlocks(skillPath);
      expect(blocks).toHaveLength(1);
    });

    it('여러 블록을 순서대로 추가할 수 있다', async () => {
      // Given / When
      await appendSkillBlock(skillPath, makeBlock('p1', 1, '2026-01-01T00:00:00Z'));
      await appendSkillBlock(skillPath, makeBlock('p2', 1, '2026-02-01T00:00:00Z'));
      await appendSkillBlock(skillPath, makeBlock('p3', 1, '2026-03-01T00:00:00Z'));

      // Then
      const blocks = await listSkillBlocks(skillPath);
      expect(blocks).toHaveLength(3);
      expect(blocks.map((b) => b.post_id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('maxSize를 초과하면 가장 오래된 블록을 FIFO 방식으로 제거한다', async () => {
      // Given — 아주 작은 maxSize를 지정하여 강제 eviction 유도
      const smallMax = 300;
      const oldBlock = makeBlock('oldest', 1, '2026-01-01T00:00:00Z');
      oldBlock.content = 'old content';

      // When
      await appendSkillBlock(skillPath, oldBlock, smallMax);

      const newBlock = makeBlock('newest', 1, '2026-12-01T00:00:00Z');
      newBlock.content = 'new content that is long enough to push the file over the size limit here';
      await appendSkillBlock(skillPath, newBlock, smallMax);

      // Then — 오래된 블록이 제거되고 새 블록은 남아 있어야 함
      const blocks = await listSkillBlocks(skillPath);
      const postIds = blocks.map((b) => b.post_id);
      expect(postIds).not.toContain('oldest');
      expect(postIds).toContain('newest');
    });
  });

  // -------------------------------------------------------------------------
  // removeSkillBlock
  // -------------------------------------------------------------------------

  describe('removeSkillBlock', () => {
    it('지정한 post_id + attempt_no의 블록을 파일에서 제거한다', async () => {
      // Given
      await appendSkillBlock(skillPath, makeBlock('p1', 1));
      await appendSkillBlock(skillPath, makeBlock('p2', 1));

      // When
      const removed = await removeSkillBlock(skillPath, 'p1', 1);

      // Then
      expect(removed).toBe(true);
      const remaining = await listSkillBlocks(skillPath);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].post_id).toBe('p2');
    });

    it('존재하지 않는 블록 제거 시도 시 false를 반환한다', async () => {
      // Given
      await appendSkillBlock(skillPath, makeBlock('p1'));

      // When
      const result = await removeSkillBlock(skillPath, 'nonexistent', 1);

      // Then
      expect(result).toBe(false);
    });

    it('파일이 없으면 false를 반환한다', async () => {
      // Given — skillPath 파일 없음
      // When
      const result = await removeSkillBlock(path.join(tmpDir, 'missing.md'), 'p1', 1);

      // Then
      expect(result).toBe(false);
    });

    it('특정 블록 제거 후 같은 post_id의 다른 attempt는 보존된다', async () => {
      // Given
      await appendSkillBlock(skillPath, makeBlock('p1', 1, '2026-01-01T00:00:00Z'));
      await appendSkillBlock(skillPath, makeBlock('p1', 2, '2026-02-01T00:00:00Z'));

      // When
      await removeSkillBlock(skillPath, 'p1', 1);

      // Then
      const remaining = await listSkillBlocks(skillPath);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].attempt_no).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // listSkillBlocks
  // -------------------------------------------------------------------------

  describe('listSkillBlocks', () => {
    it('파일의 모든 블록을 타임스탬프 순으로 반환한다', async () => {
      // Given
      await appendSkillBlock(skillPath, makeBlock('p1', 1, '2026-01-01T00:00:00Z'));
      await appendSkillBlock(skillPath, makeBlock('p2', 1, '2026-02-01T00:00:00Z'));

      // When
      const blocks = await listSkillBlocks(skillPath);

      // Then
      expect(blocks).toHaveLength(2);
      expect(blocks[0].post_id).toBe('p1');
      expect(blocks[1].post_id).toBe('p2');
    });

    it('파일이 없으면 빈 배열을 반환한다', async () => {
      // Given / When
      const blocks = await listSkillBlocks(path.join(tmpDir, 'missing.md'));

      // Then
      expect(blocks).toHaveLength(0);
    });

    it('블록이 없는 파일에서 빈 배열을 반환한다', async () => {
      // Given
      await fs.writeFile(skillPath, '# Skill Notes\n\n일반 텍스트만 있음\n');

      // When
      const blocks = await listSkillBlocks(skillPath);

      // Then
      expect(blocks).toHaveLength(0);
    });
  });
});
