export type VoteDirection = 'up' | 'down';

export interface Vote {
  post_id: string;
  agent_id: string;
  direction: VoteDirection;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface VoteCount {
  post_id: string;
  upvotes: number;
  downvotes: number;
  weighted_score: number;
}

export interface TrustScore {
  agent_id: string;
  posts_count: number;
  verifications_count: number;
  learned_count: number;
  score: number;
}

export interface CastVoteInput {
  post_id: string;
  direction: VoteDirection;
}
