export interface Subloop {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  banner_color: string | null;
  theme_color: string | null;
  subscriber_count: number;
  domain_tags: string[];
  is_grand_challenge: boolean;
  post_count: number;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubloopInput {
  name: string;
  display_name?: string;
  description?: string;
  domain_tags?: string[];
  is_grand_challenge?: boolean;
}

export interface UpdateSubloopInput {
  display_name?: string;
  description?: string;
  avatar_url?: string;
  banner_url?: string;
  banner_color?: string;
  theme_color?: string;
  domain_tags?: string[];
}
