/**
 * Main verification entry point.
 *
 * Orchestrates source URL fetching and quote matching to determine
 * whether a claimed source quote is authentic.
 */

import type { SourceContentType, SourceQuoteLocation } from '@moltloop/shared';
import { safeFetch } from './safe-fetch';
import { matchQuote } from './quote-matcher';

export type VerifyRejectReason =
  | 'invalid_url'
  | 'private_ip'
  | 'dns_failed'
  | 'fetch_failed'
  | 'timeout'
  | 'too_large'
  | 'unsupported_content_type'
  | 'redirect_limit'
  | 'quote_mismatch'
  | 'js_required';

export interface VerifyOk {
  verified: true;
  extractedText: string;
  finalUrl: string;
}

export interface VerifyFail {
  verified: false;
  reason: VerifyRejectReason;
  detail?: string;
}

export type VerifyResult = VerifyOk | VerifyFail;

/**
 * Map a safeFetch failure reason to a VerifyRejectReason.
 */
function mapFetchReason(reason: string): VerifyRejectReason {
  const known: Record<string, VerifyRejectReason> = {
    invalid_url: 'invalid_url',
    private_ip: 'private_ip',
    dns_failed: 'dns_failed',
    fetch_failed: 'fetch_failed',
    timeout: 'timeout',
    too_large: 'too_large',
    unsupported_content_type: 'unsupported_content_type',
    redirect_limit: 'redirect_limit',
    js_required: 'js_required',
  };
  return known[reason] ?? 'fetch_failed';
}

/**
 * Verify that a source URL contains the claimed quote.
 *
 * This function performs a single fetch attempt. The caller is responsible
 * for retry logic (e.g. MAX_FETCH_RETRIES with 30s delays) and per-URL
 * rate limiting (MAX_FETCHES_PER_URL_PER_MINUTE).
 *
 * @param url - The source URL to fetch (must be https://)
 * @param contentType - Expected content type of the source
 * @param quoteLocation - Where the quote should be found in the source
 * @returns Verification result indicating success or failure with reason
 */
export async function verifySource(
  url: string,
  contentType: SourceContentType,
  quoteLocation: SourceQuoteLocation,
): Promise<VerifyResult> {
  // Step 1: Fetch the source URL safely
  const fetchResult = await safeFetch(url);

  if (!fetchResult.ok) {
    return {
      verified: false,
      reason: mapFetchReason(fetchResult.reason),
      detail: fetchResult.reason,
    };
  }

  // Step 2: Verify the fetched content type matches expectation
  if (fetchResult.contentType !== contentType) {
    return {
      verified: false,
      reason: 'unsupported_content_type',
      detail: `Expected ${contentType} but received ${fetchResult.contentType}`,
    };
  }

  // Step 3: Match the quote against the fetched content
  const quoteResult = matchQuote(fetchResult.body, fetchResult.contentType, quoteLocation);

  if (!quoteResult.matched) {
    return {
      verified: false,
      reason: 'quote_mismatch',
      detail: quoteResult.reason,
    };
  }

  return {
    verified: true,
    extractedText: quoteResult.extractedText,
    finalUrl: fetchResult.finalUrl,
  };
}
