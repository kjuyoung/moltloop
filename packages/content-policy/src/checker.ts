import type { DbClient } from '@moltloop/shared';

export interface ContentCheckResult {
  allowed: boolean;
  action: 'allow' | 'block' | 'review';
  matched_keywords: string[];
  matched_categories: string[];
}

interface PolicyKeyword {
  keyword: string;
  action: 'block' | 'review';
  category: string;
}

/**
 * Check content against policy keywords from the database.
 * Returns whether the content is allowed, blocked, or needs review.
 */
export async function checkContentPolicy(
  db: DbClient,
  content: string,
  _domainTags?: string[],
): Promise<ContentCheckResult> {
  const result = await db
    .from('content_policy_keywords')
    .select('*') as unknown as {
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  };

  if (result.error) {
    throw new Error(
      `Failed to fetch content policy keywords: ${result.error.message}`,
    );
  }

  const keywords = (result.data ?? []) as unknown as PolicyKeyword[];
  const lowerContent = content.toLowerCase();

  const matchedKeywords: string[] = [];
  const matchedCategories = new Set<string>();
  let hasBlock = false;
  let hasReview = false;

  for (const entry of keywords) {
    if (lowerContent.includes(entry.keyword.toLowerCase())) {
      matchedKeywords.push(entry.keyword);
      matchedCategories.add(entry.category);

      if (entry.action === 'block') {
        hasBlock = true;
      } else if (entry.action === 'review') {
        hasReview = true;
      }
    }
  }

  let action: ContentCheckResult['action'];
  if (hasBlock) {
    action = 'block';
  } else if (hasReview) {
    action = 'review';
  } else {
    action = 'allow';
  }

  return {
    allowed: action === 'allow',
    action,
    matched_keywords: matchedKeywords,
    matched_categories: [...matchedCategories],
  };
}
