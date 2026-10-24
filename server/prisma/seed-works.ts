import type {
  MilestoneType,
  PkResult,
  ProcurementMethod,
  ProcurementType,
  ProjectCategory,
  WorkStatus,
} from '@sipita/shared';
import { dayjs } from '../src/lib/dayjs.js';
import { prisma, type TxClient } from '../src/lib/prisma.js';
import { refreshAgreementStatus } from '../src/modules/agreements/agreements.service.js';
import { activeFor } from '../src/modules/milestone-templates/milestone-templates.service.js';
import { getSettings } from '../src/modules/settings/settings.service.js';
import { refreshWorkIssues, syncMilestones } from '../src/modules/works/work-state.js';
import { milestonesFromTemplate } from '../src/modules/works/works.service.js';
import { amountInIdr } from '../src/utils/money.js';
import { nextWorkCode } from '../src/utils/numbering.js';
import {
  computeIncreasePercent,
  isPvpRequired,
  suggestMethod,
} from '../src/utils/procurementRules.js';

/**
 * Sample works 2015–2026 with their documents (CLAUDE.md §14). Codes, milestones, PVP,
 * document ↔ milestone sync and data issues use the application's own functions; history
 * is synced non-strictly, like an import, so gaps in old data show up as warnings.
 */

const DAY = 86_400_000;
const M = 1_000_000;

interface Scenario {
  key?: string;
  title: string;
  procurementType: ProcurementType;
  category: ProjectCategory;
  /** Defaults to the suggested method for the value. */
  method?: ProcurementMethod;
  year: number;
  pic: string;
  vendor: string;
  directorate: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  previous?: number | null;
  status: WorkStatus;
  periodStart: string;
  periodEnd: string;
  /** Milestones whose documents are recorded; 'all' = every applicable one. */
  done: MilestoneType[] | 'all';
  inProgress?: MilestoneType[];
  /** Imported history: documents missing although later steps are recorded. */
  missing?: MilestoneType[];
  /** Approvals recorded on a PVP that is still pending. */
  pendingApprovals?: number;
  /** PK: key of the scenario whose agreement is extended, and the result. */
  sourceKey?: string;
  pkResult?: PkResult;
  idleDays?: number;
  updates?: string[];
  notes?: string;
}

// ─── Historical renewals ─────────────────────────────────────────────────────

interface Series {
  key: string;
  name: string;
  vendor: string;
  directorate: string;
  base: number;
  growth: number;
  from: number;
  to: number;
  /** Contract start (MM-DD); the contract runs one year. */
  starts: string;
  currency?: string;
  rates?: Record<number, number>;
}

const USD_RATES: Record<number, number> = {
  2019: 14_150,
  2020: 14_580,
  2021: 14_310,
  2022: 15_230,
  2023: 15_650,
  2024: 16_100,
  2025: 16_350,
};

const series: Series[] = [
  {
    key: 'm365',
    name: 'Microsoft 365 E3',
    vendor: 'V001',
    directorate: 'DIR-OPS',
    base: 2_100 * M,
    growth: 0.06,
    from: 2015,
    to: 2025,
    starts: '11-01',
  },
  {
    key: 'entra',
    name: 'Microsoft Entra ID P1',
    vendor: 'V002',
    directorate: 'DIR-OPS',
    base: 310 * M,
    growth: 0.04,
    from: 2020,
    to: 2025,
    starts: '12-01',
  },
  {
    key: 'av',
    name: 'Endpoint Protection Antivirus',
    vendor: 'V004',
    directorate: 'DIR-OPS',
    base: 420 * M,
    growth: 0.07,
    from: 2018,
    to: 2025,
    starts: '01-15',
  },
  {
    key: 'backup',
    name: 'Lisensi Backup Software',
    vendor: 'V008',
    directorate: 'DIR-OPS',
    base: 690 * M,
    growth: 0.03,
    from: 2021,
    to: 2025,
    starts: '07-01',
  },
  {
    key: 'oracle',
    name: 'Oracle Database Support',
    vendor: 'V009',
    directorate: 'DIR-FIN',
    base: 42_000,
    growth: 0.05,
    from: 2019,
    to: 2025,
    starts: '07-01',
    currency: 'USD',
    rates: USD_RATES,
  },
];

