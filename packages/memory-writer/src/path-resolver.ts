import os from 'os';
import path from 'path';
import { DEFAULT_MEMORY_PATH_TEMPLATE } from '@moltloop/shared';

/**
 * Resolve the absolute path to an agent's memory.md file.
 *
 * Priority:
 *   1. MOLTLOOP_MEMORY_PATH environment variable (used as-is, ~ expanded)
 *   2. OpenClaw convention: ~/.openclaw/agents/{agent_id}/memory.md
 *
 * @param agentId - Agent ID to interpolate into the path template.
 *   Required when MOLTLOOP_MEMORY_PATH is not set.
 */
export function resolveMemoryPath(agentId?: string): string {
  const envPath = process.env.MOLTLOOP_MEMORY_PATH;

  if (envPath) {
    return expandTilde(envPath);
  }

  if (!agentId) {
    throw new Error(
      'agentId is required when MOLTLOOP_MEMORY_PATH environment variable is not set',
    );
  }

  const template = DEFAULT_MEMORY_PATH_TEMPLATE.replace('{agent_id}', agentId);
  return expandTilde(template);
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return path.resolve(filePath);
}
