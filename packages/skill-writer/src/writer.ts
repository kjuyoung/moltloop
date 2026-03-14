import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { LearnedBlock } from '@moltloop/shared';
import { DEFAULT_MEMORY_FILE_MAX_SIZE } from '@moltloop/shared';
import { parseSkillBlocks, formatSkillBlock, SKILL_MARKER_OPEN, SKILL_MARKER_CLOSE } from './block-parser';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Append a learning block to the skill.md file.
 * Inserts at end of file. If file doesn't exist, creates it.
 * If maxSize exceeded, removes oldest MoltLoop blocks (FIFO).
 */
export async function appendSkillBlock(
  filePath: string,
  block: LearnedBlock,
  maxSize?: number,
): Promise<boolean> {
  const maxBytes = maxSize ?? DEFAULT_MEMORY_FILE_MAX_SIZE;
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist yet
  }

  // Idempotency check using precise marker regex
  const idempotencyRegex = new RegExp(
    `${escapeRegex(SKILL_MARKER_OPEN)}\\s+post_id=${escapeRegex(block.post_id)}\\s+attempt=${block.attempt_no}\\s+ts=`,
  );
  if (idempotencyRegex.test(existing)) {
    return true; // Already exists
  }

  const formatted = formatSkillBlock(block);
  let newContent = existing ? `${existing}\n\n${formatted}\n` : `${formatted}\n`;

  // FIFO eviction if over size limit
  while (Buffer.byteLength(newContent, 'utf-8') > maxBytes) {
    const blocks = parseSkillBlocks(newContent);
    if (blocks.length === 0) break;

    const oldest = blocks[0];
    const blockRegex = new RegExp(
      `\\n?${escapeRegex(SKILL_MARKER_OPEN)}\\s+post_id=${escapeRegex(oldest.post_id)}\\s+attempt=${oldest.attempt_no}\\s+ts=${escapeRegex(oldest.timestamp)}\\s*-->[\\s\\S]*?${escapeRegex(SKILL_MARKER_CLOSE)}\\n?`,
    );
    newContent = newContent.replace(blockRegex, '\n');
  }

  // Atomic write via temp file + rename
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, newContent, 'utf-8');
  await fs.rename(tmpPath, filePath);

  return true;
}

/**
 * Remove a specific learning block from the skill.md file.
 */
export async function removeSkillBlock(
  filePath: string,
  postId: string,
  attemptNo: number,
): Promise<boolean> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return false;
  }

  const blockRegex = new RegExp(
    `\\n?${escapeRegex(SKILL_MARKER_OPEN)}\\s+post_id=${escapeRegex(postId)}\\s+attempt=${attemptNo}\\s+ts=\\S+\\s*-->[\\s\\S]*?${escapeRegex(SKILL_MARKER_CLOSE)}\\n?`,
  );

  const newContent = content.replace(blockRegex, '\n');
  if (newContent === content) return false;

  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, newContent, 'utf-8');
  await fs.rename(tmpPath, filePath);
  return true;
}

/**
 * List all learned blocks from the skill.md file.
 */
export async function listSkillBlocks(filePath: string): Promise<LearnedBlock[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseSkillBlocks(content);
  } catch {
    return [];
  }
}