const staffCycle = ['andi.pratama', 'dewi.lestari', 'budi.santoso', 'rina.wulandari'];

function oneYear(year: number, starts: string) {
  const start = dayjs(`${year}-${starts}`);
  return {
    periodStart: start.format('YYYY-MM-DD'),
    periodEnd: start.add(1, 'year').subtract(1, 'day').format('YYYY-MM-DD'),
  };
}

function renewals(): Scenario[] {
  const out: Scenario[] = [];
  let n = 0;
  for (const s of series) {
    let previousIdr: number | null = null;
    for (let year = s.from; year <= s.to; year++) {
      const amount = Math.round(s.base * (1 + s.growth) ** (year - s.from));
      const rate = s.rates?.[year] ?? 1;
      // The oldest records come from the legacy Excel without a cost MoA (and 2016 without
      // the PVP data) — material for the compliance report (§10).
      const legacy = year <= 2017 || (s.key === 'av' && year === 2018);
      out.push({
        key: `${s.key}-${year}`,
        title: `Renewal License ${s.name} ${year}-${year + 1}`,
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        year,
        pic: staffCycle[n++ % staffCycle.length]!,
        vendor: s.vendor,
        directorate: s.directorate,
        amount,
        currency: s.currency ?? 'IDR',
        exchangeRate: rate,
        previous: previousIdr,
        status: 'COMPLETED',
        ...oneYear(year, s.starts),
        done: 'all',
        missing: legacy ? (year === 2016 ? ['MOA_COST', 'PVP'] : ['MOA_COST']) : [],
        notes: legacy ? 'Data historis dari rekap Excel lama' : undefined,
      });
      previousIdr = amount * rate;
    }
  }
  return out;
}

// ─── Other history & running works ───────────────────────────────────────────

