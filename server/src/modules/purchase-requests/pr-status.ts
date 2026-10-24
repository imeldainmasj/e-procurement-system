import { PR_STATUS_LABELS, PR_TRANSITIONS, type PrStatus } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import type { TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { assertTransition } from '../../utils/stateMachine.js';

/**
 * Moves a PR from `pr.status` to `to` inside `tx`. The row is only updated if its status
 * is still the validated one (guards against concurrent changes); writes the audit entry.
 * Kept separate from the PR service so the approval workflow can use it without a cycle.
 */
export async function transitionPr(
  tx: TxClient,
  pr: { id: string; status: PrStatus },
  to: PrStatus,
  actor: Actor,
  data: Prisma.PurchaseRequestUncheckedUpdateManyInput = {},
  note: string | null = null,
): Promise<void> {
  assertTransition(PR_TRANSITIONS, pr.status, to, PR_STATUS_LABELS);
  const { count } = await tx.purchaseRequest.updateMany({
    where: { id: pr.id, status: pr.status },
    data: { ...data, status: to },
  });
  if (count === 0) {
    throw new AppError(
      409,
      'CONCURRENT_UPDATE',
      'Pengajuan telah diubah oleh pengguna lain. Muat ulang halaman.',
    );
  }
  const { number } = await tx.purchaseRequest.findUniqueOrThrow({
    where: { id: pr.id },
    select: { number: true },
  });
  await writeAuditLog(tx, {
    actor,
    action: 'STATUS_CHANGE',
    entity: 'PurchaseRequest',
    entityId: pr.id,
    before: { status: pr.status },
    after: { status: to, number, note },
  });
}
