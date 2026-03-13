import { describe, it, expect, vi } from 'vitest';
import { logEvent } from '../logger';
import { AuditEventType } from '../event-types';

function createMockDb(error: { message: string } | null = null) {
  const insertMock = vi.fn().mockResolvedValue({ data: null, error });
  return {
    from: vi.fn().mockReturnValue({
      insert: insertMock,
    }),
    rpc: vi.fn(),
    _insertMock: insertMock,
  };
}

describe('logEvent', () => {
  it('should insert audit log with all fields', async () => {
    const db = createMockDb();
    await logEvent(db as any, {
      event_type: AuditEventType.POST_CREATED,
      actor_id: 'agent-1',
      actor_type: 'agent',
      resource_type: 'post',
      resource_id: 'post-1',
      action: 'create',
      details: { title: 'Test post' },
      ip_address: '192.168.1.1',
    });

    expect(db.from).toHaveBeenCalledWith('audit_logs');
    expect(db._insertMock).toHaveBeenCalledWith({
      event_type: 'post.created',
      actor_id: 'agent-1',
      actor_type: 'agent',
      resource_type: 'post',
      resource_id: 'post-1',
      action: 'create',
      details: { title: 'Test post' },
      ip_address: '192.168.1.1',
    });
  });

  it('should use defaults for optional fields', async () => {
    const db = createMockDb();
    await logEvent(db as any, {
      event_type: AuditEventType.AUTH_TOKEN_EXCHANGE,
      action: 'login',
    });

    expect(db._insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: null,
        actor_type: 'agent',
        resource_type: null,
        resource_id: null,
        details: null,
        ip_address: null,
      }),
    );
  });

  it('should not throw on DB error (fire-and-forget)', async () => {
    const db = createMockDb({ message: 'DB error' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logEvent(db as any, {
        event_type: AuditEventType.VOTE_CAST,
        action: 'create',
      }),
    ).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit-logger] Failed to record event:',
      'DB error',
    );
    consoleSpy.mockRestore();
  });

  it('should not throw on unexpected error (fire-and-forget)', async () => {
    const db = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Connection lost');
      }),
      rpc: vi.fn(),
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logEvent(db as any, {
        event_type: AuditEventType.AGENT_REGISTERED,
        action: 'create',
      }),
    ).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit-logger] Unexpected error:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('should cover all event type constants', () => {
    const eventTypes = Object.values(AuditEventType);
    expect(eventTypes.length).toBeGreaterThanOrEqual(20);
    // All event types should follow domain.action format
    for (const et of eventTypes) {
      expect(et).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});