const others: Scenario[] = [
  {
    title: 'New Application Sistem Helpdesk IT',
    procurementType: 'NEW_APPLICATION',
    category: 'PROJECT',
    method: 'DIRECT_APPOINTMENT',
    year: 2023,
    pic: 'dewi.lestari',
    vendor: 'V005',
    directorate: 'DIR-OPS',
    amount: 380 * M,
    status: 'COMPLETED',
    periodStart: '2023-08-01',
    periodEnd: '2024-07-31',
    done: 'all',
  },
  {
    title: 'New License Power BI Pro',
    procurementType: 'NEW_LICENSE',
    category: 'PROJECT',
    year: 2024,
    pic: 'budi.santoso',
    vendor: 'V007',
    directorate: 'DIR-BIS',
    amount: 260 * M,
    status: 'COMPLETED',
    periodStart: '2024-09-01',
    periodEnd: '2025-08-31',
    done: 'all',
  },
  // Perpanjangan Khusus from active 2025 contracts.
  {
    title: 'Perpanjangan Khusus Lisensi Backup Software 2026-2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    method: 'SPECIAL_EXTENSION',
    year: 2026,
    pic: 'rina.wulandari',
    vendor: 'V008',
    directorate: 'DIR-OPS',
    amount: 790 * M,
    previous: 776_600_000,
    status: 'COMPLETED',
    periodStart: '2026-07-01',
    periodEnd: '2027-06-30',
    done: 'all',
    sourceKey: 'backup-2025',
    pkResult: 'ADDENDUM',
    updates: ['Kontrak lama diperpanjang lewat Addendum I sampai 30 Juni 2027.'],
  },
  {
    title: 'Perpanjangan Khusus Oracle Database Support 2026-2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    method: 'SPECIAL_EXTENSION',
    year: 2026,
    pic: 'budi.santoso',
    vendor: 'V009',
    directorate: 'DIR-FIN',
    amount: 54_000,
    currency: 'USD',
    exchangeRate: 16_420,
    previous: 51_051 * 16_350,
    status: 'COMPLETED',
    periodStart: '2026-07-01',
    periodEnd: '2027-06-30',
    done: 'all',
    sourceKey: 'oracle-2025',
    pkResult: 'NEW_AGREEMENT',
    updates: ['Vendor meminta agreement baru karena perubahan skema support.'],
  },
  // Running in 2026 at different stages.
  {
    title: 'Renewal License Microsoft 365 E3 2026-2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    year: 2026,
    pic: 'andi.pratama',
    vendor: 'V001',
    directorate: 'DIR-OPS',
    amount: 3_980 * M,
    previous: 3_760_752_000,
    status: 'ACTIVE',
    periodStart: '2026-11-01',
    periodEnd: '2027-10-31',
    done: ['MEMO', 'RFQ'],
    inProgress: ['PVP'],
    pendingApprovals: 1,
    updates: [
      'Memo pengadaan sudah ditandatangani VP IT.',
      'RFQ dikirim ke 4 vendor, penawaran terendah dari PT Solusi Lisensi Nusantara.',
      'Kenaikan 5,83% → PVP wajib. Baru 1 direktur menyetujui, menunggu 1 lagi.',
    ],
  },
  {
    title: 'Renewal License Microsoft Entra ID P1 2026-2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    year: 2026,
    pic: 'dewi.lestari',
    vendor: 'V002',
    directorate: 'DIR-OPS',
    amount: 395 * M,
    previous: 377_162_400,
    status: 'ACTIVE',
    periodStart: '2026-12-01',
    periodEnd: '2027-11-30',
    done: ['MEMO', 'RFQ', 'MOA_METHOD'],
    inProgress: ['LOA'],
    updates: [
      'MoA Hasil Bidding sudah ditandatangani.',
      'LoA masih diproses tim Procurement; MoA Biaya disusun setelah LoA terbit.',
    ],
  },
  {
    title: 'New Application Vendor Portal e-Procurement',
    procurementType: 'NEW_APPLICATION',
    category: 'PROJECT',
    method: 'DIRECT_APPOINTMENT',
    year: 2026,
    pic: 'budi.santoso',
    vendor: 'V005',
    directorate: 'DIR-FIN',
    amount: 38_000,
    currency: 'USD',
    exchangeRate: 16_300,
    status: 'ACTIVE',
    periodStart: '2026-12-01',
    periodEnd: '2027-11-30',
    done: ['MEMO', 'PVP'],
    inProgress: ['OFFICIAL_APPROVAL'],
    updates: [
      'Pengadaan baru > Rp500 jt → PVP wajib; PVP disetujui 2 direktur.',
      'Menunggu disposisi VP Procurement untuk penunjukan langsung.',
    ],
  },
  {
    title: 'Renewal License Endpoint Protection Antivirus 2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    year: 2026,
    pic: 'rina.wulandari',
    vendor: 'V004',
    directorate: 'DIR-OPS',
    amount: 690 * M,
    previous: 674_457_000,
    status: 'ACTIVE',
    periodStart: '2027-01-15',
    periodEnd: '2028-01-14',
    done: [],
    inProgress: ['MEMO'],
    idleDays: 12,
    updates: ['Draft memo sedang disusun, menunggu data jumlah endpoint dari tim Infra.'],
  },
  {
    title: 'New License Data Analytics Platform',
    procurementType: 'NEW_LICENSE',
    category: 'PROJECT',
    year: 2026,
    pic: 'andi.pratama',
    vendor: 'V007',
    directorate: 'DIR-BIS',
    amount: 1_450 * M,
    status: 'ACTIVE',
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    done: ['MEMO'],
    inProgress: ['RFQ'],
    idleDays: 9,
    updates: ['RFQ sedang disiapkan bersama tim Data.'],
  },
  {
    title: 'New Application Robotic Process Automation',
    procurementType: 'NEW_APPLICATION',
    category: 'PROJECT',
    year: 2026,
    pic: 'dewi.lestari',
    vendor: 'V010',
    directorate: 'DIR-FIN',
    amount: 480 * M,
    status: 'ON_HOLD',
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    done: ['MEMO'],
    updates: ['Ditunda menunggu keputusan anggaran semester II.'],
  },
  {
    title: 'New License Network Monitoring Tool',
    procurementType: 'NEW_LICENSE',
    category: 'PROJECT',
    year: 2026,
    pic: 'budi.santoso',
    vendor: 'V006',
    directorate: 'DIR-OPS',
    amount: 150 * M,
    status: 'CANCELLED',
    periodStart: '2026-07-01',
    periodEnd: '2027-06-30',
    done: ['MEMO'],
    updates: ['Dibatalkan: kebutuhan sudah tercakup lisensi existing.'],
  },
];

