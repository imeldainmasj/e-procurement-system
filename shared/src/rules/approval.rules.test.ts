import { describe, expect, it } from 'vitest';
import { canActOnStep, isSelfApprovalLevel } from './approval.rules.js';

const step = { level: 2, status: 'PENDING' as const, requesterId: 'req' };
const finance = { id: 'fin', roles: ['APPROVER' as const], approvalLevel: 2 };

describe('canActOnStep', () => {
  it('allows an approver of the same level on a pending step', () => {
    expect(canActOnStep(step, finance)).toBe(true);
  });

  it('rejects other levels, non-pending steps, admins and the requester', () => {
    expect(canActOnStep(step, { ...finance, approvalLevel: 1 })).toBe(false);
    expect(canActOnStep({ ...step, status: 'WAITING' }, finance)).toBe(false);
    expect(canActOnStep(step, { id: 'adm', roles: ['SUPER_ADMIN'], approvalLevel: null })).toBe(
      false,
    );
    expect(canActOnStep({ ...step, requesterId: 'fin' }, finance)).toBe(false);
  });
});

describe('isSelfApprovalLevel', () => {
  it('matches an active approver at that level only', () => {
    const manager = {
      roles: ['APPROVER' as const, 'REQUESTER' as const],
      approvalLevel: 1,
      isActive: true,
    };
    expect(isSelfApprovalLevel(manager, 1)).toBe(true);
    expect(isSelfApprovalLevel(manager, 2)).toBe(false);
    expect(isSelfApprovalLevel({ ...manager, roles: ['REQUESTER'] }, 1)).toBe(false);
  });
});
