import type { TokenExchangeResponse } from '@moltloop/shared';
import {
  SDK_TOKEN_TTL_SECONDS,
  SDK_MAX_RETRIES,
  SDK_INITIAL_RETRY_DELAY_MS,
  SDK_REQUEST_TIMEOUT_MS,
} from '@moltloop/shared';

/**
 * Error thrown when an HTTP request to the MoltLoop server fails.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Lightweight HTTP client for MoltLoop server communication.
 *
 * Handles API-key-to-JWT token exchange and automatic token refresh.
 * All requests are POST with JSON bodies.
 * Includes retry logic with exponential backoff for transient failures
 * and per-request timeout handling via AbortController.
 */
export class HttpClient {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  /** Populated after authenticate() */
  agentId: string | null = null;

  constructor(serverUrl: string, apiKey: string) {
    // Strip trailing slash so callers can use paths starting with /
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Exchange API key for a short-lived JWT token.
   *
   * POST {serverUrl}/api/auth/token
   * Header: x-api-key
   * Response: TokenExchangeResponse
   */
  async authenticate(): Promise<TokenExchangeResponse> {
    const url = `${this.serverUrl}/api/auth/token`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SDK_REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new HttpError(
          res.status,
          body,
          `Authentication failed (HTTP ${res.status}): ${body}`,
        );
      }

      const data = (await res.json()) as TokenExchangeResponse;

      this.token = data.token;
      this.agentId = data.agent_id;

      // Derive local expiry from server-provided expires_at, with a 30-second
      // safety margin so we refresh before the token actually expires.
      const serverExpiry = new Date(data.expires_at).getTime();
      const safetyMarginMs = 30_000;
      this.tokenExpiresAt = serverExpiry
        ? serverExpiry - safetyMarginMs
        : Date.now() + SDK_TOKEN_TTL_SECONDS * 1000 - safetyMarginMs;

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          `Authentication request timed out after ${SDK_REQUEST_TIMEOUT_MS}ms`,
        );
      }

      throw err;
    }
  }

  /**
   * Make an authenticated POST request with retry and timeout.
   *
   * Automatically refreshes the JWT when it is expired or missing.
   * Retries on network errors and 5xx responses with exponential backoff.
   * Does not retry 4xx client errors.
   *
   * @param path  Absolute path starting with `/` (e.g. `/verify`)
   * @param body  Optional JSON-serialisable request body
   * @returns     Parsed JSON response body
   */
  async request<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>(path, body);
  }

  /**
   * Internal method that wraps fetch with timeout and retry logic.
   *
   * - Each attempt has a per-request timeout via AbortController
   * - On network error (TypeError) or 5xx status, retries up to maxRetries times
   * - On 4xx error, throws immediately (client errors are not transient)
   * - Uses exponential backoff: delay * 2^attempt
   */
  private async requestWithRetry<T>(
    path: string,
    body?: unknown,
    retries: number = SDK_MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.ensureToken();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SDK_REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(`${this.serverUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.token}`,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const responseBody = await response.json().catch(() => ({}));

            // Don't retry 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
              throw new HttpError(
                response.status,
                responseBody,
                `Request to ${path} failed (HTTP ${response.status}): ${JSON.stringify(responseBody)}`,
              );
            }

            // 5xx errors are retryable
            throw new HttpError(
              response.status,
              responseBody,
              `Request to ${path} failed (HTTP ${response.status}): ${JSON.stringify(responseBody)}`,
            );
          }

          return (await response.json()) as T;
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      } catch (err) {
        // Convert AbortError to a more descriptive timeout error
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = new Error(
            `Request to ${path} timed out after ${SDK_REQUEST_TIMEOUT_MS}ms`,
          );
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }

        // Don't retry client errors (4xx)
        if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
          throw err;
        }

        // Don't retry if this was the last attempt
        if (attempt === retries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = SDK_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Re-authenticate if the current token is missing or expired.
   */
  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return;
    }
    await this.authenticate();
  }
}