// ─── Documents ───────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
let counter = 0;
const nextNo = () => String(++counter).padStart(3, '0');
const memoNo = (date: Date) => {
  const d = dayjs(date);
  return `${nextNo()}/MEMO/IT-SAPM/${ROMAN[d.month()]}/${d.year()}`;
};
const shortTitle = (title: string) =>
  title.replace(/^(Renewal License|New License|New Application|Perpanjangan Khusus) /, '');

const MEMO_TYPES = {
  TENDER: { memo: 'MEMO_PROCUREMENT', moa: 'MOA_TENDER_RESULT' },
  BIDDING: { memo: 'MEMO_PROCUREMENT', moa: 'MOA_TENDER_RESULT' },
  DIRECT_APPOINTMENT: { memo: 'MEMO_PL', moa: 'MOA_PL' },
  SPECIAL_EXTENSION: { memo: 'MEMO_PK', moa: 'MOA_PK' },
} as const;

interface Context {
  workId: string;
  s: Scenario;
  method: ProcurementMethod;
  picId: string;
  vendorId: string;
  /** Date each milestone's document is dated with. */
  dateOf: (type: MilestoneType) => Date;
  money: {
    amount: number;
    currency: string;
    exchangeRate: number;
    amountIdr: ReturnType<typeof amountInIdr>;
  };
  previousPo: { poNo: string; amount: number; currency: string } | undefined;
  sourceAgreementId: string | null;
}

