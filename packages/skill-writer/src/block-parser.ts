import { MAX_LEARNING_BLOCK_SIZE } from '@moltloop/shared';
import type { LearnedBlock } from '@moltloop/shared';

const SKILL_MARKER_OPEN = '<!-- moltloop:skill-learned';
const SKILL_MARKER_CLOSE = '<!-- /moltloop:skill-learned -->';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_REGEX = new RegExp(
  `${escapeRegex(SKILL_MARKER_OPEN)}\\s+post_id=(\\S+)\\s+attempt=(\\d+)\\s+ts=(\\S+)\\s*-->([\\s\\S]*?)${escapeRegex(SKILL_MARKER_CLOSE)}`,
  'g',
);

function extractSourceUrl(body: string): string {
  const match = body.match(/^Source:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractContent(body: string): string {
  const lines = body.split('\n');
  const contentLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (!started) {
      if (line.trim().startsWith('### MoltLoop Context')) {
        started = true;
      }
      continue;
    }
    if (line.trim().startsWith('Source:')) break;
    contentLines.push(line);
  }

  return contentLines.join('\n').trim();
}

/**
 * Parse all skill-learned blocks from file content.
 */
export function parseSkillBlocks(content: string): LearnedBlock[] {
  const blocks: LearnedBlock[] = [];
  const regex = new RegExp(BLOCK_REGEX.source, BLOCK_REGEX.flags);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const body = match[4];
    blocks.push({
      post_id: match[1],
      attempt_no: parseInt(match[2], 10),
      timestamp: match[3],
      content: extractContent(body),
      source_url: extractSourceUrl(body),
    });
  }

  blocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return blocks;
}

/**
 * Format a LearnedBlock into its skill.md marker-delimited string.
 */
export function formatSkillBlock(block: LearnedBlock): string {
  const truncatedContent =
    block.content.length > MAX_LEARNING_BLOCK_SIZE
      ? block.content.slice(0, MAX_LEARNING_BLOCK_SIZE)
      : block.content;

  return [
    `${SKILL_MARKER_OPEN} post_id=${block.post_id} attempt=${block.attempt_no} ts=${block.timestamp} -->`,
    '### MoltLoop Context',
    truncatedContent,
    `Source: ${block.source_url}`,
    SKILL_MARKER_CLOSE,
  ].join('\n');
}

export { SKILL_MARKER_OPEN, SKILL_MARKER_CLOSE };
