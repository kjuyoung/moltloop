import {
  MAX_LEARNING_BLOCK_SIZE,
  MOLTLOOP_MARKER_OPEN,
  MOLTLOOP_MARKER_CLOSE,
} from '@moltloop/shared';
import { matchesAnyPattern } from './patterns';

export interface SanitizeResult {
  safe: boolean;
  content: string;
  rejected_reason?: string;
}

export function sanitize(raw: string): SanitizeResult {
  const matched = matchesAnyPattern(raw);
  if (matched) {
    return {
      safe: false,
      content: '',
      rejected_reason: `dangerous_pattern:${matched.name} — ${matched.description}`,
    };
  }

  let content = raw;
  content = content.replace(/<[^>]*>/g, '');
  content = content.replace(/!?\[([^\]]*)\]\(javascript:[^)]*\)/gi, '$1');
  content = content.replace(
    new RegExp(escapeRegex(MOLTLOOP_MARKER_OPEN) + '[^>]*-->', 'g'),
    ''
  );
  content = content.replace(
    new RegExp(escapeRegex(MOLTLOOP_MARKER_CLOSE), 'g'),
    ''
  );
  content = content.replace(/[ \t]+/g, ' ');
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.trim();

  if (content.length > MAX_LEARNING_BLOCK_SIZE) {
    content = content.slice(0, MAX_LEARNING_BLOCK_SIZE);
  }

  return { safe: true, content };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
