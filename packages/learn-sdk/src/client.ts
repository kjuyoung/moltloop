import type {
  MoltLoopClientConfig,
  LearnResult,
  RollbackResult,
  SyncResult,
  SyncMemoryStateRequest,
  AckRequest,
  LearnedBlock,
  LearningMode,
} from '@moltloop/shared';
import {
  resolveMemoryPath,
  appendLearningBlock,
  removeLearningBlock,
  listLearnedBlocks,
} from '@moltloop/memory-writer';
import {
  resolveSkillPath,
  appendSkillBlock,
  removeSkillBlock,
  listSkillBlocks,
} from '@moltloop/skill-writer';
import { sanitize } from '@moltloop/sanitizer';

import { HttpClient, HttpError } from './http-client';

/** Options for Knowledge API integration during learning. */
interface KnowledgeOptions {
  /** If true, also store learned content as a vector embedding for semantic search. */
  storeEmbedding?: boolean;
  /** If true, record quality metrics before and after learning. */
  trackQuality?: boolean;
}

/** Response shape returned by POST /verify. */
interface VerifyResponse {
  post_id: string;
  agent_id: string;
  attempt_no: number;
  status: 'verified' | 'rejected';
  extracted_text?: string;
  source_url?: string;
  reason?: string;
  detail?: string;
}

/** Response shape returned by POST /api/learn/start. */
interface LearnStartResponse {
  post_id: string;
  attempt_no: number;
  status: string;
}

/** Response shape returned by POST /ack/learn. */
interface AckLearnResponse {
  post_id: string;
  attempt_no: number;
  status: string;
  learned_at?: string;
}

/** Response shape returned by POST /api/learn/rollback-start. */
interface RollbackStartResponse {
  post_id: string;
  attempt_no: number;
  status: string;
}

/** Response shape returned by POST /ack/rollback. */
interface AckRollbackResponse {
  post_id: string;
  attempt_no: number;
  status: string;
  rolled_back_at?: string;
}

/**
 * MoltLoopClient — the public SDK that agents use to learn from verified posts.
 *
 * Usage:
 * ```ts
 * const client = new MoltLoopClient({ serverUrl, apiKey });
 * await client.init();
 * const result = await client.learn(postId);
 * ```
 */
export class MoltLoopClient {
  private readonly http: HttpClient;
  private memoryPath: string;
  private skillPath: string;
  private agentId: string;
  private readonly maxMemorySize?: number;
  private readonly learningMode: LearningMode;
  private initialized = false;

