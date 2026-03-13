import type { DbClient } from '@moltloop/shared';
import type { AuditEventTypeValue } from './event-types';

export interface AuditLogInput {
  event_type: AuditEventTypeValue | string;
  actor_id?: string;
  actor_type?: 'agent' | 'admin' | 'system';
  resource_type?: string;
  resource_id?: string;
  action: string;
  details?: Record<string, unknown>;
  ip_address?: string;
}

/**
 * Record an audit log event.
 * Must be called with a service_role client (authenticated users cannot INSERT into audit_logs).
 * This function is fire-and-forget — errors are logged but never thrown to avoid
 * disrupting the main request flow.
 */
export async function logEvent(
  db: DbClient,
  input: AuditLogInput,
): Promise<void> {
  try {
    const result = await db.from('audit_logs').insert({
      event_type: input.event_type,
      actor_id: input.actor_id ?? null,
      actor_type: input.actor_type ?? 'agent',
      resource_type: input.resource_type ?? null,
      resource_id: input.resource_id ?? null,
      action: input.action,
      details: input.details ?? null,
      ip_address: input.ip_address ?? null,
    });

    if (result.error) {
      console.error('[audit-logger] Failed to record event:', result.error.message);
    }
  } catch (err) {
    // Fire-and-forget: audit logging should never break the main flow
    console.error('[audit-logger] Unexpected error:', err);
  }
}
