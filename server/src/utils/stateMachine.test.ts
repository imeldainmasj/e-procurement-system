import { describe, expect, it } from 'vitest';
import { PR_STATUS_LABELS, PR_TRANSITIONS } from '@sipita/shared';
import { AppError } from './AppError.js';
import { assertTransition } from './stateMachine.js';

describe('assertTransition', () => {
  it('passes allowed transitions', () => {
    expect(() =>
      assertTransition(PR_TRANSITIONS, 'DRAFT', 'SUBMITTED', PR_STATUS_LABELS),
    ).not.toThrow();
  });

  it('throws a 409 with Indonesian labels otherwise', () => {
    try {
      assertTransition(PR_TRANSITIONS, 'DRAFT', 'APPROVED', PR_STATUS_LABELS);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Status tidak dapat diubah dari "Draft" ke "Disetujui"',
      });
    }
  });
});
