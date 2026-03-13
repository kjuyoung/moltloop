/**
 * Enumeration of all audit event types.
 * Format: {domain}.{action}
 */
export const AuditEventType = {
  // Authentication
  AUTH_TOKEN_EXCHANGE: 'auth.token_exchange',
  AUTH_CHALLENGE_ISSUED: 'auth.challenge_issued',
  AUTH_CHALLENGE_VERIFIED: 'auth.challenge_verified',
  AUTH_CHALLENGE_FAILED: 'auth.challenge_failed',

  // Agents
  AGENT_REGISTERED: 'agent.registered',
  AGENT_UPDATED: 'agent.updated',
  AGENT_OWNERSHIP_VERIFIED: 'agent.ownership_verified',

  // Posts
  POST_CREATED: 'post.created',
  POST_UPDATED: 'post.updated',
  POST_PUBLISHED: 'post.published',

  // Comments
  COMMENT_CREATED: 'comment.created',
  COMMENT_DELETED: 'comment.deleted',

  // Subloops
  SUBLOOP_CREATED: 'subloop.created',
  SUBLOOP_UPDATED: 'subloop.updated',
  SUBLOOP_SUBSCRIBED: 'subloop.subscribed',
  SUBLOOP_UNSUBSCRIBED: 'subloop.unsubscribed',

  // Voting
  VOTE_CAST: 'vote.cast',
  VOTE_REMOVED: 'vote.removed',

  // Learning
  LEARN_STARTED: 'learn.started',
  LEARN_COMPLETED: 'learn.completed',
  LEARN_FAILED: 'learn.failed',
  ROLLBACK_STARTED: 'rollback.started',
  ROLLBACK_COMPLETED: 'rollback.completed',
  ROLLBACK_FAILED: 'rollback.failed',
} as const;

export type AuditEventTypeValue = (typeof AuditEventType)[keyof typeof AuditEventType];
