import fs from 'fs/promises';
import { MEMORY_LOCK_TIMEOUT_MS, MEMORY_LOCK_RETRIES } from '@moltloop/shared';

/**
 * Execute `fn` while holding an exclusive lockfile for `filePath`.
 *
 * The lock is implemented via `{filePath}.lock` created with O_CREAT | O_EXCL
 * (atomic on POSIX).  On contention the call retries up to
 * MEMORY_LOCK_RETRIES times with MEMORY_LOCK_TIMEOUT_MS spacing.
 * The lockfile is always removed in the finally block.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = filePath + '.lock';
  const maxAttempts = 1 + MEMORY_LOCK_RETRIES; // initial + retries
  const retryDelay = Math.floor(MEMORY_LOCK_TIMEOUT_MS / maxAttempts);

  let acquired = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // O_CREAT | O_EXCL: fails if file already exists → atomic lock
      const handle = await fs.open(lockPath, 'wx');
      await handle.close();
      acquired = true;
      break;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
      // Lock held by someone else — check for stale lock
      if (await isStaleLock(lockPath)) {
        await removeStaleLock(lockPath);
        continue; // retry immediately after cleaning stale lock
      }
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelay);
      }
    }
  }

  if (!acquired) {
    throw new Error(
      `Failed to acquire lock for ${filePath} after ${MEMORY_LOCK_TIMEOUT_MS}ms`,
    );
  }

  try {
    return await fn();
  } finally {
    await fs.unlink(lockPath).catch(() => {
      // Ignore errors during cleanup (file may already be gone)
    });
  }
}

/**
 * Check if a lockfile is stale (older than MEMORY_LOCK_TIMEOUT_MS).
 */
async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    const age = Date.now() - stat.mtimeMs;
    return age > MEMORY_LOCK_TIMEOUT_MS;
  } catch {
    // File doesn't exist or can't be stat'd — not stale
    return false;
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  await fs.unlink(lockPath).catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
