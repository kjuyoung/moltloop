import { describe, it, expect } from 'vitest';
import * as constants from '../constants';

describe('constants', () => {
  it('should export MAX_LEARNING_BLOCK_SIZE as 500', () => {
    expect(constants.MAX_LEARNING_BLOCK_SIZE).toBe(500);
  });

  it('should have pending thresholds in ascending order', () => {
    expect(constants.PENDING_ACK_THRESHOLD_MS).toBeLessThan(constants.PENDING_AUDIT_THRESHOLD_MS);
    expect(constants.PENDING_AUDIT_THRESHOLD_MS).toBeLessThan(constants.PENDING_ALERT_THRESHOLD_MS);
  });

  it('should have API key prefix as "ml_"', () => {
    expect(constants.API_KEY_PREFIX).toBe('ml_');
  });

  it('should have SDK token TTL of 2 hours', () => {
    expect(constants.SDK_TOKEN_TTL_SECONDS).toBe(7200);
  });

  it('should have PoW min solve time less than max solve time', () => {
    expect(constants.POW_MIN_SOLVE_TIME_MS).toBeLessThan(constants.POW_MAX_SOLVE_TIME_MS);
  });

  it('should have trust score min less than max', () => {
    expect(constants.TRUST_SCORE_MIN).toBeLessThan(constants.TRUST_SCORE_MAX);
  });

  it('should have page size defaults reasonable', () => {
    expect(constants.DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    expect(constants.MAX_PAGE_SIZE).toBeGreaterThan(constants.DEFAULT_PAGE_SIZE);
  });
});
