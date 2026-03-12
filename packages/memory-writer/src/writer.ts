import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_MEMORY_FILE_MAX_SIZE } from '@moltloop/shared';
import type { LearnedBlock } from '@moltloop/shared';
import { withFileLock } from './file-lock';
import { parseLearnedBlocks, formatLearnedBlock } from './block-parser';

/**
 * Resolve the effective max file size.
 * Priority: explicit param > MOLTLOOP_MEMORY_MAX_SIZE env > DEFAULT_MEMORY_FILE_MAX_SIZE
 */
function resolveMaxSize(maxSize?: number): number {
  if (maxSize !== undefined) {
    return maxSize;
  }
  const envVal = process.env.MOLTLOOP_MEMORY_MAX_SIZE;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MEMORY_FILE_MAX_SIZE;
}

/**
 * Read file content, returning empty string if file doesn't exist.
 * Creates parent directories if needed.
 */
async function readFileOrCreate(memoryPath: string): Promise<string> {
  try {
    return await fs.readFile(memoryPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(path.dirname(memoryPath), { recursive: true });
      return '';
    }
    throw err;
  }
}

/**
 * Write content atomically: write to .tmp then rename.
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Check if a block with the given post_id and attempt_no already exists in the content.
 */
function hasDuplicate(
  existing: LearnedBlock[],
  postId: string,
  attemptNo: number,
): boolean {
  return existing.some(
    (b) => b.post_id === postId && b.attempt_no === attemptNo,
  );
}

/**
 * Remove a specific learned block from the raw file content by its markers.
 * Returns the content with the block removed, or null if not found.
 */
function removeBlockFromContent(
  content: string,
  postId: string,
  attemptNo: number,
): string | null {
  // Build a regex that matches this specific block
  const escapedOpen = escapeRegex('<!-- moltloop:learned');
  const escapedClose = escapeRegex('<!-- /moltloop:learned -->');
  const pattern = new RegExp(
    `${escapedOpen}\\s+post_id=${escapeRegex(postId)}\\s+attempt=${attemptNo}\\s+ts=\\S+\\s*-->[\\s\\S]*?${escapedClose}\\n?`,
  );

  if (!pattern.test(content)) {
    return null;
  }

  return content.replace(pattern, '');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Append a learning block to the memory file.
 *
 * - Acquires file lock
 * - Skips if duplicate (same post_id + attempt_no) already present → idempotent
 * - Truncates block content to MAX_LEARNING_BLOCK_SIZE
 * - Evicts oldest MoltLoop blocks (FIFO) if file would exceed maxSize
 * - Writes atomically via .tmp + rename
 *
 * @returns true if written, false if skipped (duplicate)
 */
export async function appendLearningBlock(
  memoryPath: string,
  block: LearnedBlock,
  maxSize?: number,
): Promise<boolean> {
  const effectiveMaxSize = resolveMaxSize(maxSize);

  return withFileLock(memoryPath, async () => {
    let content = await readFileOrCreate(memoryPath);
    const existingBlocks = parseLearnedBlocks(content);

    // Idempotency: skip if already present
    if (hasDuplicate(existingBlocks, block.post_id, block.attempt_no)) {
      return false;
    }

    const formatted = formatLearnedBlock(block);
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    let newContent = content + separator + formatted + '\n';

    // Evict oldest MoltLoop blocks if over size limit
    while (
      Buffer.byteLength(newContent, 'utf-8') > effectiveMaxSize
    ) {
      const blocks = parseLearnedBlocks(newContent);
      // Find the oldest block that isn't the one we just added
      const oldest = blocks.find(
        (b) =>
          !(b.post_id === block.post_id && b.attempt_no === block.attempt_no),
      );

      if (!oldest) {
        // Only our block remains — nothing more to evict, write as-is
        break;
      }

      const trimmed = removeBlockFromContent(
        newContent,
        oldest.post_id,
        oldest.attempt_no,
      );
      if (trimmed === null) {
        break; // safety: couldn't find block to remove
      }
      newContent = trimmed;
    }

    await atomicWrite(memoryPath, newContent);
    return true;
  });
}

/**
 * Remove a learning block by post_id + attempt_no.
 *
 * @returns true if removed, false if not found
 */
export async function removeLearningBlock(
  memoryPath: string,
  postId: string,
  attemptNo: number,
): Promise<boolean> {
  return withFileLock(memoryPath, async () => {
    let content: string;
    try {
      content = await fs.readFile(memoryPath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }

    const result = removeBlockFromContent(content, postId, attemptNo);
    if (result === null) {
      return false;
    }

    await atomicWrite(memoryPath, result);
    return true;
  });
}

/**
 * List all learned blocks in a memory file.
 * Read-only — no file lock needed.
 *
 * @returns Array of { post_id, attempt_no } sorted by timestamp ascending
 */
export async function listLearnedBlocks(
  memoryPath: string,
): Promise<Array<{ post_id: string; attempt_no: number }>> {
  let content: string;
  try {
    content = await fs.readFile(memoryPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const blocks = parseLearnedBlocks(content);
  return blocks.map((b) => ({ post_id: b.post_id, attempt_no: b.attempt_no }));
}
