import type {
  AgreementType,
  MemoType,
  MilestoneStatus,
  MilestoneType,
  PkResult,
  PoType,
  ProcurementMethod,
  ProcurementType,
  ProjectCategory,
  PvpDecision,
  PvpStatus,
  RfqMethod,
  SettingsDto,
  WorkStatus,
} from '@sipita/shared';
import { memoMilestone, PROCUREMENT_METHOD_LABELS } from '@sipita/shared';
import { prisma } from '../../lib/prisma.js';
import { amountInIdr, num } from '../../utils/money.js';
import {
  computeIncreasePercent,
  documentCompletions,
  DOCUMENT_MILESTONES,
  getDataIssues,
  isPvpRequired,
  type DocumentSnapshot,
} from '../../utils/procurementRules.js';
import { loadSnapshot } from '../works/work-state.js';
import type { Issue, ParsedRow, ParsedWorkbook } from './import.parse.js';

/**
 * Turns parsed rows into a write plan (CLAUDE.md §7): references are resolved by business
 * key, document numbers are upserted, structural problems become ERRORs (row rejected) and
 * business-rule gaps become WARNINGs (row kept, work marked incomplete).
 */

// ─── Plan types ──────────────────────────────────────────────────────────────

export interface WorkRef {
  /** "plan:<Ref Baris>" for works from this file, "db:<id>" for existing ones. */
  key: string;
  existingId: string | null;
  planRef: string | null;
  method: ProcurementMethod;
  pkResult: PkResult | null;
  milestoneTypes: MilestoneType[];
  /** Row the work's warnings are attached to. */
  anchor: ParsedRow;
}

interface Money {
  amount: number;
  currency: string;
  exchangeRate: number;
}

export interface PlanVendor {
  row: ParsedRow;
  existingId: string | null;
  data: {
    code: string;
    name: string;
    address: string;
    picName: string;
    npwp: string | null;
    email: string | null;
    phone: string | null;
  };
}

export interface PlanWork {
  row: ParsedRow;
  ref: WorkRef;
  data: Money & {
    title: string;
    procurementType: ProcurementType;
    category: ProjectCategory;
    method: ProcurementMethod;
    procurementYear: number;
    picId: string;
    requesterDirectorateId: string | null;
    vendorCode: string | null;
    previousPurchaseAmount: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    sourceAgreementNo: string | null;
    pkResult: PkResult | null;
    status: WorkStatus;
    notes: string | null;
  };
}

interface PlanDoc<T> {
  row: ParsedRow;
  work: WorkRef;
  existingId: string | null;
  data: T;
}

export interface Plan {
  vendors: PlanVendor[];
  works: PlanWork[];
  memos: PlanDoc<{
    memoNo: string;
    memoType: MemoType;
    title: string;
    memoDate: string;
    requesterName: string;
    money: Money | null;
    notes: string | null;
  }>[];
  rfqs: PlanDoc<
    Money & {
      rfqNo: string;
      method: RfqMethod;
      periodStart: string;
      periodEnd: string;
      termOfPayment: string | null;
      loaNo: string | null;
      loaDate: string | null;
      loaProcessedBy: string | null;
    }
  >[];
  pvps: PlanDoc<{ pvpDate: string; status: PvpStatus; notes: string | null }>[];
  approvals: PlanDoc<{
    directorName: string;
    decision: PvpDecision;
    approvalDate: string;
    notes: string | null;
  }>[];
  officials: PlanDoc<{
    referenceNo: string | null;
    approvalDate: string | null;
    notes: string;
  }>[];
  pos: PlanDoc<
    Money & {
      poNo: string;
      poType: PoType;
      poName: string;
      poDate: string;
      requesterName: string | null;
      previousPoNo: string | null;
      previousPoAmount: number | null;
      previousPoCurrency: string | null;
    }
  >[];
  terms: {
    row: ParsedRow;
    poNo: string;
    existingId: string | null;
    data: {
      sequence: number;
      description: string;
      percentage: number;
      dueDate: string | null;
      isPaid: boolean;
    };
  }[];
  agreements: PlanDoc<
    Money & {
      agreementNo: string;
      agreementType: AgreementType;
      title: string;
      vendorCode: string;
      poNo: string;
      picId: string;
      periodStart: string;
      periodEnd: string;
    }
  >[];
  addendums: PlanDoc<{
    agreementNo: string;
    addendumNo: string;
    title: string;
    addendumDate: string;
    newPeriodEnd: string | null;
    valueChange: number | null;
    currency: string | null;
    poNo: string | null;
    notes: string | null;
  }>[];
}

