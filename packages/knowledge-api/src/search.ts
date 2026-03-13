import type { DbClient, KnowledgeSearchResult } from '@moltloop/shared';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_KNOWLEDGE_SEARCH_LIMIT,
  MAX_KNOWLEDGE_SEARCH_LIMIT,
} from '@moltloop/shared';

/**
 * Search an agent's knowledge base using semantic similarity.
 *
 * @param db - Database client
 * @param agentId - The agent whose knowledge to search
 * @param queryEmbedding - The query text's embedding vector (384-dim for gte-small)
 * @param limit - Maximum results to return
 * @param similarityThreshold - Minimum cosine similarity score (0-1)
 */
export async function searchKnowledge(
  db: DbClient,
  agentId: string,
  queryEmbedding: number[],
  limit: number = DEFAULT_KNOWLEDGE_SEARCH_LIMIT,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<KnowledgeSearchResult[]> {
  const clampedLimit = Math.min(Math.max(1, limit), MAX_KNOWLEDGE_SEARCH_LIMIT);

  const { data, error } = await db.rpc('search_knowledge', {
    p_agent_id: agentId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_limit: clampedLimit,
    p_similarity_threshold: similarityThreshold,
  });

  if (error) {
    throw new Error(`Knowledge search failed: ${error.message}`);
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data as unknown as KnowledgeSearchResult[];
}
