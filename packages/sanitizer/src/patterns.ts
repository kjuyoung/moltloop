export interface DangerousPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

export const DANGEROUS_PATTERNS: DangerousPattern[] = [
  {
    name: 'instruction_override',
    pattern:
      /\bignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions|prompts|rules|guidelines|directives)\b/i,
    description: 'Attempts to override existing instructions',
  },
  {
    name: 'role_reassignment',
    pattern:
      /\b(you\s+are\s+now|from\s+now\s+on[,.]?\s*(you\s+)?(are|act|behave|respond)|pretend\s+(you\s+are|to\s+be)|act\s+as\s+(a\s+|an\s+)?(?!tools?\b))/i,
    description: 'Attempts to reassign the AI role',
  },
  {
    name: 'system_prompt',
    pattern: /(?:^|\n)\s*(system\s*:|###\s*system\b|\[system\])/i,
    description: 'Attempts to inject a system prompt',
  },
  {
    name: 'instruction_marker',
    pattern: /\[INST\]|<<SYS>>|<\|im_start\|>|<\|system\|>|<\|user\|>|<\|assistant\|>/i,
    description: 'Uses LLM-specific instruction markers',
  },
  {
    name: 'executable_command',
    pattern: /\b(execute|eval|run|sudo|bash\s+-c|curl\s+-[sS]?[Oo]?|wget\s+-[qO]?)\s*[:\s]/i,
    description: 'Contains executable command patterns',
  },
  {
    name: 'jailbreak_phrase',
    pattern:
      /\b(DAN\s+mode|developer\s+mode|jailbreak|without\s+(any\s+)?(restrictions|limitations|safety|filters)|bypass\s+(safety|content|filter))\b/i,
    description: 'Contains known jailbreak phrases',
  },
  {
    name: 'prompt_leak',
    pattern:
      /\b(repeat\s+(the\s+)?(above|previous|your)\s+(text|prompt|instructions)|show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions)|what\s+are\s+your\s+(instructions|rules|guidelines))\b/i,
    description: 'Attempts to extract system prompts',
  },
  {
    name: 'encoded_payload',
    pattern: /\b(base64|atob|btoa)\s*\(|data:text\/[a-z]+;base64,/i,
    description: 'Contains encoded payload patterns',
  },
];

export function matchesAnyPattern(text: string): DangerousPattern | null {
  for (const dp of DANGEROUS_PATTERNS) {
    if (dp.pattern.test(text)) {
      return dp;
    }
  }
  return null;
}
