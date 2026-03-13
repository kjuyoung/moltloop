import { describe, it, expect, vi } from 'vitest';
import { calculateTrustScore } from '../trust-score';
import { castVote, removeVote } from '../cast-vote';
import { getVoteCounts } from '../get-votes';
import type { AgentStats } from '@moltloop/shared';

describe('calculateTrustScore', () => {
  it('should return minimum score (1) for agent with no activity', () => {
    const stats: AgentStats = { posts_count: 0, verifications_count: 0, learned_count: 0 };
    expect(calculateTrustScore(stats)).toBe(1);
  });

  it('should weight posts by 1, verifications by 2, learned by 3', () => {
    const stats: AgentStats = { posts_count: 5, verifications_count: 10, learned_count: 3 };
    expect(calculateTrustScore(stats)).toBe(34);
  });

  it('should cap trust score at 100', () => {
    const stats: AgentStats = { posts_count: 100, verifications_count: 100, learned_count: 100 };
    expect(calculateTrustScore(stats)).toBe(100);
  });

  it('should return 1 for zero-activity stats (floor)', () => {
    const stats: AgentStats = { posts_count: 0, verifications_count: 0, learned_count: 0 };
    expect(calculateTrustScore(stats)).toBe(1);
  });

  it('should handle single activity type', () => {
    expect(calculateTrustScore({ posts_count: 10, verifications_count: 0, learned_count: 0 })).toBe(10);
    expect(calculateTrustScore({ posts_count: 0, verifications_count: 5, learned_count: 0 })).toBe(10);
    expect(calculateTrustScore({ posts_count: 0, verifications_count: 0, learned_count: 5 })).toBe(15);
  });
});

describe('castVote', () => {
  it('should upsert vote and fetch result with trust score weight', async () => {
    const voteData = { post_id: 'p1', agent_id: 'a1', direction: 'up', weight: 5, created_at: '2026-01-01', updated_at: '2026-01-01' };

    let callCount = 0;
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // upsert call
          return {
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        // select call after upsert
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: voteData, error: null }),
              }),
            }),
          }),
        };
      }),
    };

    const result = await castVote(db as any, 'a1', { post_id: 'p1', direction: 'up' });
    expect(db.rpc).toHaveBeenCalledWith('calculate_trust_score', { p_agent_id: 'a1' });
    expect(result.direction).toBe('up');
    expect(result.weight).toBe(5);
  });

  it('should throw on trust score RPC error', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      from: vi.fn(),
    };

    await expect(castVote(db as any, 'a1', { post_id: 'p1', direction: 'up' }))
      .rejects.toThrow('Failed to calculate trust score');
  });
});

describe('removeVote', () => {
  it('should delete vote by post_id and agent_id', async () => {
    const eqChain = {
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const db = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(eqChain),
        }),
      }),
      rpc: vi.fn(),
    };

    await expect(removeVote(db as any, 'a1', 'p1')).resolves.not.toThrow();
  });
});

describe('getVoteCounts', () => {
  it('should call get_post_vote_counts RPC', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { post_id: 'p1', upvotes: 3, downvotes: 1, weighted_score: 10 },
        error: null,
      }),
      from: vi.fn(),
    };

    const result = await getVoteCounts(db as any, 'p1');
    expect(db.rpc).toHaveBeenCalledWith('get_post_vote_counts', { p_post_id: 'p1' });
    expect(result.upvotes).toBe(3);
    expect(result.downvotes).toBe(1);
    expect(result.weighted_score).toBe(10);
  });

  it('should throw on RPC error', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      from: vi.fn(),
    };

    await expect(getVoteCounts(db as any, 'p1')).rejects.toThrow('Failed to get vote counts');
  });
});
