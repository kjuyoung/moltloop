/**
 * Safe HTTP fetch with comprehensive SSRF protections.
 *
 * - HTTPS only
 * - DNS resolution + private IP blocking on every hop
 * - Manual redirect following with per-hop validation
 * - Response size limiting
 * - Timeout enforcement
 * - Content-Type filtering
 */

import type { SourceContentType } from '@moltloop/shared';
import {
  MAX_FETCH_RESPONSE_SIZE,
  FETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
} from '@moltloop/shared';
import { resolveAndValidate, isError } from './dns-resolver';

export interface SafeFetchOk {
  ok: true;
  body: string;
  contentType: SourceContentType;
  finalUrl: string;
}

export interface SafeFetchFail {
  ok: false;
  reason: string;
}

export type SafeFetchResult = SafeFetchOk | SafeFetchFail;

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Validate that a URL uses https:// and has a valid hostname.
 */
function validateUrl(raw: string): { url: URL; error?: never } | { url?: never; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'invalid_url' };
  }

  if (url.protocol !== 'https:') {
    return { error: 'invalid_url' };
  }

  if (!url.hostname) {
    return { error: 'invalid_url' };
  }

  return { url };
}

/**
 * Parse the Content-Type header into a supported SourceContentType, or null.
 */
function parseContentType(header: string | null): SourceContentType | null {
  if (!header) return null;
  const mime = header.split(';')[0].trim().toLowerCase();
  if (mime === 'text/html') return 'text/html';
  if (mime === 'text/plain') return 'text/plain';
  if (mime === 'application/pdf') return 'application/pdf';
  if (mime === 'application/json') return 'application/json';
  return null;
}

/**
 * Read a response body with a size limit, aborting if exceeded.
 */
async function readBodyWithLimit(
  response: Response,
  abortController: AbortController,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.byteLength;
      if (totalSize > MAX_FETCH_RESPONSE_SIZE) {
        reader.cancel();
        abortController.abort();
        return null; // signals too_large
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }
    // Flush the decoder
    chunks.push(decoder.decode());
  } catch {
    return null;
  }

  return chunks.join('');
}

/**
 * Detect if an HTML page appears to be a JavaScript-only SPA with no
 * meaningful server-rendered content. This is a simple heuristic.
 */
function appearsJsRequired(body: string, contentType: SourceContentType): boolean {
  if (contentType !== 'text/html') return false;

  const lower = body.toLowerCase();

  // Check for common SPA patterns: empty body with JS bundles
  // A very minimal body with noscript tags suggesting JS is required
  const bodyMatch = lower.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (!bodyMatch) return false;

  const bodyContent = bodyMatch[1].trim();

  // If the body contains only script tags, a root div, and/or noscript warnings
  const stripped = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<div\s+id=["'](?:root|app|__next)["']\s*>\s*<\/div>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // If virtually nothing is left, it's likely a JS-required page
  return stripped.length < 50;
}

/**
 * Fetch a URL with full SSRF protection, redirect following, timeout,
 * size limiting, and content-type validation.
 */
export async function safeFetch(url: string): Promise<SafeFetchResult> {
  const urlValidation = validateUrl(url);
  if (urlValidation.error) {
    return { ok: false, reason: urlValidation.error };
  }

  let currentUrl = urlValidation.url!;
  let redirectCount = 0;

  while (true) {
    // Validate DNS for current URL
    const dnsResult = await resolveAndValidate(currentUrl.hostname);
    if (isError(dnsResult)) {
      return { ok: false, reason: 'private_ip' };
    }

    // Set up timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.href, {
        method: 'GET',
        redirect: 'manual',
        signal: abortController.signal,
        headers: {
          'User-Agent': 'MoltLoop-VerifyBot/1.0',
          Accept: 'text/html, text/plain;q=0.9, application/json;q=0.8, application/pdf;q=0.7, */*;q=0.1',
        },
      });
    } catch (_err) {
      clearTimeout(timeoutId);
      if (abortController.signal.aborted) {
        return { ok: false, reason: 'timeout' };
      }
      return { ok: false, reason: 'fetch_failed' };
    }

    clearTimeout(timeoutId);

    // Handle redirects manually
    if (REDIRECT_STATUS_CODES.has(response.status)) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        return { ok: false, reason: 'redirect_limit' };
      }

      const location = response.headers.get('location');
      if (!location) {
        return { ok: false, reason: 'fetch_failed' };
      }

      // Resolve relative redirects against the current URL
      const redirectValidation = validateUrl(new URL(location, currentUrl).href);
      if (redirectValidation.error) {
        return { ok: false, reason: redirectValidation.error };
      }

      currentUrl = redirectValidation.url as URL;
      continue;
    }

    // Non-2xx response
    if (!response.ok) {
      return { ok: false, reason: 'fetch_failed' };
    }

    // Content-Type check
    const contentType = parseContentType(response.headers.get('content-type'));
    if (!contentType) {
      return { ok: false, reason: 'unsupported_content_type' };
    }

    // Read body with size limit
    const body = await readBodyWithLimit(response, abortController);
    if (body === null) {
      return { ok: false, reason: 'too_large' };
    }

    // Check if the page appears to require JavaScript rendering
    if (appearsJsRequired(body, contentType)) {
      return { ok: false, reason: 'js_required' };
    }

    return {
      ok: true,
      body,
      contentType,
      finalUrl: currentUrl.href,
    };
  }
}
