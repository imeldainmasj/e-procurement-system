import type { ApprovalStepStatus, Role } from '../enums.js';

export interface ApproverActor {
  id: string;
  roles: readonly Role[];
  approvalLevel: number | null;
}

export interface StepRef {
  level: number;
  status: ApprovalStepStatus;
  /** Requester of the PR behind the memo. */
  requesterId: string;
}

/**
 * Any active APPROVER whose level matches may decide a PENDING step. SUPER_ADMIN does not
 * bypass this: approving on behalf of a level is a governance decision, not an admin one.
 * Requesters never decide on their own PR (their own level is skipped when the memo is created).
 */
export function canActOnStep(step: StepRef, user: ApproverActor): boolean {
  return (
    step.status === 'PENDING' &&
    user.roles.includes('APPROVER') &&
    user.approvalLevel === step.level &&
    step.requesterId !== user.id
  );
}

/** A requester who is an approver at `level` has that step skipped. */
export function isSelfApprovalLevel(
  requester: { roles: readonly Role[]; approvalLevel: number | null; isActive: boolean },
  level: number,
): boolean {
  return (
    requester.isActive && requester.roles.includes('APPROVER') && requester.approvalLevel === level
  );
}
