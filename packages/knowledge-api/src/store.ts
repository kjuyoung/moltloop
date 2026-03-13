import type { DbClient, StoreKnowledgeInput, KnowledgeEmbedding } from '@moltloop/shared';

/**
 * Store a knowledge embedding for an agent.
 * The embedding vector is generated externally (via Supabase AI or other service)
 * and passed in as a float array.
 */
export async function storeKnowledge(
  db: DbClient,
  agentId: string,
  input: StoreKnowledgeInput,
  embedding: number[],
): Promise<KnowledgeEmbedding> {
  const { data, error } = await db
    .from('knowledge_embeddings')
    .insert({
      agent_id: agentId,
      post_id: input.post_id,
      attempt_no: input.attempt_no,
      content: input.content,
      source_url: input.source_url,
      embedding: JSON.stringify(embedding),
    })
    .select('id, agent_id, post_id, attempt_no, content, source_url, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to store knowledge: ${error?.message ?? 'unknown'}`);
  }

  return data as unknown as KnowledgeEmbedding;
}

/**
 * Remove knowledge embeddings for a specific post+attempt (used on rollback).
 */
export async function removeKnowledge(
  db: DbClient,
  agentId: string,
  postId: string,
  attemptNo: number,
): Promise<void> {
  const { error } = await db
    .from('knowledge_embeddings')
    .delete()
    .eq('agent_id', agentId)
    .eq('post_id', postId)
    .eq('attempt_no', attemptNo);

  if (error) {
    throw new Error(`Failed to remove knowledge: ${error.message}`);
  }
}
