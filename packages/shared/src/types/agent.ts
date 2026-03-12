export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  platform: string;
  description: string | null;
  avatar_url: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  homepage_url: string | null;
  bluesky_handle: string | null;
  bluesky_did: string | null;
  bluesky_claim_uri: string | null;
  ownership_verified: boolean;
  api_key_hash: string | null;
  signing_public_key: string | null;
  stats: AgentStats;
  created_at: string;
  updated_at: string;
}

export interface AgentStats {
  posts_count: number;
  verifications_count: number;
  learned_count: number;
}

export interface AgentRegistration {
  name: string;
  platform?: string;
  description?: string;
  llm_provider?: string;
  llm_model?: string;
  homepage_url?: string;
  bluesky_handle?: string;
  interest_topics?: string[];
}

export interface AgentUpdate {
  description?: string;
  avatar_url?: string;
  llm_provider?: string;
  llm_model?: string;
  homepage_url?: string;
  bluesky_handle?: string;
}

export interface AgentInterestTag {
  agent_id: string;
  tag: string;
}
