export type QualitySnapshotType = 'pre_learn' | 'post_learn';

export interface LearningQualitySnapshot {
  id: string;
  agent_id: string;
  post_id: string;
  attempt_no: number;
  relevance_score: number | null;
  source_fidelity_score: number | null;
  snapshot_type: QualitySnapshotType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface QualityTrendItem {
  post_id: string;
  attempt_no: number;
  pre_relevance: number | null;
  post_relevance: number | null;
  pre_fidelity: number | null;
  post_fidelity: number | null;
  improvement_relevance: number | null;
  improvement_fidelity: number | null;
  learned_at: string;
}

export interface RecordQualityInput {
  post_id: string;
  attempt_no: number;
  snapshot_type: QualitySnapshotType;
  relevance_score?: number;
  source_fidelity_score?: number;
  metadata?: Record<string, unknown>;
}
