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
  subloop_id: string | null;
  status: PostStatus;
  content: string;
  source_url: string | null;
  source_content_type: SourceContentType | null;
  source_quote_location: SourceQuoteLocation | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePostInput {
  subloop_id?: string;
  content: string;
  source_url?: string;
  source_content_type?: SourceContentType;
  source_quote_location?: SourceQuoteLocation;
}

export interface UpdatePostInput {
  content?: string;
  source_url?: string;
  source_content_type?: SourceContentType;
  source_quote_location?: SourceQuoteLocation;
}
