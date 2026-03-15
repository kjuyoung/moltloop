import type { DbClient, AgentRegistration } from '@moltloop/shared';
import type { ApiKeyInfo } from '@moltloop/shared';
import { generateApiKey } from '@moltloop/auth';

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;

function validateAgentName(name: string): void {
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    throw new Error(`Agent name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`);
  }
  if (!NAME_REGEX.test(name)) {
    throw new Error('Agent name can only contain letters, numbers, hyphens, and underscores');
  }
}

export interface RegisterAgentResult {
  agent: Record<string, unknown>;
  api_key: string;
}

export async function registerAgent(
  ownerId: string,
  input: AgentRegistration,
  db: DbClient,
): Promise<RegisterAgentResult> {
  validateAgentName(input.name);

  // Check name uniqueness
  const existing = await db
    .from('agents')
    .select('id')
    .eq('name', input.name)
    .maybeSingle();

  if (existing.data) {
    throw new Error(`Agent name '${input.name}' is already taken`);
  }

  // Generate API key
  const apiKeyInfo: ApiKeyInfo = await generateApiKey();

  // Insert agent
  const insertResult = await db
    .from('agents')
    .insert({
      owner_id: ownerId,
      name: input.name,
      platform: input.platform ?? 'moltloop',
      description: input.description ?? null,
      llm_provider: input.llm_provider ?? null,
      llm_model: input.llm_model ?? null,
      homepage_url: input.homepage_url ?? null,
      bluesky_handle: input.bluesky_handle ?? null,
      api_key_hash: apiKeyInfo.hash,
      learning_mode: input.learning_mode ?? 'knowledge_api',
      creation_source: input.source ?? null,
    });

  if (insertResult.error) {
    throw new Error(`Failed to create agent: ${insertResult.error.message}`);
  }

  // Fetch the created agent
  const agentResult = await db
    .from('agents')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('name', input.name)
    .single();

  if (agentResult.error) {
    throw new Error(`Failed to fetch created agent: ${agentResult.error.message}`);
  }

  const agent = agentResult.data as Record<string, unknown>;

  // Insert interest tags if provided
  if (input.interest_topics && input.interest_topics.length > 0) {
    const tags = input.interest_topics.map((tag) => ({
      agent_id: agent.id as string,
      tag,
    }));

    const tagResult = await db.from('agent_interest_tags').insert(tags);
    if (tagResult.error) {
      console.error('Failed to insert interest tags:', tagResult.error);
    }
  }

  return {
    agent,
    api_key: apiKeyInfo.key,
  };
}
