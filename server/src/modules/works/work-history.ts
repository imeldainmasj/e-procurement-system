import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  EXECUTOR_LABELS,
  MEMO_TYPE_LABELS,
  MILESTONE_STATUS_LABELS,
  PK_RESULT_LABELS,
  PO_TYPE_LABELS,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  PVP_DECISION_LABELS,
  PVP_STATUS_LABELS,
  WORK_STATUS_LABELS,
  milestoneLabel,
  type AuditAction,
  type HistoryChangeDto,
  type MilestoneType,
  type ProcurementMethod,
  type WorkHistoryItemDto,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { pageMeta } from '../../utils/pagination.js';
import { toUpdateDto, updateSelect } from './works.service.js';

type Json = Prisma.JsonValue;
type JsonObject = { [key: string]: Json | undefined };

/** Fields shown in a diff; anything else (ids, timestamps, derived data) is left out. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Judul',
  status: 'Status',
  method: 'Metode',
  procurementType: 'Jenis pengadaan',
  category: 'Kategori',
  procurementYear: 'Tahun pengadaan',
  pic: 'PIC',
  vendor: 'Vendor',
  requesterDirectorate: 'Direktorat peminta',
  sourceAgreement: 'Kontrak sumber',
  amount: 'Nilai',
  currency: 'Mata uang',
  exchangeRate: 'Kurs',
  amountIdr: 'Nilai (IDR)',
  previousPurchaseAmount: 'Nilai tahun sebelumnya',
  increasePercent: 'Kenaikan (%)',
  pvpRequired: 'PVP wajib',
  periodStart: 'Periode mulai',
  periodEnd: 'Periode akhir',
  pkResult: 'Hasil PK',
  executor: 'Pelaksana',
  startedAt: 'Mulai',
  completedAt: 'Selesai',
  referenceNo: 'No. referensi',
  memoNo: 'No. memo',
  memoType: 'Jenis memo',
  memoDate: 'Tanggal memo',
  requesterName: 'Peminta',
  rfqNo: 'No. RFQ',
  termOfPayment: 'Term of payment',
  loaNo: 'No. LoA',
  loaDate: 'Tanggal LoA',
  loaProcessedBy: 'LoA diproses oleh',
  pvpDate: 'Tanggal PVP',
  directorName: 'Direktur',
  decision: 'Keputusan',
  approvalDate: 'Tanggal approval',
  poNo: 'No. PO',
  poType: 'Jenis PO',
  poName: 'Nama PO',
  poDate: 'Tanggal PO',
  previousPoNo: 'No. PO sebelumnya',
  sequence: 'Termin',
  description: 'Keterangan',
  percentage: 'Persentase',
  dueDate: 'Jatuh tempo',
  isPaid: 'Lunas',
  agreementNo: 'No. agreement',
  agreementType: 'Jenis agreement',
  addendumNo: 'No. addendum',
  addendumDate: 'Tanggal addendum',
  newPeriodEnd: 'Periode akhir baru',
  valueChange: 'Perubahan nilai',
  notes: 'Catatan',
  note: 'Catatan',
};

/** Fields holding money or rates, formatted with thousands separators. */
const NUMBER_FIELDS = new Set([
  'amount',
  'amountIdr',
  'exchangeRate',
  'previousPurchaseAmount',
  'increasePercent',
  'percentage',
  'valueChange',
]);

const STATUS_LABELS: Record<string, Record<string, string>> = {
  Work: WORK_STATUS_LABELS,
  WorkMilestone: MILESTONE_STATUS_LABELS,
  PvpForum: PVP_STATUS_LABELS,
  Agreement: AGREEMENT_STATUS_LABELS,
};

const ENUM_LABELS: Record<string, Record<string, string>> = {
  method: PROCUREMENT_METHOD_LABELS,
  procurementType: PROCUREMENT_TYPE_LABELS,
  category: PROJECT_CATEGORY_LABELS,
  pkResult: PK_RESULT_LABELS,
  executor: EXECUTOR_LABELS,
  memoType: MEMO_TYPE_LABELS,
  decision: PVP_DECISION_LABELS,
  poType: PO_TYPE_LABELS,
  agreementType: AGREEMENT_TYPE_LABELS,
};

const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Comparable form: nested refs by name, numeric strings (Decimals) as numbers. */
function normalize(v: Json | undefined): string | number | boolean | null | undefined {
  if (v === undefined || v === null) return v;
  if (isObject(v)) {
    const named = v.name ?? v.agreementNo ?? v.code;
    return typeof named === 'string' ? named : undefined;
  }
  if (Array.isArray(v)) return undefined;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function display(entity: string, field: string, v: ReturnType<typeof normalize>): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  if (typeof v === 'number') {
    return NUMBER_FIELDS.has(field)
      ? v.toLocaleString('id-ID', { maximumFractionDigits: 6 })
      : String(v);
  }
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
    // Date-only columns are stored at UTC midnight; show the calendar date as stored.
    return dayjs.utc(v).format('D MMM YYYY');
  }
  const labels = field === 'status' ? STATUS_LABELS[entity] : ENUM_LABELS[field];
  return labels?.[v] ?? v;
}

/**
 * Field-level differences between two audit snapshots. Snapshots differ in shape (DTOs from
 * the app, raw rows from import, partial `after` for milestones), so only labelled fields
 * present in `after` are compared.
 */
