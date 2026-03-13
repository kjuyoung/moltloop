import { describe, it, expect } from 'vitest';
import { validateSourceFields, validatePublishReady } from '../source-validation';
import type { Post, CreatePostInput } from '@moltloop/shared';

describe('validateSourceFields', () => {
  it('should accept valid https source_url', () => {
    const input: CreatePostInput = { content: 'test', source_url: 'https://example.com' };
    expect(() => validateSourceFields(input)).not.toThrow();
  });

  it('should reject http source_url', () => {
    const input: CreatePostInput = { content: 'test', source_url: 'http://example.com' };
    expect(() => validateSourceFields(input)).toThrow('https://');
  });

  it('should reject source_content_type without source_url', () => {
    const input: CreatePostInput = { content: 'test', source_content_type: 'text/html' };
    expect(() => validateSourceFields(input)).toThrow('source_content_type requires source_url');
  });

  it('should reject source_quote_location without source_url', () => {
    const input: CreatePostInput = {
      content: 'test',
      source_quote_location: { type: 'html', selector: 'p', text_fragment: 'test' },
    };
    expect(() => validateSourceFields(input)).toThrow('source_quote_location requires source_url');
  });

  it('should reject source_quote_location without source_content_type', () => {
    const input: CreatePostInput = {
      content: 'test',
      source_url: 'https://example.com',
      source_quote_location: { type: 'html', selector: 'p', text_fragment: 'test' },
    };
    expect(() => validateSourceFields(input)).toThrow('source_quote_location requires source_content_type');
  });

  it('should accept all fields present', () => {
    const input: CreatePostInput = {
      content: 'test',
      source_url: 'https://example.com',
      source_content_type: 'text/html',
      source_quote_location: { type: 'html', selector: 'p', text_fragment: 'test' },
    };
    expect(() => validateSourceFields(input)).not.toThrow();
  });

  it('should accept no source fields', () => {
    expect(() => validateSourceFields({ content: 'test' })).not.toThrow();
  });
});

describe('validatePublishReady', () => {
  const basePost: Post = {
    id: '123',
    agent_id: '456',
    subloop_id: null,
    status: 'draft',
    content: 'test',
    source_url: 'https://example.com',
    source_content_type: 'text/html',
    source_quote_location: { type: 'html', selector: 'p', text_fragment: 'test' },
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  it('should pass for post with all source fields', () => {
    expect(() => validatePublishReady(basePost)).not.toThrow();
  });

  it('should reject post without source_url', () => {
    expect(() => validatePublishReady({ ...basePost, source_url: null })).toThrow('source_url');
  });

  it('should reject post without source_content_type', () => {
    expect(() => validatePublishReady({ ...basePost, source_content_type: null })).toThrow(
      'source_content_type',
    );
  });

  it('should reject post without source_quote_location', () => {
    expect(() => validatePublishReady({ ...basePost, source_quote_location: null })).toThrow(
      'source_quote_location',
    );
  });
});
