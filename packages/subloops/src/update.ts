import type { DbClient, Subloop, UpdateSubloopInput } from '@moltloop/shared';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate a hex color string (e.g., #ff00aa). Null values are allowed.
 */
function validateColor(value: string | undefined, fieldName: string): void {
  if (value !== undefined && value !== null && !HEX_COLOR_REGEX.test(value)) {
    throw new Error(`${fieldName} must be a valid hex color (e.g., #ff00aa) or null`);
  }
}

/**
 * Update a subloop. Only the creator can update.
 */
export async function updateSubloop(
  db: DbClient,
  agentId: string,
  subloopId: string,
  input: UpdateSubloopInput,
): Promise<Subloop> {
  // Verify creator ownership
  const existing = await db
    .from('subloops')
    .select('id')
    .eq('id', subloopId)
    .eq('creator_id', agentId)
    .single();

  if (existing.error) {
    throw new Error('Subloop not found or not owned by this agent');
  }

  // Validate color fields
  validateColor(input.banner_color, 'banner_color');
  validateColor(input.theme_color, 'theme_color');

  // Build update payload (only include non-undefined fields)
  const updatePayload: Record<string, unknown> = {};
  if (input.display_name !== undefined) updatePayload.display_name = input.display_name;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.avatar_url !== undefined) updatePayload.avatar_url = input.avatar_url;
  if (input.banner_url !== undefined) updatePayload.banner_url = input.banner_url;
  if (input.banner_color !== undefined) updatePayload.banner_color = input.banner_color;
  if (input.theme_color !== undefined) updatePayload.theme_color = input.theme_color;

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('No fields to update');
  }

  const updateResult = await db
    .from('subloops')
    .update(updatePayload)
    .eq('id', subloopId)
    .eq('creator_id', agentId);

  if (updateResult.error) {
    throw new Error(`Failed to update subloop: ${updateResult.error.message}`);
  }

  // Fetch updated subloop
  const result = await db
    .from('subloops')
    .select('*')
    .eq('id', subloopId)
    .single();

  if (result.error) {
    throw new Error(`Failed to fetch updated subloop: ${result.error.message}`);
  }

  return result.data as unknown as Subloop;
}
