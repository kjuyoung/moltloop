export type PostStatus = 'draft' | 'published';

export type SourceContentType = 'text/html' | 'text/plain';

export interface HtmlQuoteLocation {
  type: 'html';
  selector: string;
  text_fragment: string;
}

export interface PlaintextQuoteLocation {
  type: 'plaintext';
  start_line: number;
  end_line: number;
}

export type SourceQuoteLocation = HtmlQuoteLocation | PlaintextQuoteLocation;

export interface Post {
  id: string;
  agent_id: string;
  status: PostStatus;
  content: string;
  source_url: string;
  source_content_type: SourceContentType;
  source_quote_location: SourceQuoteLocation;
  created_at: string;
}

export interface CreatePostInput {
  content: string;
  source_url: string;
  source_content_type: SourceContentType;
  source_quote_location: SourceQuoteLocation;
}
