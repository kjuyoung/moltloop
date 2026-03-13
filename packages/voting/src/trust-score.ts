import type { AgentStats, EnhancedTrustScore, DbClient } from '@moltloop/shared';
import {
  TRUST_WEIGHT_POSTS,
  TRUST_WEIGHT_VERIFICATIONS,
  TRUST_WEIGHT_LEARNED,
  TRUST_SCORE_MIN,
  TRUST_SCORE_MAX,
  TRUST_SUCCESS_RATE_FLOOR,
  TRUST_SUCCESS_RATE_CEILING,
} from '@moltloop/shared';

/**
 * Legacy trust score calculation based on simple activity counts.
 * Kept for backward compatibility.
 */
export function calculateTrustScore(stats: AgentStats): number {
  const raw =
    stats.posts_count * TRUST_WEIGHT_POSTS +
    stats.verifications_count * TRUST_WEIGHT_VERIFICATIONS +
    stats.learned_count * TRUST_WEIGHT_LEARNED;

  return Math.min(Math.max(raw, TRUST_SCORE_MIN), TRUST_SCORE_MAX);
}

/**
 * Enhanced trust score incorporating verification success rate.
 *
 * Formula: activity_score * (FLOOR + success_rate * (CEILING - FLOOR))
 * - activity_score = posts*1 + verifications*2 + learned*3
 * - success_rate = verifications_success / verifications_given (0 if none)
 * - Result clamped to [1, 100]
 *
 * Agents with high verification success rates get a multiplier bonus (up to 1.5x).
 * Agents with low success rates are penalized (down to 0.5x).
 */
export function calculateEnhancedTrustScore(
  stats: AgentStats,
  verificationsGiven: number,
  verificationsSuccess: number,
): number {
  const activityScore =
    stats.posts_count * TRUST_WEIGHT_POSTS +
    verificationsGiven * TRUST_WEIGHT_VERIFICATIONS +
    stats.learned_count * TRUST_WEIGHT_LEARNED;

  const successRate = verificationsGiven > 0
    ? verificationsSuccess / verificationsGiven
    : 0;

  const multiplier = TRUST_SUCCESS_RATE_FLOOR + successRate * (TRUST_SUCCESS_RATE_CEILING - TRUST_SUCCESS_RATE_FLOOR);
  const score = activityScore * multiplier;

  return Math.min(Math.max(score, TRUST_SCORE_MIN), TRUST_SCORE_MAX);
}

/**
 * Fetch the enhanced trust score from the database.
 * Triggers recalculation via the DB RPC.
 */
export async function getEnhancedTrustScore(
  db: DbClient,
  agentId: string,
): Promise<EnhancedTrustScore | null> {
  // Trigger recalculation (non-fatal — stale data is acceptable fallback)
  const { error: rpcError } = await db.rpc('recalculate_trust_score', { p_agent_id: agentId });
  if (rpcError) {
    console.warn(`Trust score recalculation failed for ${agentId}: ${rpcError.message}`);
  }

  // Fetch the updated score
  const { data, error } = await db
    .from('agent_trust_scores')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as EnhancedTrustScore;
}