export interface PlanResult {
  plan: Plan;
  issues: Issue[];
  counts: { totalRows: number; validRows: number; warningRows: number; errorRows: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const str = (r: ParsedRow, k: string) => (r.values[k] as string | null) ?? null;
const numOf = (r: ParsedRow, k: string) => (r.values[k] as number | null) ?? null;
const live = { deletedAt: null };

function moneyOf(r: ParsedRow, amountKey = 'amount'): Money | null {
  const amount = numOf(r, amountKey);
  if (amount === null) return null;
  const currency = str(r, 'currency') ?? 'IDR';
  return {
    amount,
    currency,
    exchangeRate: currency === 'IDR' ? 1 : (numOf(r, 'exchangeRate') ?? 1),
  };
}

class Collector {
  issues: Issue[];
  constructor(initial: Issue[]) {
    this.issues = [...initial];
  }
  private add(level: Issue['level'], row: ParsedRow, field: string | null, message: string) {
    this.issues.push({ sheet: row.sheet, rowNumber: row.rowNumber, level, field, message });
  }
  error(row: ParsedRow, field: string | null, message: string) {
    this.add('ERROR', row, field, message);
  }
  warn(row: ParsedRow, field: string | null, message: string) {
    this.add('WARNING', row, field, message);
  }
  hasError(row: ParsedRow) {
    return this.issues.some(
      (i) => i.level === 'ERROR' && i.sheet === row.sheet && i.rowNumber === row.rowNumber,
    );
  }
}

/** Keeps the first row per key; later duplicates in the same file are rejected. */
function firstOnce(c: Collector, label: string) {
  const seen = new Map<string, number>();
  return (row: ParsedRow, key: string, field: string): boolean => {
    const prev = seen.get(key.toLowerCase());
    if (prev !== undefined) {
      c.error(row, field, `${label} ${key} ganda di file ini (baris ${prev})`);
      return false;
    }
    seen.set(key.toLowerCase(), row.rowNumber);
    return true;
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export async function buildPlan(
  parsed: ParsedWorkbook,
  settings: SettingsDto,
): Promise<PlanResult> {
  const c = new Collector(parsed.issues);
  const rows = parsed.rows;
  const valid = (list: ParsedRow[]) => list.filter((r) => !c.hasError(r));
  const plan: Plan = {
    vendors: [],
    works: [],
    memos: [],
    rfqs: [],
    pvps: [],
    approvals: [],
    officials: [],
    pos: [],
    terms: [],
    agreements: [],
    addendums: [],
  };

  // Lookups for every business key used in the file (soft-deleted rows included, so a
  // rolled-back import can be re-imported: those rows are revived).
  const values = (sheet: keyof typeof rows, key: string) => [
    ...new Set(rows[sheet].map((r) => str(r, key)).filter((v): v is string => v !== null)),
  ];
  const usernames = [...values('Pekerjaan', 'pic'), ...values('Agreement', 'pic')].map((u) =>
    u.toLowerCase(),
  );
  const [users, vendorsDb, directorates, templates] = await Promise.all([
    prisma.user.findMany({
      where: { username: { in: usernames }, ...live },
      select: { id: true, username: true },
    }),
    prisma.vendor.findMany({
      where: {
        code: {
          in: [
            ...values('Vendor', 'code'),
            ...values('Pekerjaan', 'vendor'),
            ...values('Agreement', 'vendor'),
          ],
        },
      },
      select: { id: true, code: true, deletedAt: true },
    }),
    prisma.directorate.findMany({
      where: { code: { in: values('Pekerjaan', 'directorate') }, ...live },
      select: { id: true, code: true },
    }),
    prisma.milestoneTemplate.findMany({
      where: { isActive: true },
      select: { method: true, type: true },
    }),
  ]);
  const userId = new Map(users.map((u) => [u.username, u.id]));
  const vendorDb = new Map(vendorsDb.map((v) => [v.code, v]));
  const directorateId = new Map(directorates.map((d) => [d.code, d.id]));
  const templateTypes = (method: ProcurementMethod) =>
    templates.filter((t) => t.method === method).map((t) => t.type);

  // ── Vendors ──
  const vendorOnce = firstOnce(c, 'Kode vendor');
  for (const row of valid(rows.Vendor)) {
    const code = str(row, 'code')!;
    if (!vendorOnce(row, code, 'Kode Vendor')) continue;
    const npwp = str(row, 'npwp')?.replace(/[.\-\s]/g, '') ?? null;
    if (npwp && !/^\d{15,16}$/.test(npwp)) {
      c.error(row, 'NPWP', 'NPWP harus 15 atau 16 digit angka');
      continue;
    }
    plan.vendors.push({
      row,
      existingId: vendorDb.get(code)?.id ?? null,
      data: {
        code,
        name: str(row, 'name')!,
        address: str(row, 'address')!,
        picName: str(row, 'picName')!,
        npwp,
        email: str(row, 'email')?.toLowerCase() ?? null,
        phone: str(row, 'phone'),
      },
    });
  }
  const vendorKnown = (code: string) =>
    plan.vendors.some((v) => v.data.code === code) ||
    (vendorDb.has(code) && !vendorDb.get(code)!.deletedAt);

  // ── Works ──
  const refsInFile = new Map(rows.Pekerjaan.map((r) => [str(r, 'ref')?.toLowerCase(), r]));
  const codesToLoad = new Set<string>(values('Pekerjaan', 'code'));
  for (const sheet of [
    'Memo',
    'RFQ',
    'PVP',
    'PVP_Approval',
    'Approval_Pejabat',
    'PO',
    'Agreement',
    'Addendum',
  ] as const) {
    for (const ref of values(sheet, 'workRef'))
      if (!refsInFile.has(ref.toLowerCase())) codesToLoad.add(ref.toUpperCase());
  }
  const worksDb = await prisma.work.findMany({
    where: { code: { in: [...codesToLoad] }, ...live },
    select: {
      id: true,
      code: true,
      method: true,
      pkResult: true,
      milestones: { select: { type: true } },
    },
  });
  const workByCode = new Map(worksDb.map((w) => [w.code, w]));
  const agreementNosInFile = new Set(
    valid(rows.Agreement).map((r) => str(r, 'agreementNo')!.toLowerCase()),
  );
  const sourceNos = values('Pekerjaan', 'sourceAgreementNo');
  const sourceAgreementsDb = new Set(
    (
      await prisma.agreement.findMany({
        where: { agreementNo: { in: sourceNos }, ...live },
        select: { agreementNo: true },
      })
    ).map((a) => a.agreementNo.toLowerCase()),
  );

  const refOnce = firstOnce(c, 'Ref Baris');
  const codeOnce = firstOnce(c, 'Kode Pekerjaan');
  const planWorks = new Map<string, WorkRef>();
  for (const row of valid(rows.Pekerjaan)) {
    const ref = str(row, 'ref')!;
    if (!refOnce(row, ref, 'Ref Baris')) continue;
    const code = str(row, 'code');
    const method = str(row, 'method') as ProcurementMethod;
    let existing: (typeof worksDb)[number] | undefined;
    if (code) {
      if (!codeOnce(row, code, 'Kode Pekerjaan')) continue;
      existing = workByCode.get(code);
      if (!existing) {
        c.error(row, 'Kode Pekerjaan', `Pekerjaan ${code} tidak ditemukan di sistem`);
        continue;
      }
      if (existing.method !== method) {
        c.error(
          row,
          'Metode Pengadaan',
          'Metode pekerjaan yang sudah ada tidak dapat diubah lewat import',
        );
        continue;
      }
    }
    const pic = userId.get(str(row, 'pic')!.toLowerCase());
    if (!pic) c.error(row, 'PIC (Username)', `Username ${str(row, 'pic')} tidak ditemukan`);
    const dirCode = str(row, 'directorate');
    if (dirCode && !directorateId.has(dirCode))
      c.error(row, 'Direktorat Peminta', `Direktorat ${dirCode} tidak ditemukan`);
    const vendorCode = str(row, 'vendor');
    if (vendorCode && !vendorKnown(vendorCode))
      c.error(row, 'Kode Vendor', `Vendor ${vendorCode} tidak ditemukan`);
    const start = str(row, 'periodStart');
    const end = str(row, 'periodEnd');
    if (start && end && end < start)
      c.error(row, 'Periode Selesai', 'Periode selesai sebelum periode mulai');
    const source = str(row, 'sourceAgreementNo');
    if (
      source &&
      !agreementNosInFile.has(source.toLowerCase()) &&
      !sourceAgreementsDb.has(source.toLowerCase())
    ) {
      c.error(row, 'No. Agreement Sumber (PK)', `Agreement ${source} tidak ditemukan`);
    }
    if (method !== 'SPECIAL_EXTENSION' && (source || str(row, 'pkResult'))) {
      c.warn(row, 'Hasil PK', 'Kolom PK diabaikan karena metode bukan Perpanjangan Khusus');
    }
    if (c.hasError(row)) continue;

    const isPk = method === 'SPECIAL_EXTENSION';
    const workRef: WorkRef = {
      key: existing ? `db:${existing.id}` : `plan:${ref.toLowerCase()}`,
      existingId: existing?.id ?? null,
      planRef: ref,
      method,
      pkResult: isPk ? (str(row, 'pkResult') as PkResult | null) : null,
      milestoneTypes: existing ? existing.milestones.map((m) => m.type) : templateTypes(method),
      anchor: row,
    };
    planWorks.set(ref.toLowerCase(), workRef);
    plan.works.push({
      row,
      ref: workRef,
      data: {
        ...moneyOf(row)!,
        title: str(row, 'title')!,
        procurementType: str(row, 'procurementType') as ProcurementType,
        category: str(row, 'category') as ProjectCategory,
        method,
        procurementYear: numOf(row, 'procurementYear')!,
        picId: pic!,
        requesterDirectorateId: dirCode ? directorateId.get(dirCode)! : null,
        vendorCode,
        previousPurchaseAmount: numOf(row, 'previousPurchaseAmount'),
        periodStart: start,
        periodEnd: end,
        sourceAgreementNo: isPk ? source : null,
        pkResult: workRef.pkResult,
        status: str(row, 'status') as WorkStatus,
        notes: str(row, 'notes'),
      },
    });
  }

  /** Ref Pekerjaan → a work of this file or an existing one (by code). */
  const existingRefs = new Map<string, WorkRef>();
  function resolveWork(row: ParsedRow, field = 'Ref Pekerjaan'): WorkRef | null {
    const ref = str(row, 'workRef')!;
    const inPlan = planWorks.get(ref.toLowerCase());
    if (inPlan) return inPlan;
    if (refsInFile.has(ref.toLowerCase())) {
      c.error(row, field, `Pekerjaan ${ref} ditolak (lihat error di sheet Pekerjaan)`);
      return null;
    }
    const db = workByCode.get(ref.toUpperCase());
    if (!db) {
      c.error(row, field, `Pekerjaan ${ref} tidak ditemukan di file maupun di sistem`);
      return null;
    }
    let wr = existingRefs.get(db.id);
    if (!wr) {
      wr = {
        key: `db:${db.id}`,
        existingId: db.id,
        planRef: null,
        method: db.method,
        pkResult: db.pkResult,
        milestoneTypes: db.milestones.map((m) => m.type),
        anchor: row,
      };
      existingRefs.set(db.id, wr);
    }
    return wr;
  }
  const requireMilestone = (row: ParsedRow, work: WorkRef, type: MilestoneType, what: string) => {
    if (work.milestoneTypes.includes(type)) return true;
    c.error(
      row,
      'Ref Pekerjaan',
      `${what} tidak dipakai pada metode ${PROCUREMENT_METHOD_LABELS[work.method]}`,
    );
    return false;
  };
  /** Upsert by number: same work → update; other work → rejected; soft-deleted → revived. */
  const ownedBy = (
    row: ParsedRow,
    field: string,
    label: string,
    existing: { id: string; workId: string; deletedAt: Date | null } | undefined,
    work: WorkRef,
  ): string | null | false => {
    if (!existing) return null;
    if (existing.deletedAt || existing.workId === work.existingId) return existing.id;
    c.error(row, field, `${label} sudah tercatat pada pekerjaan lain`);
    return false;
  };

  // Existing documents by number.
  const [memosDb, rfqsDb, posDb, agreementsDb, addendumsDb] = await Promise.all([
    prisma.memo.findMany({
      where: { memoNo: { in: values('Memo', 'memoNo') } },
      select: { id: true, memoNo: true, workId: true, deletedAt: true },
    }),
    prisma.rfq.findMany({
      where: {
        OR: [
          { rfqNo: { in: values('RFQ', 'rfqNo') } },
          { loaNo: { in: values('RFQ', 'loaNo') } },
          { workId: { in: worksDb.map((w) => w.id) } },
        ],
      },
      select: { id: true, rfqNo: true, loaNo: true, workId: true, deletedAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        poNo: {
          in: [
            ...values('PO', 'poNo'),
            ...values('PO_TOP', 'poNo'),
            ...values('Agreement', 'poNo'),
            ...values('Addendum', 'poNo'),
          ],
        },
      },
      select: {
        id: true,
        poNo: true,
        workId: true,
        deletedAt: true,
        agreement: { select: { agreementNo: true } },
      },
    }),
    prisma.agreement.findMany({
      where: {
        agreementNo: {
          in: [...values('Agreement', 'agreementNo'), ...values('Addendum', 'agreementNo')],
        },
      },
      select: { id: true, agreementNo: true, workId: true, deletedAt: true },
    }),
    prisma.addendum.findMany({
      where: { addendumNo: { in: values('Addendum', 'addendumNo') } },
      select: { id: true, addendumNo: true, workId: true, deletedAt: true },
    }),
  ]);
  const byKey = <T>(list: T[], key: (t: T) => string) =>
    new Map(list.map((x) => [key(x).toLowerCase(), x]));
  const memoByNo = byKey(memosDb, (m) => m.memoNo);
  const poByNo = byKey(posDb, (p) => p.poNo);
  const agreementByNo = byKey(agreementsDb, (a) => a.agreementNo);
  const addendumByNo = byKey(addendumsDb, (a) => a.addendumNo);

  // ── Memo ──
  const memoOnce = firstOnce(c, 'No. memo');
  for (const row of valid(rows.Memo)) {
    const work = resolveWork(row);
    if (!work) continue;
    const memoNo = str(row, 'memoNo')!;
    const memoType = str(row, 'memoType') as MemoType;
    const milestone = memoMilestone(memoType, work.method);
    if (!milestone) {
      c.error(
        row,
        'Jenis Memo',
        `Jenis memo tidak sesuai metode ${PROCUREMENT_METHOD_LABELS[work.method]}`,
      );
      continue;
    }
    if (!requireMilestone(row, work, milestone, 'Memo ini') || !memoOnce(row, memoNo, 'No. Memo'))
      continue;
    const existingId = ownedBy(
      row,
      'No. Memo',
      `No. memo ${memoNo}`,
      memoByNo.get(memoNo.toLowerCase()),
      work,
    );
    if (existingId === false) continue;
    plan.memos.push({
      row,
      work,
      existingId,
      data: {
        memoNo,
        memoType,
        title: str(row, 'title')!,
        memoDate: str(row, 'memoDate')!,
        requesterName: str(row, 'requesterName')!,
        money: moneyOf(row),
        notes: str(row, 'notes'),
      },
    });
  }

  // ── RFQ & LoA ──
  const rfqOnce = firstOnce(c, 'No. RFQ');
  const loaOnce = firstOnce(c, 'No. LoA');
  const rfqWorkOnce = firstOnce(c, 'RFQ untuk pekerjaan');
  const workRow = (work: WorkRef) => plan.works.find((w) => w.ref === work);
  for (const row of valid(rows.RFQ)) {
    const work = resolveWork(row);
    if (!work || !requireMilestone(row, work, 'RFQ', 'RFQ')) continue;
    if (!rfqWorkOnce(row, work.key, 'Ref Pekerjaan')) continue;
    const rfqNo = str(row, 'rfqNo')!;
    const loaNo = str(row, 'loaNo');
    const loaDate = str(row, 'loaDate');
    if (!rfqOnce(row, rfqNo, 'No. RFQ') || (loaNo && !loaOnce(row, loaNo, 'No. LoA'))) continue;
    if (!loaNo !== !loaDate) {
      c.error(row, 'Tanggal LoA', 'No. LoA dan Tanggal LoA diisi bersamaan');
      continue;
    }
    // One RFQ per work: an existing RFQ of the work is updated even under a new number.
    const sameWork = rfqsDb.find((r) => r.workId === work.existingId);
    const clash = rfqsDb.find(
      (r) =>
        r.workId !== work.existingId &&
        !r.deletedAt &&
        (r.rfqNo.toLowerCase() === rfqNo.toLowerCase() ||
          (loaNo && r.loaNo?.toLowerCase() === loaNo.toLowerCase())),
    );
    if (clash) {
      c.error(row, 'No. RFQ', `No. RFQ/LoA sudah tercatat pada pekerjaan lain`);
      continue;
    }
    const revived = rfqsDb.find(
      (r) => r.deletedAt && r.rfqNo.toLowerCase() === rfqNo.toLowerCase(),
    );
    const w = workRow(work)?.data;
    const periodStart = str(row, 'periodStart') ?? w?.periodStart ?? null;
    const periodEnd = str(row, 'periodEnd') ?? w?.periodEnd ?? null;
    if (!periodStart || !periodEnd) {
      c.error(
        row,
        'Periode Mulai',
        'Periode RFQ wajib diisi (atau isi periode di sheet Pekerjaan)',
      );
      continue;
    }
    const money =
      moneyOf(row) ??
      (w ? { amount: w.amount, currency: w.currency, exchangeRate: w.exchangeRate } : null);
    if (!money) {
      c.error(row, 'Nilai', 'Nilai RFQ wajib diisi untuk pekerjaan yang sudah ada');
      continue;
    }
    plan.rfqs.push({
      row,
      work,
      existingId: sameWork?.id ?? revived?.id ?? null,
      data: {
        ...money,
        rfqNo,
        method: str(row, 'method') as RfqMethod,
        periodStart,
        periodEnd,
        termOfPayment: str(row, 'termOfPayment'),
        loaNo,
        loaDate,
        loaProcessedBy: str(row, 'loaProcessedBy'),
      },
    });
  }

  // ── PVP + approvals ──
  const pvpWorkOnce = firstOnce(c, 'PVP untuk pekerjaan');
  const forumsDb = await prisma.pvpForum.findMany({
    where: { workId: { in: worksDb.map((w) => w.id) } },
    select: {
      id: true,
      workId: true,
      approvals: { where: live, select: { id: true, directorName: true } },
    },
  });
  for (const row of valid(rows.PVP)) {
    const work = resolveWork(row);
    if (
      !work ||
      !requireMilestone(row, work, 'PVP', 'PVP Forum') ||
      !pvpWorkOnce(row, work.key, 'Ref Pekerjaan')
    )
      continue;
    plan.pvps.push({
      row,
      work,
      existingId: forumsDb.find((f) => f.workId === work.existingId)?.id ?? null,
      data: {
        pvpDate: str(row, 'pvpDate')!,
        status: str(row, 'status') as PvpStatus,
        notes: str(row, 'notes'),
      },
    });
  }
  const approvalOnce = firstOnce(c, 'Approval direktur');
  for (const row of valid(rows.PVP_Approval)) {
    const work = resolveWork(row);
    if (!work) continue;
    const forum = forumsDb.find((f) => f.workId === work.existingId);
    if (!plan.pvps.some((p) => p.work === work) && !forum) {
      c.error(row, 'Ref Pekerjaan', 'Data PVP untuk pekerjaan ini tidak ada (isi sheet PVP)');
      continue;
    }
    const director = str(row, 'directorName')!;
    if (!approvalOnce(row, `${work.key}/${director}`, 'Nama Direktur')) continue;
    plan.approvals.push({
      row,
      work,
      existingId:
        forum?.approvals.find((a) => a.directorName.toLowerCase() === director.toLowerCase())?.id ??
        null,
      data: {
        directorName: director,
        decision: str(row, 'decision') as PvpDecision,
        approvalDate: str(row, 'approvalDate')!,
        notes: str(row, 'notes'),
      },
    });
  }

  // ── Official approval (milestone, no document table) ──
  const officialOnce = firstOnce(c, 'Approval pejabat untuk pekerjaan');
  for (const row of valid(rows.Approval_Pejabat)) {
    const work = resolveWork(row);
    if (!work || !requireMilestone(row, work, 'OFFICIAL_APPROVAL', 'Approval pejabat')) continue;
    if (!officialOnce(row, work.key, 'Ref Pekerjaan')) continue;
    const position = str(row, 'position');
    const extra = str(row, 'notes');
    plan.officials.push({
      row,
      work,
      existingId: null,
      data: {
        referenceNo: str(row, 'referenceNo'),
        approvalDate: str(row, 'approvalDate'),
        notes: [`${str(row, 'officialName')}${position ? ` — ${position}` : ''}`, extra]
          .filter(Boolean)
          .join('. '),
      },
    });
  }

  // ── PO ──
  const poOnce = firstOnce(c, 'No. PO');
  for (const row of valid(rows.PO)) {
    const work = resolveWork(row);
    if (!work || !requireMilestone(row, work, 'PO', 'PO')) continue;
    const poNo = str(row, 'poNo')!;
    if (!poOnce(row, poNo, 'No. PO')) continue;
    const existingId = ownedBy(
      row,
      'No. PO',
      `No. PO ${poNo}`,
      poByNo.get(poNo.toLowerCase()),
      work,
    );
    if (existingId === false) continue;
    if (str(row, 'poType') === 'RENEWAL' && !str(row, 'previousPoNo')) {
      c.warn(row, 'No. PO Sebelumnya', 'PO Renewal tanpa data PO sebelumnya');
    }
    plan.pos.push({
      row,
      work,
      existingId,
      data: {
        ...moneyOf(row)!,
        poNo,
        poType: str(row, 'poType') as PoType,
        poName: str(row, 'poName')!,
        poDate: str(row, 'poDate')!,
        requesterName: str(row, 'requesterName'),
        previousPoNo: str(row, 'previousPoNo'),
        previousPoAmount: numOf(row, 'previousPoAmount'),
        previousPoCurrency: str(row, 'previousPoCurrency'),
      },
    });
  }
  /** A PO of this file or of the system: the key of its work and its agreement, if any. */
  const resolvePo = (poNo: string) => {
    const planned = plan.pos.find((p) => p.data.poNo.toLowerCase() === poNo.toLowerCase());
    if (planned) return { workKey: planned.work.key, agreementNo: null as string | null };
    const db = poByNo.get(poNo.toLowerCase());
    if (!db || db.deletedAt) return null;
    return { workKey: `db:${db.workId}`, agreementNo: db.agreement?.agreementNo ?? null };
  };

  // ── Term of payment ──
  const termOnce = firstOnce(c, 'Termin');
  const termsDb = await prisma.poPaymentTerm.findMany({
    where: { purchaseOrder: { poNo: { in: values('PO_TOP', 'poNo') } } },
    select: { id: true, sequence: true, purchaseOrder: { select: { poNo: true } } },
  });
  for (const row of valid(rows.PO_TOP)) {
    const poNo = str(row, 'poNo')!;
    const po = resolvePo(poNo);
    if (!po) {
      c.error(row, 'No. PO', `PO ${poNo} tidak ditemukan di file maupun di sistem`);
      continue;
    }
    const sequence = numOf(row, 'sequence')!;
    const percentage = numOf(row, 'percentage');
    if (percentage === null) {
      c.error(
        row,
        'Persentase',
        'Persentase wajib diisi (nilai termin dihitung dari persentase × nilai PO)',
      );
      continue;
    }
    if (!termOnce(row, `${poNo}/${sequence}`, 'Urutan')) continue;
    plan.terms.push({
      row,
      poNo,
      existingId:
        termsDb.find(
          (t) =>
            t.sequence === sequence && t.purchaseOrder.poNo.toLowerCase() === poNo.toLowerCase(),
        )?.id ?? null,
      data: {
        sequence,
        description: str(row, 'description')!,
        percentage,
        dueDate: str(row, 'dueDate'),
        isPaid: (row.values['isPaid'] as boolean | null) ?? false,
      },
    });
  }

  // ── Agreement ──
  const agreementOnce = firstOnce(c, 'No. agreement');
  const agreementPoOnce = firstOnce(c, 'PO untuk agreement');
  for (const row of valid(rows.Agreement)) {
    const work = resolveWork(row);
    if (!work) continue;
    const finalType: MilestoneType =
      work.method === 'SPECIAL_EXTENSION' ? 'AGREEMENT_OR_ADDENDUM' : 'AGREEMENT';
    if (!requireMilestone(row, work, finalType, 'Agreement')) continue;
    const agreementNo = str(row, 'agreementNo')!;
    if (!agreementOnce(row, agreementNo, 'No. Agreement')) continue;
    const existingId = ownedBy(
      row,
      'No. Agreement',
      `No. agreement ${agreementNo}`,
      agreementByNo.get(agreementNo.toLowerCase()),
      work,
    );
    if (existingId === false) continue;
    const vendorCode = str(row, 'vendor')!;
    if (!vendorKnown(vendorCode))
      c.error(row, 'Kode Vendor', `Vendor ${vendorCode} tidak ditemukan`);
    const poNo = str(row, 'poNo')!;
    const po = resolvePo(poNo);
    if (!po || po.workKey !== work.key)
      c.error(row, 'No. PO', `PO ${poNo} tidak ditemukan pada pekerjaan ini`);
    else if (po.agreementNo && po.agreementNo.toLowerCase() !== agreementNo.toLowerCase()) {
      c.error(row, 'No. PO', `PO ${poNo} sudah dipakai agreement ${po.agreementNo}`);
    } else agreementPoOnce(row, poNo, 'No. PO');
    const pic = userId.get(str(row, 'pic')!.toLowerCase());
    if (!pic) c.error(row, 'PIC (Username)', `Username ${str(row, 'pic')} tidak ditemukan`);
    const start = str(row, 'periodStart')!;
    const end = str(row, 'periodEnd')!;
    if (end < start) c.error(row, 'Periode Selesai', 'Periode selesai sebelum periode mulai');
    if (c.hasError(row)) continue;
    plan.agreements.push({
      row,
      work,
      existingId,
      data: {
        ...moneyOf(row)!,
        agreementNo,
        agreementType: str(row, 'agreementType') as AgreementType,
        title: str(row, 'title')!,
        vendorCode,
        poNo,
        picId: pic!,
        periodStart: start,
        periodEnd: end,
      },
    });
  }

  // ── Addendum ──
  const addendumOnce = firstOnce(c, 'No. addendum');
  for (const row of valid(rows.Addendum)) {
    const work = resolveWork(row);
    if (!work) continue;
    if (work.method !== 'SPECIAL_EXTENSION') {
      c.error(row, 'Ref Pekerjaan', 'Addendum hanya dari pekerjaan Perpanjangan Khusus');
      continue;
    }
    const agreementNo = str(row, 'agreementNo')!;
    const known =
      plan.agreements.some((a) => a.data.agreementNo.toLowerCase() === agreementNo.toLowerCase()) ||
      (agreementByNo.has(agreementNo.toLowerCase()) &&
        !agreementByNo.get(agreementNo.toLowerCase())!.deletedAt);
    if (!known) {
      c.error(row, 'No. Agreement', `Agreement ${agreementNo} tidak ditemukan`);
      continue;
    }
    const addendumNo = str(row, 'addendumNo')!;
    if (!addendumOnce(row, addendumNo, 'No. Addendum')) continue;
    const existingId = ownedBy(
      row,
      'No. Addendum',
      `No. addendum ${addendumNo}`,
      addendumByNo.get(addendumNo.toLowerCase()),
      work,
    );
    if (existingId === false) continue;
    const poNo = str(row, 'poNo');
    if (poNo) {
      const po = resolvePo(poNo);
      if (!po || po.workKey !== work.key) {
        c.error(row, 'No. PO Terkait', `PO ${poNo} tidak ditemukan pada pekerjaan ini`);
        continue;
      }
    }
    const valueChange = numOf(row, 'valueChange');
    plan.addendums.push({
      row,
      work,
      existingId,
      data: {
        agreementNo,
        addendumNo,
        title: str(row, 'title')!,
        addendumDate: str(row, 'addendumDate')!,
        newPeriodEnd: str(row, 'newPeriodEnd'),
        valueChange,
        currency: valueChange === null ? null : (str(row, 'currency') ?? 'IDR'),
        poNo,
        notes: str(row, 'notes'),
      },
    });
  }

  await addRuleWarnings(plan, c, settings);

  // ── Row counts ──
  const levelByRow = new Map<string, Issue['level']>();
  for (const i of c.issues) {
    if (i.rowNumber < 2) continue;
    const key = `${i.sheet}:${i.rowNumber}`;
    if (i.level === 'ERROR' || !levelByRow.has(key)) levelByRow.set(key, i.level);
  }
  const errorRows = [...levelByRow.values()].filter((l) => l === 'ERROR').length;
  const warningRows = levelByRow.size - errorRows;
  return {
    plan,
    issues: c.issues,
    counts: {
      totalRows: parsed.totalRows,
      validRows: parsed.totalRows - errorRows - warningRows,
      warningRows,
      errorRows,
    },
  };
}

// ─── Business-rule warnings (§5.5 rules 1–5 become warnings on import) ───────

async function addRuleWarnings(plan: Plan, c: Collector, settings: SettingsDto): Promise<void> {
  const touched = new Map<string, WorkRef>();
  for (const w of plan.works) touched.set(w.ref.key, w.ref);
  for (const list of [
    plan.memos,
    plan.rfqs,
    plan.pvps,
    plan.approvals,
    plan.officials,
    plan.pos,
    plan.agreements,
    plan.addendums,
  ]) {
    for (const d of list) if (!touched.has(d.work.key)) touched.set(d.work.key, d.work);
  }

  const templates = await prisma.milestoneTemplate.findMany({ where: { isActive: true } });
  const d = (s: string) => new Date(s);

  for (const ref of touched.values()) {
    const planWork = plan.works.find((w) => w.ref === ref);
    const existing = ref.existingId
      ? await prisma.work.findUnique({
          where: { id: ref.existingId },
          select: {
            amountIdr: true,
            status: true,
            pvpRequired: true,
            sourceAgreementId: true,
            pkResult: true,
            milestones: {
              select: { type: true, sequence: true, status: true, prerequisites: true },
            },
          },
        })
      : null;

    // Final values of the work after the import.
    const amountIdr = planWork
      ? num(amountInIdr(planWork.data.amount, planWork.data.exchangeRate))
      : num(existing!.amountIdr);
    const pvpRequired = planWork
      ? isPvpRequired(
          amountIdr,
          computeIncreasePercent(amountIdr, planWork.data.previousPurchaseAmount),
          settings,
        )
      : existing!.pvpRequired;
    const milestones = existing
      ? existing.milestones.map((m) => ({ ...m }))
      : templates
          .filter((t) => t.method === ref.method)
          .map((t) => ({
            type: t.type,
            sequence: t.sequence,
            prerequisites: t.prerequisites,
            status: (t.isConditional && !pvpRequired
              ? 'NOT_APPLICABLE'
              : 'NOT_STARTED') as MilestoneStatus,
          }));

    // Documents after the import: existing ones plus this file's (updates replace them).
    const base: DocumentSnapshot = ref.existingId
      ? await loadSnapshot(prisma, ref.existingId)
      : { memos: [], rfq: null, pvp: null, purchaseOrders: [], agreements: [], addendums: [] };
    const mine = <T extends { work: WorkRef }>(list: T[]) => list.filter((x) => x.work === ref);
    const pvpPlan = mine(plan.pvps)[0];
    const rfqPlan = mine(plan.rfqs)[0];
    const snapshot: DocumentSnapshot = {
      memos: [
        ...base.memos,
        ...mine(plan.memos)
          .filter((m) => !m.existingId)
          .map((m) => ({ memoType: m.data.memoType, memoDate: d(m.data.memoDate) })),
      ],
      rfq: rfqPlan
        ? {
            recordedAt: new Date(),
            loaNo: rfqPlan.data.loaNo,
            loaDate: rfqPlan.data.loaDate ? d(rfqPlan.data.loaDate) : null,
          }
        : base.rfq,
      pvp: pvpPlan
        ? {
            status: pvpPlan.data.status,
            approvals: [
              ...(base.pvp?.approvals ?? []),
              ...mine(plan.approvals)
                .filter((a) => !a.existingId)
                .map((a) => ({ decision: a.data.decision, approvalDate: d(a.data.approvalDate) })),
            ],
          }
        : base.pvp,
      purchaseOrders: [
        ...base.purchaseOrders,
        ...mine(plan.pos)
          .filter((p) => !p.existingId)
          .map((p) => ({ poDate: d(p.data.poDate) })),
      ],
      agreements: [
        ...base.agreements,
        ...mine(plan.agreements)
          .filter((a) => !a.existingId)
          .map((a) => ({ periodStart: d(a.data.periodStart), recordedAt: new Date() })),
      ],
      addendums: [
        ...base.addendums,
        ...mine(plan.addendums)
          .filter((a) => !a.existingId)
          .map((a) => ({ addendumDate: d(a.data.addendumDate) })),
      ],
    };
    const pkResult = planWork ? planWork.data.pkResult : (existing?.pkResult ?? null);
    const completions = documentCompletions(
      ref.method,
      pkResult,
      snapshot,
      settings.PVP_MIN_DIRECTOR_APPROVALS,
    );
    const official = mine(plan.officials)[0];
    for (const m of milestones) {
      if (m.status === 'NOT_APPLICABLE') continue;
      if (DOCUMENT_MILESTONES.has(m.type))
        m.status = completions[m.type] ? 'DONE' : m.status === 'DONE' ? 'IN_PROGRESS' : m.status;
      if (m.type === 'OFFICIAL_APPROVAL' && official)
        m.status = official.data.approvalDate ? 'DONE' : 'IN_PROGRESS';
    }

    const issues = getDataIssues(
      {
        method: ref.method,
        amountIdr,
        status: planWork ? planWork.data.status : (existing!.status as WorkStatus),
        pvpRequired,
        sourceAgreementId: planWork
          ? planWork.data.sourceAgreementNo
          : (existing?.sourceAgreementId ?? null),
        pkResult,
        lastUpdatedAt: new Date(),
        milestones,
        completions,
      },
      settings,
    );
    for (const issue of issues) c.warn(ref.anchor, null, issue.message);
  }
}
