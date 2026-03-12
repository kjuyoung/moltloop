/**
 * Quote matching against fetched source content.
 *
 * Verifies that a claimed quote actually exists in the fetched source
 * at the declared location.
 */

import type {
  SourceContentType,
  SourceQuoteLocation,
  HtmlQuoteLocation,
  PlaintextQuoteLocation,
} from '@moltloop/shared';

export interface QuoteMatchOk {
  matched: true;
  extractedText: string;
}

export interface QuoteMatchFail {
  matched: false;
  reason: string;
}

export type QuoteMatchResult = QuoteMatchOk | QuoteMatchFail;

/**
 * Strip HTML tags from a string and collapse whitespace,
 * returning plain text content.
 */
function stripHtmlTags(html: string): string {
  return (
    html
      // Remove script and style blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Replace block-level elements with newlines for better text extraction
      .replace(/<\/(?:p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, '\n')
      .replace(/<(?:br|hr)[^>]*\/?>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse whitespace within lines
      .replace(/[ \t]+/g, ' ')
      // Collapse multiple blank lines
      .replace(/\n\s*\n/g, '\n')
      .trim()
  );
}

/**
 * Normalize whitespace for fuzzy text comparison.
 * Collapses all whitespace sequences to a single space and trims.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Match a quote in an HTML document using the text_fragment.
 */
function matchHtmlQuote(body: string, location: HtmlQuoteLocation): QuoteMatchResult {
  const { text_fragment } = location;

  if (!text_fragment || text_fragment.trim().length === 0) {
    return { matched: false, reason: 'Empty text_fragment' };
  }

  const plainText = stripHtmlTags(body);
  const normalizedBody = normalizeWhitespace(plainText);
  const normalizedFragment = normalizeWhitespace(text_fragment);

  if (normalizedBody.includes(normalizedFragment)) {
    // Find the actual matching portion from the original plain text
    // for a more faithful extracted text
    const idx = normalizedBody.indexOf(normalizedFragment);
    const extractedText = normalizedBody.slice(idx, idx + normalizedFragment.length);
    return { matched: true, extractedText };
  }

  // Try case-insensitive match as fallback
  const lowerBody = normalizedBody.toLowerCase();
  const lowerFragment = normalizedFragment.toLowerCase();

  if (lowerBody.includes(lowerFragment)) {
    const idx = lowerBody.indexOf(lowerFragment);
    const extractedText = normalizedBody.slice(idx, idx + normalizedFragment.length);
    return { matched: true, extractedText };
  }

  return {
    matched: false,
    reason: 'text_fragment not found in page content',
  };
}

/**
 * Match a quote in a plaintext document using line range.
 */
function matchPlaintextQuote(
  body: string,
  location: PlaintextQuoteLocation,
): QuoteMatchResult {
  const { start_line, end_line } = location;

  if (start_line < 1) {
    return { matched: false, reason: 'start_line must be >= 1' };
  }
  if (end_line < start_line) {
    return { matched: false, reason: 'end_line must be >= start_line' };
  }

  const lines = body.split('\n');

  if (start_line > lines.length) {
    return {
      matched: false,
      reason: `start_line ${start_line} exceeds document length (${lines.length} lines)`,
    };
  }
  if (end_line > lines.length) {
    return {
      matched: false,
      reason: `end_line ${end_line} exceeds document length (${lines.length} lines)`,
    };
  }

  // Lines are 1-indexed
  const extractedLines = lines.slice(start_line - 1, end_line);
  const extractedText = extractedLines.join('\n');

  if (extractedText.trim().length === 0) {
    return { matched: false, reason: 'Extracted lines are empty' };
  }

  return { matched: true, extractedText };
}

/**
 * Match a quoted content fragment against a fetched source body.
 *
 * For HTML sources, strips tags and searches for the text_fragment.
 * For plaintext sources, extracts the specified line range.
 */
export function matchQuote(
  body: string,
  contentType: SourceContentType,
  quoteLocation: SourceQuoteLocation,
): QuoteMatchResult {
  if (contentType === 'text/html' && quoteLocation.type === 'html') {
    return matchHtmlQuote(body, quoteLocation);
  }

  if (contentType === 'text/plain' && quoteLocation.type === 'plaintext') {
    return matchPlaintextQuote(body, quoteLocation);
  }

  return {
    matched: false,
    reason: `Content type "${contentType}" does not match quote location type "${quoteLocation.type}"`,
  };
}
