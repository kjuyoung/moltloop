import {
  MOLTLOOP_MARKER_OPEN,
  MOLTLOOP_MARKER_CLOSE,
  MAX_LEARNING_BLOCK_SIZE,
} from '@moltloop/shared';
import type { LearnedBlock } from '@moltloop/shared';

/**
 * Regex that captures a full learned block including markers.
 *
 * Capture groups:
 *   1 — post_id
 *   2 — attempt_no
 *   3 — timestamp (ISO)
 *   4 — block body (between open/close markers)
 */
const BLOCK_REGEX = new RegExp(
  `${escapeRegex(MOLTLOOP_MARKER_OPEN)}\\s+post_id=(\\S+)\\s+attempt=(\\d+)\\s+ts=(\\S+)\\s*-->([\\s\\S]*?)${escapeRegex(MOLTLOOP_MARKER_CLOSE)}`,
  'g',
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the Source: URL from a block body.
 */
function extractSourceUrl(body: string): string {
  const match = body.match(/^Source:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * Extract the content from a block body (everything between the heading and Source: line).
 */
function extractContent(body: string): string {
  const lines = body.split('\n');
  const contentLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (!started) {
      // Skip until after the "## Learned from MoltLoop" heading
      if (line.trim().startsWith('## Learned from MoltLoop')) {
        started = true;
      }
      continue;
    }
    // Stop at Source: line
    if (line.trim().startsWith('Source:')) {
      break;
    }
    contentLines.push(line);
  }

  return contentLines.join('\n').trim();
}

/**
 * Parse all learned blocks from file content.
 * Returns blocks sorted by timestamp ascending (oldest first).
 */
export function parseLearnedBlocks(content: string): LearnedBlock[] {
  const blocks: LearnedBlock[] = [];

  // Reset regex state
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

  // Sort by timestamp ascending (oldest first)
  blocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return blocks;
}

/**
 * Format a LearnedBlock into its marker-delimited string representation.
 * Content is truncated to MAX_LEARNING_BLOCK_SIZE characters.
 */
export function formatLearnedBlock(block: LearnedBlock): string {
  const truncatedContent =
    block.content.length > MAX_LEARNING_BLOCK_SIZE
      ? block.content.slice(0, MAX_LEARNING_BLOCK_SIZE)
      : block.content;

  return [
    `${MOLTLOOP_MARKER_OPEN} post_id=${block.post_id} attempt=${block.attempt_no} ts=${block.timestamp} -->`,
    '## Learned from MoltLoop',
    truncatedContent,
    `Source: ${block.source_url}`,
    MOLTLOOP_MARKER_CLOSE,
  ].join('\n');
}
