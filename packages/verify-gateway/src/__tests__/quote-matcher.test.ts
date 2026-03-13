import { describe, it, expect } from 'vitest';
import { matchQuote } from '../quote-matcher';
import type { SourceQuoteLocation } from '@moltloop/shared';

describe('matchQuote', () => {
  describe('plaintext', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

    it('should match exact lines', () => {
      const location: SourceQuoteLocation = { type: 'plaintext', start_line: 2, end_line: 3 };
      const result = matchQuote(content, 'text/plain', location);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.extractedText).toContain('Line 2');
        expect(result.extractedText).toContain('Line 3');
      }
    });

    it('should return false for out-of-range lines', () => {
      const location: SourceQuoteLocation = { type: 'plaintext', start_line: 10, end_line: 15 };
      const result = matchQuote(content, 'text/plain', location);
      expect(result.matched).toBe(false);
    });

    it('should reject start_line < 1', () => {
      const location: SourceQuoteLocation = { type: 'plaintext', start_line: 0, end_line: 2 };
      const result = matchQuote(content, 'text/plain', location);
      expect(result.matched).toBe(false);
    });

    it('should reject end_line < start_line', () => {
      const location: SourceQuoteLocation = { type: 'plaintext', start_line: 3, end_line: 2 };
      const result = matchQuote(content, 'text/plain', location);
      expect(result.matched).toBe(false);
    });

    it('should match single line', () => {
      const location: SourceQuoteLocation = { type: 'plaintext', start_line: 1, end_line: 1 };
      const result = matchQuote(content, 'text/plain', location);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.extractedText).toBe('Line 1');
    });
  });

  describe('html', () => {
    const html =
      '<html><body><article><p>First paragraph</p><p>Second paragraph with key phrase</p></article></body></html>';

    it('should match text_fragment in HTML content', () => {
      const location: SourceQuoteLocation = {
        type: 'html',
        selector: 'article > p:nth-of-type(2)',
        text_fragment: 'key phrase',
      };
      const result = matchQuote(html, 'text/html', location);
      expect(result.matched).toBe(true);
    });

    it('should fail when text_fragment is not found', () => {
      const location: SourceQuoteLocation = {
        type: 'html',
        selector: 'article > p',
        text_fragment: 'nonexistent text',
      };
      const result = matchQuote(html, 'text/html', location);
      expect(result.matched).toBe(false);
    });

    it('should match case-insensitively as fallback', () => {
      const location: SourceQuoteLocation = {
        type: 'html',
        selector: 'p',
        text_fragment: 'KEY PHRASE',
      };
      const result = matchQuote(html, 'text/html', location);
      expect(result.matched).toBe(true);
    });

    it('should reject empty text_fragment', () => {
      const location: SourceQuoteLocation = { type: 'html', selector: 'p', text_fragment: '' };
      const result = matchQuote(html, 'text/html', location);
      expect(result.matched).toBe(false);
    });
  });

  describe('content type mismatch', () => {
    it('should fail when content type does not match location type', () => {
      const location: SourceQuoteLocation = {
        type: 'html',
        selector: 'p',
        text_fragment: 'test',
      };
      const result = matchQuote('plain text', 'text/plain', location);
      expect(result.matched).toBe(false);
    });
  });
});