/** Records the document of one milestone, as staff would in the app or an import would. */
async function recordDocument(
  tx: TxClient,
  type: MilestoneType,
  c: Context,
): Promise<{ poNo?: string; agreementId?: string }> {
  const date = c.dateOf(type);
  const audit = { createdById: c.picId, updatedById: c.picId };
  const memo = (
    memoType: (typeof MEMO_TYPES)[ProcurementMethod]['memo' | 'moa'] | 'MOA_COST',
    title: string,
  ) =>
    tx.memo.create({
      data: {
        workId: c.workId,
        memoNo: memoNo(date),
        memoType,
        title,
        memoDate: date,
        requesterName: 'Tim IT SAPM',
        ...c.money,
        ...audit,
      },
    });

  switch (type) {
    case 'MEMO':
      await memo(MEMO_TYPES[c.method].memo, `Pengajuan ${c.s.title}`);
      return {};
    case 'MOA_METHOD':
      await memo(MEMO_TYPES[c.method].moa, `MoA ${shortTitle(c.s.title)}`);
      return {};
    case 'MOA_COST':
      await memo('MOA_COST', `MoA Biaya ${shortTitle(c.s.title)}`);
      return {};
    case 'RFQ':
      await tx.rfq.create({
        data: {
          workId: c.workId,
          rfqNo: `RFQ/IT/${c.s.year}/${nextNo()}`,
          method: c.method === 'TENDER' ? 'TENDER' : 'BIDDING',
          periodStart: new Date(c.s.periodStart),
          periodEnd: new Date(c.s.periodEnd),
          ...c.money,
          termOfPayment: '100% setelah lisensi aktif',
          createdAt: date,
          ...audit,
        },
      });
      return {};
    case 'LOA':
      await tx.rfq.update({
        where: { workId: c.workId },
        data: {
          loaNo: `LOA/PROC/${c.s.year}/${nextNo()}`,
          loaDate: date,
          loaProcessedBy: 'Procurement',
        },
      });
      return {};
    case 'PVP': {
      const forum = await tx.pvpForum.create({
        data: {
          workId: c.workId,
          pvpDate: date,
          status: 'APPROVED',
          notes: 'PVP Forum direksi',
          ...audit,
        },
      });
      await tx.pvpApproval.createMany({
        data: ['Direktur Operasional & Teknologi', 'Direktur Keuangan'].map((directorName) => ({
          pvpForumId: forum.id,
          directorName,
          decision: 'APPROVED' as const,
          approvalDate: new Date(date.getTime() + DAY),
          ...audit,
        })),
      });
      return {};
    }
    case 'PO': {
      const poNo = `45001${String(++counter).padStart(5, '0')}`;
      const po = await tx.purchaseOrder.create({
        data: {
          workId: c.workId,
          poNo,
          poType: c.previousPo ? 'RENEWAL' : 'NEW',
          poName: shortTitle(c.s.title),
          poDate: date,
          ...c.money,
          requesterName: 'Tim IT SAPM',
          previousPoNo: c.previousPo?.poNo ?? null,
          previousPoAmount: c.previousPo?.amount ?? null,
          previousPoCurrency: c.previousPo?.currency ?? null,
          ...audit,
        },
      });
      await tx.poPaymentTerm.create({
        data: {
          poId: po.id,
          sequence: 1,
          description: 'Pembayaran penuh setelah lisensi aktif',
          percentage: 100,
          amount: c.money.amount,
          dueDate: new Date(dayjs(c.s.periodStart).add(30, 'day').format('YYYY-MM-DD')),
          isPaid: c.s.status === 'COMPLETED',
          ...audit,
        },
      });
      return { poNo };
    }
    case 'AGREEMENT':
    case 'AGREEMENT_OR_ADDENDUM': {
      const po = await tx.purchaseOrder.findFirstOrThrow({ where: { workId: c.workId } });
      if (type === 'AGREEMENT_OR_ADDENDUM' && c.s.pkResult === 'ADDENDUM') {
        const source = await tx.agreement.findUniqueOrThrow({
          where: { id: c.sourceAgreementId! },
        });
        await tx.addendum.create({
          data: {
            agreementId: source.id,
            workId: c.workId,
            addendumNo: `ADD-01/${source.agreementNo}`,
            title: `Addendum I Perpanjangan ${source.title}`,
            addendumDate: date,
            newPeriodEnd: new Date(c.s.periodEnd),
            valueChange: c.money.amount,
            currency: c.money.currency,
            exchangeRate: c.money.exchangeRate,
            valueChangeIdr: c.money.amountIdr,
            poId: po.id,
            ...audit,
          },
        });
        return { agreementId: source.id };
      }
      const agreement = await tx.agreement.create({
        data: {
          agreementNo: `AGR/IT/${c.s.year}/${nextNo()}`,
          agreementType: c.previousPo || c.method === 'SPECIAL_EXTENSION' ? 'RENEWAL' : 'NEW',
          title: `Perjanjian ${shortTitle(c.s.title)}`,
          vendorId: c.vendorId,
          poId: po.id,
          workId: c.workId,
          picId: c.picId,
          periodStart: new Date(c.s.periodStart),
          periodEnd: new Date(c.s.periodEnd),
          ...c.money,
          createdAt: date,
          ...audit,
        },
      });
      return { agreementId: agreement.id };
    }
    default:
      return {};
  }
}

