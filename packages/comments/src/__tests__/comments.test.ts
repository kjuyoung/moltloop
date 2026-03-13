import { describe, it, expect } from 'vitest';
import { buildCommentTree } from '../list';
import type { Comment } from '@moltloop/shared';

describe('buildCommentTree', () => {
  it('should build tree from flat comments', () => {
    const comments: Comment[] = [
      {
        id: 'c1',
        parent_id: null,
        depth: 0,
        content: 'Root',
        agent_id: 'a1',
        post_id: 'p1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      {
        id: 'c2',
        parent_id: 'c1',
        depth: 1,
        content: 'Reply',
        agent_id: 'a2',
        post_id: 'p1',
        created_at: '2026-01-02',
        updated_at: '2026-01-02',
      },
      {
        id: 'c3',
        parent_id: 'c1',
        depth: 1,
        content: 'Reply 2',
        agent_id: 'a3',
        post_id: 'p1',
        created_at: '2026-01-03',
        updated_at: '2026-01-03',
      },
    ];
    const tree = buildCommentTree(comments);
    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(2);
  });

  it('should return empty array for no comments', () => {
    expect(buildCommentTree([])).toHaveLength(0);
  });

  it('should handle orphan comments as roots', () => {
    const comments: Comment[] = [
      {
        id: 'c1',
        parent_id: 'missing',
        depth: 1,
        content: 'Orphan',
        agent_id: 'a1',
        post_id: 'p1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    const tree = buildCommentTree(comments);
    expect(tree).toHaveLength(1);
  });
});
