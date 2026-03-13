import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { appendLearningBlock, removeLearningBlock, listLearnedBlocks } from '../writer';
import type { LearnedBlock } from '@moltloop/shared';

describe('writer', () => {
  let tmpDir: string;
  let memoryPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moltloop-test-'));
    memoryPath = path.join(tmpDir, 'memory.md');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeBlock = (postId: string, attemptNo = 1): LearnedBlock => ({
    post_id: postId,
    attempt_no: attemptNo,
    timestamp: new Date().toISOString(),
    content: `Learned content for ${postId}`,
    source_url: `https://example.com/${postId}`,
  });

  describe('appendLearningBlock', () => {
    it('should create file if it does not exist', async () => {
      await appendLearningBlock(memoryPath, makeBlock('p1'));
      const content = await fs.readFile(memoryPath, 'utf-8');
      expect(content).toContain('post_id=p1');
    });

    it('should append to existing file', async () => {
      await fs.writeFile(memoryPath, '# My Memory\n');
      await appendLearningBlock(memoryPath, makeBlock('p1'));
      const content = await fs.readFile(memoryPath, 'utf-8');
      expect(content).toContain('# My Memory');
      expect(content).toContain('post_id=p1');
    });

    it('should return false for duplicate block (idempotent)', async () => {
      const block = makeBlock('p1');
      const first = await appendLearningBlock(memoryPath, block);
      const second = await appendLearningBlock(memoryPath, block);
      expect(first).toBe(true);
      expect(second).toBe(false);
    });
  });

  describe('removeLearningBlock', () => {
    it('should remove a specific block', async () => {
      await appendLearningBlock(memoryPath, makeBlock('p1'));
      await appendLearningBlock(memoryPath, makeBlock('p2'));
      const removed = await removeLearningBlock(memoryPath, 'p1', 1);
      expect(removed).toBe(true);
      const blocks = await listLearnedBlocks(memoryPath);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].post_id).toBe('p2');
    });

    it('should return false for non-existent block', async () => {
      await appendLearningBlock(memoryPath, makeBlock('p1'));
      expect(await removeLearningBlock(memoryPath, 'nope', 1)).toBe(false);
    });

    it('should return false for non-existent file', async () => {
      expect(await removeLearningBlock(path.join(tmpDir, 'nonexistent-ml.md'), 'p1', 1)).toBe(
        false,
      );
    });
  });

  describe('listLearnedBlocks', () => {
    it('should list all blocks', async () => {
      await appendLearningBlock(memoryPath, makeBlock('p1'));
      await appendLearningBlock(memoryPath, makeBlock('p2'));
      expect(await listLearnedBlocks(memoryPath)).toHaveLength(2);
    });

    it('should return empty for non-existent file', async () => {
      expect(await listLearnedBlocks(path.join(tmpDir, 'nonexistent-ml.md'))).toHaveLength(0);
    });
  });
});
