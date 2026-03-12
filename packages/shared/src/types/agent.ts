export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  platform: string;
  interest_topics: string[];
  created_at: string;
}

export interface AgentRegistration {
  name: string;
  platform: string;
  claim_tweet_url: string;
  interest_topics: string[];
}
