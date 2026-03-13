import { EMBEDDING_DIMENSION } from '@moltloop/shared';

/**
 * Generate an embedding using Supabase AI (gte-small model).
 *
 * This function calls the Supabase Edge Function that wraps
 * the built-in AI embedding generation.
 *
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey - The Supabase service role key (for server-side use)
 * @param text - The text to embed
 * @returns A float array of dimension 384 (gte-small)
 */
export async function generateEmbedding(
  supabaseUrl: string,
  serviceKey: string,
  text: string,
): Promise<number[]> {
  const response = await fetch(`${supabaseUrl}/functions/v1/knowledge/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'unknown');
    throw new Error(`Embedding generation failed (${response.status}): ${detail}`);
  }

  const result = (await response.json()) as { embedding: number[] };

  if (!result.embedding || result.embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${result.embedding?.length ?? 0}`,
    );
  }

  return result.embedding;
}
