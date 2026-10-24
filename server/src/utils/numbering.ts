import { dayjs } from '../lib/dayjs.js';
import type { TxClient } from '../lib/prisma.js';

export const DOCUMENT_PREFIX = {
  PURCHASE_REQUEST: 'PR-IT',
  MEMO: 'MEMO-IT',
  PURCHASE_ORDER: 'PO-IT',
  GOODS_RECEIPT: 'GR-IT',
  CONTRACT: 'KTR-IT',
  ASSET: 'AST-IT',
} as const;
export type DocumentPrefix = (typeof DOCUMENT_PREFIX)[keyof typeof DOCUMENT_PREFIX];

/** Sequences that never reset are stored under year 0. */
const NO_RESET_YEAR = 0;

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

export function formatDocumentNumber(prefix: string, date: Date, sequence: number): string {
  const d = dayjs(date).tz();
  return `${prefix}/${d.format('YYYY')}/${d.format('MM')}/${String(sequence).padStart(4, '0')}`;
}

/** `{PREFIX}/{YYYY}/{MM}/{NNNN}`, counter resets every year (Asia/Jakarta). */
export async function nextDocumentNumber(
  tx: TxClient,
  prefix: Exclude<DocumentPrefix, 'AST-IT'>,
  date: Date = new Date(),
): Promise<string> {
  const year = dayjs(date).tz().year();
  return formatDocumentNumber(prefix, date, await nextSequence(tx, prefix, year));
}

/** `AST-IT-000123`, never resets. */
export async function nextAssetTag(tx: TxClient): Promise<string> {
  const seq = await nextSequence(tx, DOCUMENT_PREFIX.ASSET, NO_RESET_YEAR);
  return `${DOCUMENT_PREFIX.ASSET}-${String(seq).padStart(6, '0')}`;
}
