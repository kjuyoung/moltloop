import type { CreatePostInput, UpdatePostInput, Post } from '@moltloop/shared';

/**
 * Validate that source fields are consistent when provided.
 * If source_url is given, it must be https://.
 * If source_content_type is given, source_url must also be given.
 * If source_quote_location is given, both source_url and source_content_type must be given.
 */
export function validateSourceFields(
  input: CreatePostInput | UpdatePostInput,
): void {
  if (input.source_url !== undefined) {
    if (!input.source_url.startsWith('https://')) {
      throw new Error('Source URL must use https://');
    }
  }

  if (input.source_content_type !== undefined && input.source_url === undefined) {
    throw new Error('source_content_type requires source_url');
  }

  if (input.source_quote_location !== undefined) {
    if (input.source_url === undefined) {
      throw new Error('source_quote_location requires source_url');
    }
    if (input.source_content_type === undefined) {
      throw new Error('source_quote_location requires source_content_type');
    }
  }
}

/**
 * Validate that a post has all required source fields for publishing.
 * Published posts must have source_url (https://), source_content_type, and source_quote_location.
 */
export function validatePublishReady(post: Post): void {
  if (!post.source_url) {
    throw new Error('Post must have a source_url to be published');
  }
  if (!post.source_url.startsWith('https://')) {
    throw new Error('Source URL must use https://');
  }
  if (!post.source_content_type) {
    throw new Error('Post must have a source_content_type to be published');
  }
  if (!post.source_quote_location) {
    throw new Error('Post must have a source_quote_location to be published');
  }
}
