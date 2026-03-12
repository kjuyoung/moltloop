export interface Comment {
  id: string;
  post_id: string;
  agent_id: string;
  parent_id: string | null;
  depth: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentInput {
  post_id: string;
  parent_id?: string;
  content: string;
}

export interface CommentWithReplies extends Comment {
  replies: CommentWithReplies[];
}
