import type {
  MoltLoopClientConfig,
  LearnResult,
  RollbackResult,
  SyncResult,
  SyncMemoryStateRequest,
  AckRequest,
  LearnedBlock,
} from '@moltloop/shared';
import {
  resolveMemoryPath,
  appendLearningBlock,
  removeLearningBlock,
  listLearnedBlocks,
} from '@moltloop/memory-writer';

import { HttpClient, HttpError } from './http-client';

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
  private agentId: string;
  private readonly maxMemorySize?: number;
  private initialized = false;

  constructor(config: MoltLoopClientConfig) {
    this.http = new HttpClient(config.serverUrl, config.apiKey);
    this.agentId = config.agentId ?? '';
    this.memoryPath = config.memoryPath ?? '';
    this.maxMemorySize = config.maxMemorySize;
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
    const localBlocks = await listLearnedBlocks(this.memoryPath);

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
   */
  async learn(postId: string): Promise<LearnResult> {
    this.assertInitialized();

    // Step 1: Verify the post
    let verifyRes: VerifyResponse;
    try {
      verifyRes = await this.http.request<VerifyResponse>('/verify', {
        post_id: postId,
      });
    } catch (err) {
      return {
        success: false,
        post_id: postId,
        reason: 'verification_error',
        detail: err instanceof Error ? err.message : String(err),
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
      return {
        success: false,
        post_id: postId,
        reason: 'learn_start_error',
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 3: Write the learned block to memory.md
    const block: LearnedBlock = {
      post_id: postId,
      attempt_no,
      timestamp: new Date().toISOString(),
      content: extracted_text ?? '',
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

    // Step 4: Acknowledge result to server
    const ackPayload: AckRequest = {
      post_id: postId,
      attempt_no,
      result: writeSuccess ? 'success' : 'failure',
      ...(writeSuccess ? {} : { reason: 'memory_write_failed' }),
    };

    try {
      const ackRes = await this.http.request<AckLearnResponse>(
        '/ack/learn',
        ackPayload,
      );

      if (writeSuccess) {
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
        detail: 'Failed to append learning block to memory.md',
      };
    } catch (err) {
      // Ack itself failed — the server may reconcile this later
      return {
        success: false,
        post_id: postId,
        reason: 'ack_error',
        detail: err instanceof Error ? err.message : String(err),
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
      return {
        success: false,
        post_id: postId,
        attempt_no: attemptNo,
        reason:
          err instanceof HttpError
            ? `rollback_start_error (HTTP ${err.status})`
            : 'rollback_start_error',
      };
    }

    // Step 2: Remove block from memory.md
    let removeSuccess: boolean;
    try {
      removeSuccess = await removeLearningBlock(
        this.memoryPath,
        postId,
        attemptNo,
      );
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
      };
    } catch (err) {
      return {
        success: false,
        post_id: postId,
        attempt_no: attemptNo,
        reason:
          err instanceof HttpError
            ? `ack_error (HTTP ${err.status})`
            : 'ack_error',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'MoltLoopClient is not initialized. Call init() before learn() or rollback().',
      );
    }
  }
}
