import type {
  MilestoneStatus,
  MilestoneType,
  ProcurementMethod,
  ProcurementType,
  ProjectCategory,
  WorkStatus,
} from '@sipita/shared';
import { prisma } from '../src/lib/prisma.js';
import { activeFor } from '../src/modules/milestone-templates/milestone-templates.service.js';
import { getSettings } from '../src/modules/settings/settings.service.js';
import {
  amountInIdr,
  milestonesFromTemplate,
  refreshWorkIssues,
} from '../src/modules/works/works.service.js';
import { nextWorkCode } from '../src/utils/numbering.js';
import {
  computeIncreasePercent,
  isPvpRequired,
  suggestMethod,
} from '../src/utils/procurementRules.js';

/**
 * Sample works 2015–2026 (CLAUDE.md §14). Codes, milestones, PVP and data issues come from
 * the same functions the application uses. Documents (memo, PO, agreement, …) and the PK
 * scenarios are added with the document module (stage 5).
 */

const DAY = 86_400_000;
const M = 1_000_000;

interface Scenario {
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
  /** First milestone date; later sequences follow every ~3 weeks. */
  start: string;
  /** Milestones recorded DONE; 'all' = every applicable milestone. */
  done: MilestoneType[] | 'all';
  inProgress?: MilestoneType[];
  /** Imported history: these stay open even though later milestones are DONE. */
  missing?: MilestoneType[];
  /** Days since the last update (stale works). */
  idleDays?: number;
  updates?: string[];
  notes?: string;
}

// ─── Historical renewals (completed) ─────────────────────────────────────────

interface Series {
  name: string;
  vendor: string;
  directorate: string;
  base: number;
  growth: number;
  from: number;
  to: number;
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
    name: 'Microsoft 365 E3',
    vendor: 'V001',
    directorate: 'DIR-OPS',
    base: 2_100 * M,
    growth: 0.06,
    from: 2015,
    to: 2025,
  },
  {
    name: 'Microsoft Entra ID P1',
    vendor: 'V002',
    directorate: 'DIR-OPS',
    base: 310 * M,
    growth: 0.04,
    from: 2020,
    to: 2025,
  },
  {
    name: 'Endpoint Protection Antivirus',
    vendor: 'V004',
    directorate: 'DIR-OPS',
    base: 420 * M,
    growth: 0.07,
    from: 2018,
    to: 2025,
  },
  {
    name: 'Lisensi Backup Software',
    vendor: 'V008',
    directorate: 'DIR-OPS',
    base: 690 * M,
    growth: 0.03,
    from: 2021,
    to: 2024,
  },
  {
    name: 'Oracle Database Support',
    vendor: 'V009',
    directorate: 'DIR-FIN',
    base: 42_000,
    growth: 0.05,
    from: 2019,
    to: 2024,
    currency: 'USD',
    rates: USD_RATES,
  },
];

const staffCycle = ['andi.pratama', 'dewi.lestari', 'budi.santoso', 'rina.wulandari'];

