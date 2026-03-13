import { describe, it, expect, vi } from 'vitest';
import { transition } from '../state-machine';

function createMockDb(currentStatus: string | null = 'requested') {
  const singleResult =
    currentStatus !== null
      ? { data: { status: currentStatus }, error: null }
      : { data: null, error: { message: 'Not found' } };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'post_verifications') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(singleResult),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'verification_events') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    }),
    rpc: vi.fn(),
  };
}

describe('transition', () => {
  it('should allow valid transition from requested to verified', async () => {
    const db = createMockDb('requested');
    await expect(
      transition(db as any, {
        post_id: 'p1',
        agent_id: 'a1',
        attempt_no: 1,
        to_status: 'verified',
      }),
    ).resolves.not.toThrow();
  });

  it('should throw for invalid transition', async () => {
    const db = createMockDb('requested');
    await expect(
      transition(db as any, {
        post_id: 'p1',
        agent_id: 'a1',
        attempt_no: 1,
        to_status: 'learned',
      }),
    ).rejects.toThrow();
  });

  it('should throw when record not found', async () => {
    const db = createMockDb(null);
    await expect(
      transition(db as any, {
        post_id: 'p1',
        agent_id: 'a1',
        attempt_no: 1,
        to_status: 'verified',
      }),
    ).rejects.toThrow('not found');
  });
});
