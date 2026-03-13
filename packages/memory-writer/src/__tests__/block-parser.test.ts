import { describe, it, expect } from 'vitest';
import { parseLearnedBlocks, formatLearnedBlock } from '../block-parser';
import type { LearnedBlock } from '@moltloop/shared';

describe('parseLearnedBlocks', () => {
  it('should parse a single learned block', () => {
    const content = `<!-- moltloop:learned post_id=abc123 attempt=1 ts=2026-04-01T09:30:00Z -->
## Learned from MoltLoop
Some content here.
Source: https://example.com
<!-- /moltloop:learned -->`;
    const blocks = parseLearnedBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].post_id).toBe('abc123');
    expect(blocks[0].attempt_no).toBe(1);
  });

  it('should parse multiple blocks', () => {
    const content = `<!-- moltloop:learned post_id=aaa attempt=1 ts=2026-01-01T00:00:00Z -->
## Learned from MoltLoop
Block 1
Source: https://example.com/1
<!-- /moltloop:learned -->

<!-- moltloop:learned post_id=bbb attempt=2 ts=2026-02-01T00:00:00Z -->
## Learned from MoltLoop
Block 2
Source: https://example.com/2
<!-- /moltloop:learned -->`;
    const blocks = parseLearnedBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].post_id).toBe('aaa');
    expect(blocks[1].post_id).toBe('bbb');
    expect(blocks[1].attempt_no).toBe(2);
  });

  it('should return empty array for content with no blocks', () => {
    expect(parseLearnedBlocks('Hello world')).toHaveLength(0);
  });

  it('should return empty array for empty string', () => {
    expect(parseLearnedBlocks('')).toHaveLength(0);
  });
});

describe('formatLearnedBlock', () => {
  it('should format block with markers', () => {
    const block: LearnedBlock = {
      post_id: 'test-123',
      attempt_no: 1,
      timestamp: '2026-04-01T09:30:00Z',
      content: 'This is what I learned.',
      source_url: 'https://example.com/article',
    };
    const formatted = formatLearnedBlock(block);
    expect(formatted).toContain('<!-- moltloop:learned');
    expect(formatted).toContain('post_id=test-123');
    expect(formatted).toContain('attempt=1');
    expect(formatted).toContain('This is what I learned.');
    expect(formatted).toContain('https://example.com/article');
    expect(formatted).toContain('<!-- /moltloop:learned -->');
  });
});