function renewals(): Scenario[] {
  const out: Scenario[] = [];
  let n = 0;
  for (const s of series) {
    let previousIdr: number | null = null;
    for (let year = s.from; year <= s.to; year++) {
      const amount = Math.round(s.base * (1 + s.growth) ** (year - s.from));
      const rate = s.rates?.[year] ?? 1;
      const amountIdr = amount * rate;
      // The oldest records come from the legacy Excel without a cost MoA (§7 warnings).
      const legacy = year <= 2017 || (s.vendor === 'V004' && year === 2018);
      out.push({
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
        start: `${year}-02-10`,
        done: 'all',
        missing: legacy ? ['MOA_COST'] : [],
        notes: legacy ? 'Data historis dari rekap Excel lama' : undefined,
      });
      previousIdr = amountIdr;
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
    start: '2023-03-06',
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
    start: '2024-04-15',
    done: 'all',
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
    previous: 3_760 * M,
    status: 'ACTIVE',
    start: '2026-08-04',
    done: ['MEMO', 'RFQ'],
    inProgress: ['PVP'],
    updates: [
      'Memo pengadaan sudah ditandatangani VP IT.',
      'RFQ dikirim ke 4 vendor, penawaran terendah dari PT Solusi Lisensi Nusantara.',
      'Kenaikan 5,85% → PVP wajib. Bahan PVP sudah dikirim ke sekretariat direksi.',
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
    previous: 377 * M,
    status: 'ACTIVE',
    start: '2026-07-14',
    done: ['MEMO', 'RFQ', 'MOA_METHOD', 'MOA_COST'],
    inProgress: ['LOA'],
    updates: [
      'MoA Hasil Bidding dan MoA Biaya sudah lengkap.',
      'LoA masih diproses tim Procurement, estimasi terbit minggu depan.',
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
    start: '2026-06-02',
    done: ['MEMO', 'PVP'],
    inProgress: ['OFFICIAL_APPROVAL'],
    updates: [
      'Pengadaan baru > Rp500 jt → PVP wajib; PVP disetujui 2 direktur.',
      'Menunggu disposisi VP Procurement untuk penunjukan langsung.',
    ],
  },
  {
    title: 'Renewal License Endpoint Protection Antivirus 2026-2027',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    year: 2026,
    pic: 'rina.wulandari',
    vendor: 'V004',
    directorate: 'DIR-OPS',
    amount: 690 * M,
    previous: 674 * M,
    status: 'ACTIVE',
    start: '2026-09-21',
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
    start: '2026-08-18',
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
    start: '2026-05-11',
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
    start: '2026-03-02',
    done: ['MEMO'],
    updates: ['Dibatalkan: kebutuhan sudah tercakup lisensi existing.'],
  },
];

// ─── Writer ──────────────────────────────────────────────────────────────────

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY);

export async function seedWorks(): Promise<number> {
  if ((await prisma.work.count()) > 0) return 0; // keep existing (also manually entered) data

  const settings = await getSettings();
  const users = new Map(
    (await prisma.user.findMany({ select: { id: true, username: true } })).map((u) => [
      u.username,
      u.id,
    ]),
  );
  const vendors = new Map(
    (await prisma.vendor.findMany({ select: { id: true, code: true } })).map((v) => [v.code, v.id]),
  );
  const directorates = new Map(
    (await prisma.directorate.findMany({ select: { id: true, code: true } })).map((d) => [
      d.code,
      d.id,
    ]),
  );

  const scenarios = [...renewals(), ...others];
  for (const s of scenarios) {
    const rate = s.exchangeRate ?? 1;
    const amountIdr = amountInIdr(s.amount, rate);
    const idr = Number(amountIdr.toString());
    const increasePercent = computeIncreasePercent(idr, s.previous ?? null);
    const pvpRequired = isPvpRequired(idr, increasePercent, settings);
    const method = s.method ?? suggestMethod(idr, settings);
    const picId = users.get(s.pic)!;

    await prisma.$transaction(async (tx) => {
      const templates = await activeFor(tx, method);
      const milestones = milestonesFromTemplate(templates, pvpRequired).map((m) => {
        let status: MilestoneStatus = m.status;
        if (status !== 'NOT_APPLICABLE') {
          if (s.missing?.includes(m.type)) status = 'NOT_STARTED';
          else if (s.done === 'all' || s.done.includes(m.type)) status = 'DONE';
          else if (s.inProgress?.includes(m.type)) status = 'IN_PROGRESS';
        }
        const startedAt = addDays(s.start, (m.sequence - 1) * 21);
        return {
          ...m,
          status,
          startedAt: status === 'DONE' || status === 'IN_PROGRESS' ? startedAt : null,
          completedAt: status === 'DONE' ? addDays(s.start, (m.sequence - 1) * 21 + 14) : null,
          notes:
            m.type === 'OFFICIAL_APPROVAL' && status === 'DONE'
              ? 'Hartono Wibisono — VP Procurement'
              : null,
        };
      });

      const lastDone = milestones.reduce<Date>(
        (latest, m) => (m.completedAt && m.completedAt > latest ? m.completedAt : latest),
        new Date(s.start),
      );
      const lastUpdatedAt = s.idleDays
        ? new Date(Date.now() - s.idleDays * DAY)
        : s.status === 'ACTIVE'
          ? new Date(Date.now() - 2 * DAY)
          : lastDone;

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
          periodStart: new Date(`${s.year}-07-01`),
          periodEnd: new Date(`${s.year + 1}-06-30`),
          status: s.status,
          notes: s.notes ?? null,
          lastUpdatedAt,
          createdById: picId,
          updatedById: picId,
          createdAt: new Date(s.start),
          milestones: { create: milestones },
        },
      });

      const notes =
        s.updates ?? (s.status === 'COMPLETED' ? ['Pekerjaan selesai, agreement terbit.'] : []);
      const span = Math.max(1, lastUpdatedAt.getTime() - new Date(s.start).getTime());
      await tx.workUpdate.createMany({
        data: notes.map((note, i) => ({
          workId: work.id,
          authorId: picId,
          note,
          createdAt: new Date(new Date(s.start).getTime() + (span * (i + 1)) / notes.length),
        })),
      });
      await refreshWorkIssues(tx, work.id, settings);
    });
  }
  return scenarios.length;
}
