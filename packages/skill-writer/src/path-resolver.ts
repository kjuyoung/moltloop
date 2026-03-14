import * as os from 'node:os';
import { DEFAULT_SKILL_PATH_TEMPLATE } from '@moltloop/shared';

/**
 * Resolve the skill.md file path for a given agent.
 *
 * Priority:
 * 1. MOLTLOOP_SKILL_PATH environment variable
 * 2. OpenClaw convention: ~/.openclaw/agents/{agent_id}/skill.md
 */
export function resolveSkillPath(agentId: string): string {
  const envPath = process.env.MOLTLOOP_SKILL_PATH;
  if (envPath) return envPath;
  const template = DEFAULT_SKILL_PATH_TEMPLATE.replace('{agent_id}', agentId);
  return template.replace('~', os.homedir());
}
