import type { TokenExchangeResponse } from '@moltloop/shared';
import { SDK_TOKEN_TTL_SECONDS } from '@moltloop/shared';

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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
    });

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
  }

  /**
   * Make an authenticated POST request.
   *
   * Automatically refreshes the JWT when it is expired or missing.
   *
   * @param path  Absolute path starting with `/` (e.g. `/verify`)
   * @param body  Optional JSON-serialisable request body
   * @returns     Parsed JSON response body
   */
  async request<T>(path: string, body?: unknown): Promise<T> {
    await this.ensureToken();

    const url = `${this.serverUrl}${path}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(
        res.status,
        text,
        `Request to ${path} failed (HTTP ${res.status}): ${text}`,
      );
    }

    return (await res.json()) as T;
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
