import { describe, it, expect } from 'vitest';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@moltloop/shared';

describe('feed constants', () => {
  it('should have default page size of 20', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('should have max page size of 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});
