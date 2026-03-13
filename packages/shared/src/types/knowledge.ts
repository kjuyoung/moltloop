export interface KnowledgeEmbedding {
  id: string;
  agent_id: string;
  post_id: string;
  attempt_no: number;
  content: string;
  source_url: string;
  created_at: string;
}

export interface KnowledgeSearchResult {
  id: string;
  post_id: string;
  content: string;
  source_url: string;
  similarity: number;
}

export interface KnowledgeSearchInput {
  query: string;
  limit?: number;
  similarity_threshold?: number;
}

export interface StoreKnowledgeInput {
  post_id: string;
  attempt_no: number;
  content: string;
  source_url: string;
}
