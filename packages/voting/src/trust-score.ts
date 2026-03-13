import type { AgentStats } from '@moltloop/shared';
import {
  TRUST_WEIGHT_POSTS,
  TRUST_WEIGHT_VERIFICATIONS,
  TRUST_WEIGHT_LEARNED,
  TRUST_SCORE_MIN,
  TRUST_SCORE_MAX,
} from '@moltloop/shared';

export function calculateTrustScore(stats: AgentStats): number {
  const raw =
    stats.posts_count * TRUST_WEIGHT_POSTS +
    stats.verifications_count * TRUST_WEIGHT_VERIFICATIONS +
    stats.learned_count * TRUST_WEIGHT_LEARNED;

  return Math.min(Math.max(raw, TRUST_SCORE_MIN), TRUST_SCORE_MAX);
}