// ─── Writer ──────────────────────────────────────────────────────────────────

async function idsBy<K extends string>(
  rows: Promise<({ id: string } & Record<K, string>)[]>,
  key: K,
): Promise<Map<string, string>> {
  return new Map((await rows).map((r) => [r[key], r.id]));
}

export async function seedWorks(): Promise<number> {
  if ((await prisma.work.count()) > 0) return 0; // keep existing (also manually entered) data

  const settings = await getSettings();
  const today = dayjs().tz().format('YYYY-MM-DD');
  const users = await idsBy(
    prisma.user.findMany({ select: { id: true, username: true } }),
    'username',
  );
  const vendors = await idsBy(prisma.vendor.findMany({ select: { id: true, code: true } }), 'code');
  const directorates = await idsBy(
    prisma.directorate.findMany({ select: { id: true, code: true } }),
    'code',
  );

  const agreementsByKey = new Map<string, string>();
  const lastPoBySeries = new Map<string, { poNo: string; amount: number; currency: string }>();
  const scenarios = [...renewals(), ...others];

  for (const s of scenarios) {
    const rate = s.exchangeRate ?? 1;
    const amountIdr = amountInIdr(s.amount, rate);
    const idr = Number(amountIdr.toString());
    const increasePercent = computeIncreasePercent(idr, s.previous ?? null);
    const pvpRequired = isPvpRequired(idr, increasePercent, settings);
    const method = s.method ?? suggestMethod(idr, settings);
    const picId = users.get(s.pic)!;
    const seriesKey = s.key?.replace(/-\d{4}$/, '');
    const sourceAgreementId = s.sourceKey ? (agreementsByKey.get(s.sourceKey) ?? null) : null;
    const completed = s.status === 'COMPLETED';

    await prisma.$transaction(async (tx) => {
      const plan = milestonesFromTemplate(await activeFor(tx, method), pvpRequired);
      // History is dated backwards from the contract start; running works up to today.
      const steps = Math.max(...plan.map((m) => m.sequence));
      const gap = completed ? 21 : 12;
      const first = completed
        ? dayjs(s.periodStart).subtract(steps * gap + 14, 'day')
        : dayjs(today).subtract(steps * gap, 'day');
      const dateOf = (type: MilestoneType) => {
        const seq = plan.find((m) => m.type === type)!.sequence;
        return new Date(first.add((seq - 1) * gap, 'day').format('YYYY-MM-DD'));
      };

      const work = await tx.work.create({
        data: {
          code: await nextWorkCode(tx, s.year),
          title: s.title,
          procurementType: s.procurementType,
          category: s.category,
          method,
          procurementYear: s.year,
          picId,
          requesterDirectorateId: directorates.get(s.directorate) ?? null,
          vendorId: vendors.get(s.vendor) ?? null,
          amount: s.amount,
          currency: s.currency ?? 'IDR',
          exchangeRate: rate,
          amountIdr,
          previousPurchaseAmount: s.previous ?? null,
          increasePercent,
          pvpRequired,
          periodStart: new Date(s.periodStart),
          periodEnd: new Date(s.periodEnd),
          sourceAgreementId,
          pkResult: s.pkResult ?? null,
          status: s.status,
          notes: s.notes ?? null,
          createdById: picId,
          updatedById: picId,
          createdAt: first.toDate(),
          milestones: {
            create: plan.map((m) => {
              const started = m.status !== 'NOT_APPLICABLE' && s.inProgress?.includes(m.type);
              return {
                ...m,
                status: started ? ('IN_PROGRESS' as const) : m.status,
                startedAt: started ? dateOf(m.type) : null,
              };
            }),
          },
        },
      });

      const context: Context = {
        workId: work.id,
        s,
        method,
        picId,
        vendorId: vendors.get(s.vendor)!,
        dateOf,
        money: { amount: s.amount, currency: s.currency ?? 'IDR', exchangeRate: rate, amountIdr },
        previousPo: seriesKey ? lastPoBySeries.get(seriesKey) : undefined,
        sourceAgreementId,
      };

      for (const m of plan) {
        const recorded = s.done === 'all' || s.done.includes(m.type);
        if (m.status === 'NOT_APPLICABLE' || !recorded || s.missing?.includes(m.type)) continue;
        if (m.type === 'OFFICIAL_APPROVAL') {
          // No document table: completed on the milestone itself (§6).
          await tx.workMilestone.updateMany({
            where: { workId: work.id, type: 'OFFICIAL_APPROVAL' },
            data: {
              status: 'DONE',
              startedAt: dateOf(m.type),
              completedAt: dateOf(m.type),
              referenceNo: `DISP/PROC/${s.year}/${nextNo()}`,
              notes: 'Hartono Wibisono — VP Procurement',
            },
          });
          continue;
        }
        const result = await recordDocument(tx, m.type, context);
        if (result.poNo && seriesKey) {
          lastPoBySeries.set(seriesKey, {
            poNo: result.poNo,
            amount: s.amount,
            currency: s.currency ?? 'IDR',
          });
        }
        if (result.agreementId && s.key) agreementsByKey.set(s.key, result.agreementId);
      }
      if (s.pendingApprovals) {
        const forum = await tx.pvpForum.create({
          data: { workId: work.id, pvpDate: dateOf('PVP'), status: 'PENDING', createdById: picId },
        });
        await tx.pvpApproval.createMany({
          data: Array.from({ length: s.pendingApprovals }, () => ({
            pvpForumId: forum.id,
            directorName: 'Direktur Operasional & Teknologi',
            decision: 'APPROVED' as const,
            approvalDate: dateOf('PVP'),
            createdById: picId,
          })),
        });
      }

      // Same sync as the application; history is synced like an import (non-strict).
      await syncMilestones(tx, work.id, settings, {
        authorId: picId,
        reason: 'dokumen dicatat',
        strict: !completed,
      });
      // Date the generated log entries with the documents instead of today.
      const done = await tx.workMilestone.findMany({
        where: { workId: work.id, status: 'DONE' },
        select: { id: true, completedAt: true },
      });
      for (const m of done) {
        await tx.workUpdate.updateMany({
          where: { workId: work.id, milestoneId: m.id },
          data: { createdAt: m.completedAt! },
        });
      }

      const lastDone = done.reduce(
        (max, m) => (m.completedAt! > max ? m.completedAt! : max),
        first.toDate(),
      );
      const lastUpdatedAt = s.idleDays
        ? new Date(Date.now() - s.idleDays * DAY)
        : s.status === 'ACTIVE'
          ? new Date(Date.now() - 2 * DAY)
          : lastDone;
      const notes = s.updates ?? (completed ? ['Pekerjaan selesai, dokumen lengkap.'] : []);
      const span = Math.max(DAY, lastUpdatedAt.getTime() - first.valueOf());
      await tx.workUpdate.createMany({
        data: notes.map((note, i) => ({
          workId: work.id,
          authorId: picId,
          note,
          createdAt: new Date(first.valueOf() + (span * (i + 1)) / notes.length),
        })),
      });
      await tx.work.update({ where: { id: work.id }, data: { lastUpdatedAt } });
      await refreshWorkIssues(tx, work.id, settings);
    });
  }

  // Agreement status as the daily job would set it today.
  for (const { id } of await prisma.agreement.findMany({ select: { id: true } })) {
    await prisma.$transaction((tx) =>
      refreshAgreementStatus(tx, id, settings.CONTRACT_REMINDER_DAYS),
    );
  }
  return scenarios.length;
}