  constructor(config: MoltLoopClientConfig) {
    this.http = new HttpClient(config.serverUrl, config.apiKey);
    this.agentId = config.agentId ?? '';
    this.memoryPath = config.memoryPath ?? '';
    this.skillPath = config.skillPath ?? '';
    this.maxMemorySize = config.maxMemorySize;
    this.learningMode = config.learningMode ?? 'knowledge_api';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the client: authenticate with the server and sync local state.
   *
   * Must be called before `learn()` or `rollback()`.
   */
  async init(): Promise<SyncResult> {
    const tokenResponse = await this.http.authenticate();

    // Use server-provided agent_id unless explicitly overridden in config
    if (!this.agentId) {
      this.agentId = tokenResponse.agent_id;
    }

    // Resolve memory path now that we have the agent ID
    if (!this.memoryPath) {
      this.memoryPath = resolveMemoryPath(this.agentId);
    }

    // Resolve skill path now that we have the agent ID
    if (!this.skillPath) {
      this.skillPath = resolveSkillPath(this.agentId);
    }

    const syncResult = await this.sync();
    this.initialized = true;
    return syncResult;
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  /**
   * Reconcile local memory.md state with the server.
   *
   * Sends the list of locally learned blocks to the server. The server
   * responds with any adjustments (e.g. blocks that were rolled back on
   * another device).
   */
  async sync(): Promise<SyncResult> {
    let localBlocks = await listLearnedBlocks(this.memoryPath);

    // Also include skill file blocks if using skill_file mode
    if (this.learningMode === 'skill_file') {
      const skillBlocks = await listSkillBlocks(this.skillPath);
      localBlocks = [...localBlocks, ...skillBlocks];
    }

    const payload: SyncMemoryStateRequest = {
      learned_blocks: localBlocks.map((b) => ({
        post_id: b.post_id,
        attempt_no: b.attempt_no,
      })),
    };

    return this.http.request<SyncResult>('/sync/memory-state', payload);
  }

  // ---------------------------------------------------------------------------
  // Learn
  // ---------------------------------------------------------------------------

  /**
   * Learn from a post.
   *
   * Flow:
   * 1. POST /verify         — verify the post's source
   * 2. POST /api/learn/start — transition verified -> learning_pending
   * 3. Write block to memory.md
   * 4. POST /ack/learn       — acknowledge success or failure
   * 5. (Optional) Store knowledge embedding for semantic search
   * 6. (Optional) Record quality metrics
   */
  async learn(postId: string, options?: KnowledgeOptions): Promise<LearnResult> {
    this.assertInitialized();

    // Step 1: Verify the post
    let verifyRes: VerifyResponse;
    try {
      verifyRes = await this.http.request<VerifyResponse>('/verify', {
        post_id: postId,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        post_id: postId,
        reason: 'verification_error',
        detail: `Source verification failed for post ${postId}: ${detail}`,
      };
    }

    // If rejected, return failure immediately
    if (verifyRes.status === 'rejected') {
      return {
        success: false,
        post_id: postId,
        reason: verifyRes.reason ?? 'rejected',
        detail: verifyRes.detail,
      };
    }

    const { attempt_no, extracted_text, source_url } = verifyRes;

    // Step 2: Request learning_pending transition
    try {
      await this.http.request<LearnStartResponse>('/api/learn/start', {
        post_id: postId,
        attempt_no,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        post_id: postId,
        reason: 'learn_start_error',
        detail: `Failed to transition post ${postId} to learning_pending state: ${detail}`,
      };
    }

    // Step 2.5: Sanitize extracted text before writing
    const sanitizeResult = sanitize(extracted_text ?? '');
    if (!sanitizeResult.safe) {
      // Ack failure to server with sanitization rejection reason
      const ackPayload: AckRequest = {
        post_id: postId,
        attempt_no,
        result: 'failure',
        reason: `sanitization_rejected: ${sanitizeResult.rejected_reason}`,
      };

      try {
        await this.http.request<AckLearnResponse>('/ack/learn', ackPayload);
      } catch {
        // Best-effort ack; server reconciliation will handle if this fails
      }

      return {
        success: false,
        post_id: postId,
        reason: 'sanitization_rejected',
        detail: sanitizeResult.rejected_reason,
      };
    }

    // Phase 2: Record pre-learn quality snapshot (best-effort)
    if (options?.trackQuality) {
      this.recordQualitySnapshot(postId, attempt_no, 'pre_learn').catch(() => {
        // Best-effort: quality tracking failure should not fail the learn
      });
    }

    const useKnowledgeApi = this.learningMode === 'knowledge_api' || this.learningMode === 'both';
    const useMemoryFile = this.learningMode === 'memory_file' || this.learningMode === 'both';
    const useSkillFile = this.learningMode === 'skill_file';

    // Step 3: Knowledge API path (fire-and-forget, no ack needed)
    if (useKnowledgeApi) {
      this.storeKnowledgeEmbedding(postId, attempt_no, sanitizeResult.content, source_url ?? '').catch(() => {
        // Best-effort: embedding storage failure should not fail the learn
      });
    }

    // Step 4: Memory file path (ack-based)
    if (useMemoryFile) {
      const block: LearnedBlock = {
        post_id: postId,
        attempt_no,
        timestamp: new Date().toISOString(),
        content: sanitizeResult.content,
        source_url: source_url ?? '',
      };

      let writeSuccess: boolean;
      try {
        writeSuccess = await appendLearningBlock(
          this.memoryPath,
          block,
          this.maxMemorySize,
        );
      } catch {
        writeSuccess = false;
      }

      const blockHash = writeSuccess ? await this.hashContent(sanitizeResult.content) : undefined;

      const ackPayload: AckRequest = {
        post_id: postId,
        attempt_no,
        result: writeSuccess ? 'success' : 'failure',
        ...(writeSuccess ? { block_hash: blockHash } : { reason: 'memory_write_failed' }),
      };

      try {
        const ackRes = await this.http.request<AckLearnResponse>(
          '/ack/learn',
          ackPayload,
        );

        if (writeSuccess) {
          if (options?.trackQuality) {
            this.recordQualitySnapshot(postId, attempt_no, 'post_learn').catch(() => {});
          }

          return {
            success: true,
            post_id: postId,
            attempt_no,
            learned_at: ackRes.learned_at ?? new Date().toISOString(),
          };
        }

        return {
          success: false,
          post_id: postId,
          reason: 'memory_write_failed',
          detail: `Failed to append learning block for post ${postId} (attempt ${attempt_no}) to ${this.memoryPath}`,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          post_id: postId,
          reason: 'ack_error',
          detail: `Learn acknowledgement failed for post ${postId} (attempt ${attempt_no}). Server reconciliation will retry. Original error: ${detail}`,
        };
      }
    }

    // Step 4b: Skill file path (ack-based, similar to memory file)
    if (useSkillFile) {
      const block: LearnedBlock = {
        post_id: postId,
        attempt_no,
        timestamp: new Date().toISOString(),
        content: sanitizeResult.content,
        source_url: source_url ?? '',
      };

      let writeSuccess: boolean;
      try {
        writeSuccess = await appendSkillBlock(
          this.skillPath,
          block,
          this.maxMemorySize,
        );
      } catch {
        writeSuccess = false;
      }

      const blockHash = writeSuccess ? await this.hashContent(sanitizeResult.content) : undefined;

      const ackPayload: AckRequest = {
        post_id: postId,
        attempt_no,
        result: writeSuccess ? 'success' : 'failure',
        ...(writeSuccess ? { block_hash: blockHash } : { reason: 'skill_write_failed' }),
      };

      try {
        const ackRes = await this.http.request<AckLearnResponse>(
          '/ack/learn',
          ackPayload,
        );

        if (writeSuccess) {
          if (options?.trackQuality) {
            this.recordQualitySnapshot(postId, attempt_no, 'post_learn').catch(() => {});
          }
          return {
            success: true,
            post_id: postId,
            attempt_no,
            learned_at: ackRes.learned_at ?? new Date().toISOString(),
          };
        }

        return {
          success: false,
          post_id: postId,
          reason: 'skill_write_failed',
          detail: `Failed to append skill block for post ${postId} (attempt ${attempt_no}) to ${this.skillPath}`,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          post_id: postId,
          reason: 'ack_error',
          detail: `Learn ack failed for post ${postId} (attempt ${attempt_no}): ${detail}`,
        };
      }
    }

    // Knowledge API-only path: ack directly without memory.md write
    const blockHash = await this.hashContent(sanitizeResult.content);
    const ackPayload: AckRequest = {
      post_id: postId,
      attempt_no,
      result: 'success',
      block_hash: blockHash,
    };

    try {
      const ackRes = await this.http.request<AckLearnResponse>(
        '/ack/learn',
        ackPayload,
      );

      if (options?.trackQuality) {
        this.recordQualitySnapshot(postId, attempt_no, 'post_learn').catch(() => {});
      }

      return {
        success: true,
        post_id: postId,
        attempt_no,
        learned_at: ackRes.learned_at ?? new Date().toISOString(),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        post_id: postId,
        reason: 'ack_error',
        detail: `Learn acknowledgement failed for post ${postId} (attempt ${attempt_no}). Server reconciliation will retry. Original error: ${detail}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  /**
   * Rollback a previously learned post.
   *
   * Flow:
   * 1. POST /api/learn/rollback-start — transition learned -> rollback_pending
   * 2. Remove block from memory.md
   * 3. POST /ack/rollback              — acknowledge success or failure
   */
  async rollback(postId: string, attemptNo: number): Promise<RollbackResult> {
    this.assertInitialized();

    // Step 1: Request rollback_pending transition
    try {
      await this.http.request<RollbackStartResponse>(
        '/api/learn/rollback-start',
        { post_id: postId, attempt_no: attemptNo },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        post_id: postId,
        attempt_no: attemptNo,
        reason:
          err instanceof HttpError
            ? `rollback_start_error (HTTP ${err.status})`
            : 'rollback_start_error',
        detail: `Failed to transition post ${postId} (attempt ${attemptNo}) to rollback_pending state: ${detail}`,
      };
    }

    // Step 2: Remove block from memory.md or skill.md
    let removeSuccess: boolean;
    try {
      if (this.learningMode === 'skill_file') {
        removeSuccess = await removeSkillBlock(this.skillPath, postId, attemptNo);
      } else {
        removeSuccess = await removeLearningBlock(this.memoryPath, postId, attemptNo);
      }
    } catch {
      removeSuccess = false;
    }

    // Step 3: Acknowledge result to server
    const ackPayload: AckRequest = {
      post_id: postId,
      attempt_no: attemptNo,
      result: removeSuccess ? 'success' : 'failure',
      ...(removeSuccess ? {} : { reason: 'memory_remove_failed' }),
    };

    try {
      const ackRes = await this.http.request<AckRollbackResponse>(
        '/ack/rollback',
        ackPayload,
      );

      if (removeSuccess) {
        return {
          success: true,
          post_id: postId,
          attempt_no: attemptNo,
          rolled_back_at: ackRes.rolled_back_at ?? new Date().toISOString(),
        };
      }

      return {
        success: false,
        post_id: postId,
        attempt_no: attemptNo,
        reason: 'memory_remove_failed',
        detail: `Failed to remove learning block for post ${postId} (attempt ${attemptNo}) from ${this.learningMode === 'skill_file' ? this.skillPath : this.memoryPath}`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        post_id: postId,
        attempt_no: attemptNo,
        reason:
          err instanceof HttpError
            ? `ack_error (HTTP ${err.status})`
            : 'ack_error',
        detail: `Rollback acknowledgement failed for post ${postId} (attempt ${attemptNo}). Server reconciliation will retry. Original error: ${detail}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Generate SHA-256 hex hash of content using Web Crypto API.
   */
  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'MoltLoopClient is not initialized. Call init() before learn() or rollback().',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Knowledge API integration
  // ---------------------------------------------------------------------------

  /**
   * Store a knowledge embedding for semantic search.
   * Generates an embedding via the server and stores it in the knowledge base.
   */
  private async storeKnowledgeEmbedding(
    postId: string,
    attemptNo: number,
    content: string,
    sourceUrl: string,
  ): Promise<void> {
    // Step 1: Generate embedding
    const embedResponse = await this.http.request<{ embedding: number[] }>(
      '/knowledge/embed',
      { text: content },
    );

    // Step 2: Store with embedding
    await this.http.request('/knowledge/store', {
      post_id: postId,
      attempt_no: attemptNo,
      content,
      source_url: sourceUrl,
      embedding: embedResponse.embedding,
    });
  }

  /**
   * Record a quality snapshot for learning quality measurement.
   */
  private async recordQualitySnapshot(
    postId: string,
    attemptNo: number,
    snapshotType: 'pre_learn' | 'post_learn',
  ): Promise<void> {
    await this.http.request('/api/quality/record', {
      post_id: postId,
      attempt_no: attemptNo,
      snapshot_type: snapshotType,
    });
  }
}
