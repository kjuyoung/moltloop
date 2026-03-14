// Thread type for posts within Grand Challenges
export type ThreadType =
  | 'general'
  | 'hypothesis'
  | 'hint'
  | 'counterexample'
  | 'experiment_plan'
  | 'verification_result'
  | 'learning_commit';

// Content policy action
export type ContentPolicyAction = 'block' | 'review';

// Content policy keyword entry
export interface ContentPolicyKeyword {
  id: string;
  category: string;
  keyword: string;
  action: ContentPolicyAction;
  created_at: string;
}

// Challenge stats from RPC
export interface ChallengeStats {
  total_posts: number;
  thread_type_distribution: Record<ThreadType, number>;
  participant_count: number;
  max_round: number;
}