export function diffSnapshots(entity: string, before: Json, after: Json): HistoryChangeDto[] {
  const b = isObject(before) ? before : {};
  const a = isObject(after) ? after : {};
  const changes: HistoryChangeDto[] = [];
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (!(field in a)) continue;
    // A milestone change's note is also written as a progress note, shown on its own.
    if (entity === 'WorkMilestone' && field === 'note') continue;
    const from = normalize(b[field]);
    const to = normalize(a[field]);
    if (from === undefined && !(field in b) && to === null) continue;
    if (from === to || (from == null && to == null)) continue;
    changes.push({
      field,
      label,
      before: display(entity, field, from ?? null),
      after: display(entity, field, to ?? null),
    });
  }
  return changes;
}

/** Fields worth listing for a created or deleted row (no diff to show). */
function summary(entity: string, snapshot: Json): HistoryChangeDto[] {
  if (!isObject(snapshot)) return [];
  const pick = ['status', 'amount', 'currency', 'periodStart', 'periodEnd', 'decision', 'dueDate'];
  return pick
    .filter((f) => snapshot[f] !== undefined && snapshot[f] !== null)
    .map((field) => ({
      field,
      label: FIELD_LABELS[field]!,
      before: null,
      after: display(entity, field, normalize(snapshot[field])),
    }));
}

/** Audited rows that belong to the work, with a short subject (document number, etc.). */
async function relatedRows(workId: string, method: ProcurementMethod) {
  const [milestones, memos, rfq, pvp, pos, agreements, addendums] = await Promise.all([
    prisma.workMilestone.findMany({ where: { workId }, select: { id: true, type: true } }),
    prisma.memo.findMany({ where: { workId }, select: { id: true, memoNo: true } }),
    prisma.rfq.findMany({ where: { workId }, select: { id: true, rfqNo: true } }),
    prisma.pvpForum.findMany({
      where: { workId },
      select: { id: true, approvals: { select: { id: true, directorName: true } } },
    }),
    prisma.purchaseOrder.findMany({ where: { workId }, select: { id: true, poNo: true } }),
    prisma.agreement.findMany({ where: { workId }, select: { id: true, agreementNo: true } }),
    prisma.addendum.findMany({ where: { workId }, select: { id: true, addendumNo: true } }),
  ]);
  const subjects = new Map<string, string | null>([[workId, null]]);
  const ids: Record<string, string[]> = { Work: [workId] };
  const add = (entity: string, id: string, subject: string | null) => {
    (ids[entity] ??= []).push(id);
    subjects.set(id, subject);
  };
  for (const m of milestones)
    add('WorkMilestone', m.id, milestoneLabel(m.type as MilestoneType, method));
  for (const m of memos) add('Memo', m.id, m.memoNo);
  for (const r of rfq) add('Rfq', r.id, r.rfqNo);
  for (const p of pvp) {
    add('PvpForum', p.id, null);
    for (const a of p.approvals) add('PvpApproval', a.id, a.directorName);
  }
  for (const p of pos) add('PurchaseOrder', p.id, p.poNo);
  for (const a of agreements) add('Agreement', a.id, a.agreementNo);
  for (const a of addendums) add('Addendum', a.id, a.addendumNo);
  return { ids, subjects, poNumbers: new Map(pos.map((p) => [p.id, p.poNo])) };
}

/**
 * Progress notes and audit log of the work and all its documents, newest first (§8
 * GET /works/:id/history). Payment terms are hard-deleted, so they are matched by the PO in
 * their snapshot instead of by id.
 */
export async function workHistory(
  workId: string,
  q: { page: number; limit: number },
): Promise<{ data: WorkHistoryItemDto[]; meta: ReturnType<typeof pageMeta> }> {
  const work = await prisma.work.findFirst({
    where: { id: workId, deletedAt: null },
    select: { method: true },
  });
  if (!work) throw AppError.notFound('Pekerjaan tidak ditemukan');

  const { ids, subjects, poNumbers } = await relatedRows(workId, work.method);
  const poIds = [...poNumbers.keys()];
  const termFilters: Prisma.AuditLogWhereInput[] = poIds.flatMap((poId) => [
    { entity: 'PoPaymentTerm', after: { path: ['poId'], equals: poId } },
    { entity: 'PoPaymentTerm', before: { path: ['poId'], equals: poId } },
  ]);

  const [logs, updates] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        OR: [
          ...Object.entries(ids).map(([entity, list]) => ({ entity, entityId: { in: list } })),
          ...termFilters,
        ],
      },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        source: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.workUpdate.findMany({ where: { workId }, select: updateSelect }),
  ]);

  const items: WorkHistoryItemDto[] = [
    ...updates.map((u) => ({
      kind: 'UPDATE' as const,
      id: u.id,
      createdAt: iso(u.createdAt),
      update: toUpdateDto(u),
    })),
    ...logs.map((l) => {
      const action = l.action as AuditAction;
      const snapshot = l.after ?? l.before;
      let subject = subjects.get(l.entityId) ?? null;
      if (l.entity === 'PoPaymentTerm' && isObject(snapshot)) {
        const poNo = typeof snapshot.poId === 'string' ? poNumbers.get(snapshot.poId) : undefined;
        subject = [poNo, snapshot.sequence != null && `termin ${String(snapshot.sequence)}`]
          .filter(Boolean)
          .join(' · ');
      }
      const changes =
        action === 'CREATE' || action === 'DELETE'
          ? summary(l.entity, snapshot)
          : diffSnapshots(l.entity, l.before, l.after);
      return {
        kind: 'AUDIT' as const,
        id: l.id,
        createdAt: iso(l.createdAt),
        user: l.user,
        action,
        source: l.source,
        entity: l.entity,
        subject,
        changes,
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  const start = (q.page - 1) * q.limit;
  return { data: items.slice(start, start + q.limit), meta: pageMeta(q, items.length) };
}
