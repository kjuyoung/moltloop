import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  assertValidTransition,
  InvalidTransitionError,
} from '../state-machine';
import type { VerificationStatus } from '../types/verification';

describe('isValidTransition', () => {
  describe('null(초기 생성)에서의 전이', () => {
    it('null → requested 는 유효하다', () => {
      expect(isValidTransition(null, 'requested')).toBe(true);
    });

    it('null → verified 는 무효하다', () => {
      expect(isValidTransition(null, 'verified')).toBe(false);
    });

    it('null → rejected 는 무효하다', () => {
      expect(isValidTransition(null, 'rejected')).toBe(false);
    });

    it('null → learning_pending 는 무효하다', () => {
      expect(isValidTransition(null, 'learning_pending')).toBe(false);
    });

    it('null → learned 는 무효하다', () => {
      expect(isValidTransition(null, 'learned')).toBe(false);
    });

    it('null → rollback_pending 는 무효하다', () => {
      expect(isValidTransition(null, 'rollback_pending')).toBe(false);
    });

    it('null → rolled_back 는 무효하다', () => {
      expect(isValidTransition(null, 'rolled_back')).toBe(false);
    });
  });

  describe('requested 상태에서의 전이', () => {
    it('requested → verified 는 유효하다', () => {
      expect(isValidTransition('requested', 'verified')).toBe(true);
    });

    it('requested → rejected 는 유효하다', () => {
      expect(isValidTransition('requested', 'rejected')).toBe(true);
    });

    it('requested → learning_pending 는 무효하다', () => {
      expect(isValidTransition('requested', 'learning_pending')).toBe(false);
    });

    it('requested → learned 는 무효하다', () => {
      expect(isValidTransition('requested', 'learned')).toBe(false);
    });

    it('requested → rollback_pending 는 무효하다', () => {
      expect(isValidTransition('requested', 'rollback_pending')).toBe(false);
    });

    it('requested → rolled_back 는 무효하다', () => {
      expect(isValidTransition('requested', 'rolled_back')).toBe(false);
    });

    it('requested → requested 는 무효하다', () => {
      expect(isValidTransition('requested', 'requested')).toBe(false);
    });
  });

  describe('verified 상태에서의 전이', () => {
    it('verified → learning_pending 는 유효하다', () => {
      expect(isValidTransition('verified', 'learning_pending')).toBe(true);
    });

    it('verified → requested 는 무효하다', () => {
      expect(isValidTransition('verified', 'requested')).toBe(false);
    });

    it('verified → rejected 는 무효하다', () => {
      expect(isValidTransition('verified', 'rejected')).toBe(false);
    });

    it('verified → learned 는 무효하다', () => {
      expect(isValidTransition('verified', 'learned')).toBe(false);
    });

    it('verified → rollback_pending 는 무효하다', () => {
      expect(isValidTransition('verified', 'rollback_pending')).toBe(false);
    });

    it('verified → rolled_back 는 무효하다', () => {
      expect(isValidTransition('verified', 'rolled_back')).toBe(false);
    });
  });

  describe('rejected 상태에서의 전이 (터미널)', () => {
    const allStatuses: VerificationStatus[] = [
      'requested',
      'verified',
      'rejected',
      'learning_pending',
      'learned',
      'rollback_pending',
      'rolled_back',
    ];

    it.each(allStatuses)('rejected → %s 는 무효하다', (to) => {
      expect(isValidTransition('rejected', to)).toBe(false);
    });
  });

  describe('learning_pending 상태에서의 전이', () => {
    it('learning_pending → learned 는 유효하다', () => {
      expect(isValidTransition('learning_pending', 'learned')).toBe(true);
    });

    it('learning_pending → verified 는 유효하다 (파일 쓰기 실패 시 보상 전이)', () => {
      expect(isValidTransition('learning_pending', 'verified')).toBe(true);
    });

    it('learning_pending → requested 는 무효하다', () => {
      expect(isValidTransition('learning_pending', 'requested')).toBe(false);
    });

    it('learning_pending → rejected 는 무효하다', () => {
      expect(isValidTransition('learning_pending', 'rejected')).toBe(false);
    });

    it('learning_pending → rollback_pending 는 무효하다', () => {
      expect(isValidTransition('learning_pending', 'rollback_pending')).toBe(false);
    });

    it('learning_pending → rolled_back 는 무효하다', () => {
      expect(isValidTransition('learning_pending', 'rolled_back')).toBe(false);
    });
  });

  describe('learned 상태에서의 전이', () => {
    it('learned → rollback_pending 는 유효하다', () => {
      expect(isValidTransition('learned', 'rollback_pending')).toBe(true);
    });

    it('learned → requested 는 무효하다', () => {
      expect(isValidTransition('learned', 'requested')).toBe(false);
    });

    it('learned → verified 는 무효하다', () => {
      expect(isValidTransition('learned', 'verified')).toBe(false);
    });

    it('learned → learning_pending 는 무효하다', () => {
      expect(isValidTransition('learned', 'learning_pending')).toBe(false);
    });

    it('learned → rolled_back 는 무효하다', () => {
      expect(isValidTransition('learned', 'rolled_back')).toBe(false);
    });
  });

  describe('rollback_pending 상태에서의 전이', () => {
    it('rollback_pending → rolled_back 는 유효하다', () => {
      expect(isValidTransition('rollback_pending', 'rolled_back')).toBe(true);
    });

    it('rollback_pending → learned 는 유효하다 (파일 삭제 실패 시 보상 전이)', () => {
      expect(isValidTransition('rollback_pending', 'learned')).toBe(true);
    });

    it('rollback_pending → requested 는 무효하다', () => {
      expect(isValidTransition('rollback_pending', 'requested')).toBe(false);
    });

    it('rollback_pending → verified 는 무효하다', () => {
      expect(isValidTransition('rollback_pending', 'verified')).toBe(false);
    });

    it('rollback_pending → rejected 는 무효하다', () => {
      expect(isValidTransition('rollback_pending', 'rejected')).toBe(false);
    });

    it('rollback_pending → learning_pending 는 무효하다', () => {
      expect(isValidTransition('rollback_pending', 'learning_pending')).toBe(false);
    });
  });

  describe('rolled_back 상태에서의 전이 (터미널)', () => {
    const allStatuses: VerificationStatus[] = [
      'requested',
      'verified',
      'rejected',
      'learning_pending',
      'learned',
      'rollback_pending',
      'rolled_back',
    ];

    it.each(allStatuses)('rolled_back → %s 는 무효하다', (to) => {
      expect(isValidTransition('rolled_back', to)).toBe(false);
    });
  });
});

