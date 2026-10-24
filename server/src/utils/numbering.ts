import type { TxClient } from '../lib/prisma.js';

/**
 * Document numbers (memo, RFQ, LoA, PO, agreement, addendum) come from the original
 * documents and are typed in (CLAUDE.md §5.8). The only generated number is the work code.
 */
export const WORK_CODE_PREFIX = 'WRK';

/**
 * Increments and returns the counter for (prefix, year). The row is locked with
 * SELECT ... FOR UPDATE, so it must run inside the caller's transaction; concurrent
 * callers queue on the lock and never receive the same number.
 */
async function nextSequence(tx: TxClient, prefix: string, year: number): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO document_sequences (id, prefix, year, last_number, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, ${year}, 0, now(), now())
    ON CONFLICT (prefix, year) DO NOTHING`;

  const [row] = await tx.$queryRaw<{ last_number: number }[]>`
    SELECT last_number FROM document_sequences
    WHERE prefix = ${prefix} AND year = ${year}
    FOR UPDATE`;
  const next = (row?.last_number ?? 0) + 1;

  await tx.$executeRaw`
    UPDATE document_sequences SET last_number = ${next}, updated_at = now()
    WHERE prefix = ${prefix} AND year = ${year}`;
  return next;
}

export function formatWorkCode(procurementYear: number, sequence: number): string {
  return `${WORK_CODE_PREFIX}-${procurementYear}-${String(sequence).padStart(4, '0')}`;
}

/** `WRK-{YYYY}-{NNNN}`; YYYY is the procurement year, the counter restarts each year. */
export async function nextWorkCode(tx: TxClient, procurementYear: number): Promise<string> {
  return formatWorkCode(procurementYear, await nextSequence(tx, WORK_CODE_PREFIX, procurementYear));
}
