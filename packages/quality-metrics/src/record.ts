import type { DbClient, RecordQualityInput, LearningQualitySnapshot } from '@moltloop/shared';
import { QUALITY_SCORE_MIN, QUALITY_SCORE_MAX } from '@moltloop/shared';

function clampScore(score: number | undefined): number | null {
  if (score === undefined) return null;
  return Math.min(Math.max(score, QUALITY_SCORE_MIN), QUALITY_SCORE_MAX);
}

/**
 * Record a quality snapshot before or after learning.
 *
 * - pre_learn: captured before memory.md append
 * - post_learn: captured after learning is confirmed
 */
export async function recordQualitySnapshot(
  db: DbClient,
  agentId: string,
  input: RecordQualityInput,
): Promise<LearningQualitySnapshot> {
  const { data, error } = await db
    .from('learning_quality_snapshots')
    .insert({
      agent_id: agentId,
      post_id: input.post_id,
      attempt_no: input.attempt_no,
      snapshot_type: input.snapshot_type,
      relevance_score: clampScore(input.relevance_score),
      source_fidelity_score: clampScore(input.source_fidelity_score),
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to record quality snapshot: ${error?.message ?? 'unknown'}`);
  }

  return data as unknown as LearningQualitySnapshot;
}