describe('assertValidTransition', () => {
  describe('유효한 전이는 예외를 던지지 않는다', () => {
    it('null → requested 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition(null, 'requested')).not.toThrow();
    });

    it('requested → verified 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('requested', 'verified')).not.toThrow();
    });

    it('requested → rejected 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('requested', 'rejected')).not.toThrow();
    });

    it('verified → learning_pending 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('verified', 'learning_pending')).not.toThrow();
    });

    it('learning_pending → learned 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('learning_pending', 'learned')).not.toThrow();
    });

    it('learning_pending → verified (보상) 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('learning_pending', 'verified')).not.toThrow();
    });

    it('learned → rollback_pending 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('learned', 'rollback_pending')).not.toThrow();
    });

    it('rollback_pending → rolled_back 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('rollback_pending', 'rolled_back')).not.toThrow();
    });

    it('rollback_pending → learned (보상) 는 예외를 던지지 않는다', () => {
      expect(() => assertValidTransition('rollback_pending', 'learned')).not.toThrow();
    });
  });

  describe('무효한 전이는 InvalidTransitionError를 던진다', () => {
    it('null → verified 는 InvalidTransitionError를 던진다', () => {
      expect(() => assertValidTransition(null, 'verified')).toThrow(InvalidTransitionError);
    });

    it('rejected → verified 는 InvalidTransitionError를 던진다 (터미널 상태)', () => {
      expect(() => assertValidTransition('rejected', 'verified')).toThrow(InvalidTransitionError);
    });

    it('rolled_back → requested 는 InvalidTransitionError를 던진다 (터미널 상태)', () => {
      expect(() => assertValidTransition('rolled_back', 'requested')).toThrow(
        InvalidTransitionError,
      );
    });

    it('learned → verified 는 InvalidTransitionError를 던진다', () => {
      expect(() => assertValidTransition('learned', 'verified')).toThrow(InvalidTransitionError);
    });
  });
});

describe('InvalidTransitionError', () => {
  it('from과 to 프로퍼티가 정확히 설정된다', () => {
    // Given
    const from: VerificationStatus = 'rejected';
    const to: VerificationStatus = 'verified';

    // When
    const error = new InvalidTransitionError(from, to);

    // Then
    expect(error.from).toBe('rejected');
    expect(error.to).toBe('verified');
  });

  it('null → invalid 전이 시 올바른 메시지를 포함한다', () => {
    // Given / When
    const error = new InvalidTransitionError(null, 'verified');

    // Then
    expect(error.message).toContain('verified');
    expect(error.message).toContain('requested');
  });

  it('상태 간 무효 전이 시 from과 to가 메시지에 포함된다', () => {
    // Given / When
    const error = new InvalidTransitionError('rejected', 'verified');

    // Then
    expect(error.message).toContain('rejected');
    expect(error.message).toContain('verified');
  });

  it('name이 InvalidTransitionError 이다', () => {
    const error = new InvalidTransitionError('rejected', 'verified');
    expect(error.name).toBe('InvalidTransitionError');
  });

  it('Error를 상속한다', () => {
    const error = new InvalidTransitionError('rejected', 'verified');
    expect(error).toBeInstanceOf(Error);
  });

  it('from이 null일 때 from 프로퍼티가 null이다', () => {
    const error = new InvalidTransitionError(null, 'verified');
    expect(error.from).toBeNull();
    expect(error.to).toBe('verified');
  });
});
