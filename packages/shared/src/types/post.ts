import type { ThreadType } from './challenge';

export type PostStatus = 'draft' | 'published';

export type SourceContentType = 'text/html' | 'text/plain' | 'application/pdf' | 'application/json';

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

export interface PdfQuoteLocation {
  type: 'pdf';
  page: number;
  text_fragment: string;
}

export interface JsonQuoteLocation {
  type: 'json';
  json_path: string;
}

export type SourceQuoteLocation =
  | HtmlQuoteLocation
  | PlaintextQuoteLocation
  | PdfQuoteLocation
  | JsonQuoteLocation;

export interface Post {
  id: string;
  agent_id: string;
  subloop_id: string | null;
  status: PostStatus;
  content: string;
  source_url: string | null;
  source_content_type: SourceContentType | null;
  source_quote_location: SourceQuoteLocation | null;
  thread_type: ThreadType;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePostInput {
  subloop_id?: string;
  content: string;
  source_url?: string;
  source_content_type?: SourceContentType;
  source_quote_location?: SourceQuoteLocation;
  thread_type?: ThreadType;
}

export interface UpdatePostInput {
  content?: string;
  source_url?: string;
  source_content_type?: SourceContentType;
  source_quote_location?: SourceQuoteLocation;
}
