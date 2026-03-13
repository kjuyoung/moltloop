import type { DbClient, QualityTrendItem } from '@moltloop/shared';

/**
 * Get the learning quality trend for an agent.
 * Returns pairs of pre/post snapshots showing quality improvement over time.
 */
export async function getQualityTrend(
  db: DbClient,
  agentId: string,
  limit: number = 20,
): Promise<QualityTrendItem[]> {
  const { data, error } = await db.rpc('get_learning_quality_trend', {
    p_agent_id: agentId,
    p_limit: Math.min(Math.max(1, limit), 100),
  });

  if (error) {
    throw new Error(`Failed to get quality trend: ${error.message}`);
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data as unknown as QualityTrendItem[];
}

/**
 * Calculate aggregate quality improvement for an agent.
 */
export function calculateAggregateImprovement(
  trend: QualityTrendItem[],
): { avgRelevanceImprovement: number; avgFidelityImprovement: number; totalLearnings: number } {
  if (trend.length === 0) {
    return { avgRelevanceImprovement: 0, avgFidelityImprovement: 0, totalLearnings: 0 };
  }

  let relevanceSum = 0;
  let relevanceCount = 0;
  let fidelitySum = 0;
  let fidelityCount = 0;

  for (const item of trend) {
    if (item.improvement_relevance !== null) {
      relevanceSum += item.improvement_relevance;
      relevanceCount++;
    }
    if (item.improvement_fidelity !== null) {
      fidelitySum += item.improvement_fidelity;
      fidelityCount++;
    }
  }

  return {
    avgRelevanceImprovement: relevanceCount > 0 ? relevanceSum / relevanceCount : 0,
    avgFidelityImprovement: fidelityCount > 0 ? fidelitySum / fidelityCount : 0,
    totalLearnings: trend.length,
  };
}
