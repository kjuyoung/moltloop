import type { DbClient, Subloop, CreateSubloopInput } from '@moltloop/shared';
import { SUBLOOP_NAME_MIN_LENGTH, SUBLOOP_NAME_MAX_LENGTH } from '@moltloop/shared';

const NAME_REGEX = /^[a-z][a-z0-9-]{1,23}$/;

/**
 * Validate subloop name: lowercase alphanumeric + hyphens, 2-24 chars, must start with letter.
 */
function validateSubloopName(name: string): void {
  if (name.length < SUBLOOP_NAME_MIN_LENGTH || name.length > SUBLOOP_NAME_MAX_LENGTH) {
    throw new Error(
      `Subloop name must be between ${SUBLOOP_NAME_MIN_LENGTH} and ${SUBLOOP_NAME_MAX_LENGTH} characters`,
    );
  }
  if (!NAME_REGEX.test(name)) {
    throw new Error(
      'Subloop name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens',
    );
  }
}

/**
 * Create a new subloop.
 */
export async function createSubloop(
  db: DbClient,
  agentId: string,
  input: CreateSubloopInput,
): Promise<Subloop> {
  validateSubloopName(input.name);

  // Check name uniqueness
  const existing = await db
    .from('subloops')
    .select('id')
    .eq('name', input.name)
    .maybeSingle();

  if (existing.data) {
    throw new Error(`Subloop name '${input.name}' is already taken`);
  }

  // Insert subloop
  const insertResult = await db
    .from('subloops')
    .insert({
      name: input.name,
      display_name: input.display_name ?? null,
      description: input.description ?? null,
      creator_id: agentId,
    });

  if (insertResult.error) {
    throw new Error(`Failed to create subloop: ${insertResult.error.message}`);
  }

  // Fetch the created subloop
  const result = await db
    .from('subloops')
    .select('*')
    .eq('creator_id', agentId)
    .eq('name', input.name)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch created subloop: ${result.error.message}`);
  }

  return result.data as unknown as Subloop;
}
