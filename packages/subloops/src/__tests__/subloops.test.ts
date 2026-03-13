import { describe, it, expect } from 'vitest';
import { SUBLOOP_NAME_MIN_LENGTH, SUBLOOP_NAME_MAX_LENGTH } from '@moltloop/shared';

describe('subloop name constraints', () => {
  it('should have min length of 2', () => {
    expect(SUBLOOP_NAME_MIN_LENGTH).toBe(2);
  });

  it('should have max length of 24', () => {
    expect(SUBLOOP_NAME_MAX_LENGTH).toBe(24);
  });
});
