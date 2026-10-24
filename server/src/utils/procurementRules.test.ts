import {
  DEFAULT_MILESTONE_TEMPLATES,
  SETTING_DEFAULTS,
  type MilestoneStatus,
} from '@sipita/shared';
import { describe, expect, it } from 'vitest';
import {
  agreementStatus,
  canRecordPo,
  canStartMilestone,
  computeIncreasePercent,
  currentStages,
  documentCompletions,
  getDataIssues,
  isPvpRequired,
  isStale,
  memoMilestone,
  suggestMethod,
  type DataIssueInput,
  type DocumentSnapshot,
  type MilestoneLike,
} from './procurementRules.js';

const settings = SETTING_DEFAULTS;
const M = 1_000_000;

/** Tender milestones with the given statuses (others NOT_STARTED). */
function tender(statuses: Partial<Record<MilestoneLike['type'], MilestoneStatus>> = {}) {
  return DEFAULT_MILESTONE_TEMPLATES.TENDER.map((t) => ({
    type: t.type,
    sequence: t.sequence,
    prerequisites: t.prerequisites,
    status: statuses[t.type] ?? ('NOT_STARTED' as MilestoneStatus),
  }));
}

describe('suggestMethod', () => {
  it('uses Tender only above the threshold', () => {
    expect(suggestMethod(1_000 * M + 0.01, settings)).toBe('TENDER');
    expect(suggestMethod(1_000 * M, settings)).toBe('BIDDING');
    expect(suggestMethod(10 * M, settings)).toBe('BIDDING');
  });

  it('follows a changed threshold', () => {
    expect(suggestMethod(600 * M, { ...settings, TENDER_MIN_AMOUNT: 500 * M })).toBe('TENDER');
  });
});

describe('computeIncreasePercent', () => {
  it('rounds to two decimals', () => {
    expect(computeIncreasePercent(4_850 * M, 4_300 * M)).toBe(12.79);
    expect(computeIncreasePercent(90, 100)).toBe(-10);
  });

  it('is null without previous-year data', () => {
    expect(computeIncreasePercent(100, null)).toBeNull();
    expect(computeIncreasePercent(100, 0)).toBeNull();
  });
});

describe('isPvpRequired', () => {
  it('requires both value and increase above the thresholds', () => {
    expect(isPvpRequired(600 * M, 5.01, settings)).toBe(true);
    expect(isPvpRequired(600 * M, 5, settings)).toBe(false); // exactly at the % threshold
    expect(isPvpRequired(500 * M, 50, settings)).toBe(false); // exactly at the value threshold
    expect(isPvpRequired(500 * M + 1, 50, settings)).toBe(true);
  });

  it('requires PVP for a new procurement above the value threshold', () => {
    expect(isPvpRequired(500 * M + 1, null, settings)).toBe(true);
    expect(isPvpRequired(500 * M, null, settings)).toBe(false);
  });

  it('does not require PVP when the price went down', () => {
    expect(isPvpRequired(900 * M, -3, settings)).toBe(false);
  });
});

describe('milestone prerequisites', () => {
  it('treats NOT_APPLICABLE as satisfied', () => {
    const ms = tender({ MEMO: 'DONE', RFQ: 'DONE', PVP: 'NOT_APPLICABLE' });
    const moa = ms.find((m) => m.type === 'MOA_METHOD')!;
    expect(canStartMilestone(moa, ms)).toBe(true);
  });

  it('blocks a milestone whose prerequisite is open', () => {
    const ms = tender({ MEMO: 'DONE', RFQ: 'IN_PROGRESS' });
    expect(
      canStartMilestone(
        ms.find((m) => m.type === 'PVP')!,
        ms,
      ),
    ).toBe(false);
  });

  it('runs Tender/Bidding strictly in order: MoA → LoA → MoA Biaya → PO', () => {
    const afterPvp = tender({ MEMO: 'DONE', RFQ: 'DONE', PVP: 'DONE' });
    expect(currentStages(afterPvp).map((m) => m.type)).toEqual(['MOA_METHOD']);

    const waitingLoa = tender({ MEMO: 'DONE', RFQ: 'DONE', PVP: 'DONE', MOA_METHOD: 'DONE' });
    expect(currentStages(waitingLoa).map((m) => m.type)).toEqual(['LOA']);

    const afterLoa = tender({
      MEMO: 'DONE',
      RFQ: 'DONE',
      PVP: 'DONE',
      MOA_METHOD: 'DONE',
      LOA: 'DONE',
    });
    expect(currentStages(afterLoa).map((m) => m.type)).toEqual(['MOA_COST']);
  });

  it('still runs MoA PL and MoA Biaya in parallel for Penunjukan Langsung', () => {
    const pl = DEFAULT_MILESTONE_TEMPLATES.DIRECT_APPOINTMENT.map((t) => ({
      type: t.type,
      sequence: t.sequence,
      prerequisites: t.prerequisites,
      status: (['MEMO', 'PVP', 'OFFICIAL_APPROVAL'].includes(t.type)
        ? 'DONE'
        : 'NOT_STARTED') as MilestoneStatus,
    }));
    expect(currentStages(pl).map((m) => m.type)).toEqual(['MOA_METHOD', 'MOA_COST']);
  });
});

describe('canRecordPo', () => {
  it('needs both the method MoA and the cost MoA', () => {
    expect(canRecordPo({ milestones: tender({ MOA_METHOD: 'DONE' }) })).toBe(false);
    expect(canRecordPo({ milestones: tender({ MOA_COST: 'DONE' }) })).toBe(false);
    expect(canRecordPo({ milestones: tender({ MOA_METHOD: 'DONE', MOA_COST: 'DONE' }) })).toBe(
      true,
    );
  });
});

describe('getDataIssues', () => {
  const base: DataIssueInput = {
    method: 'TENDER',
    amountIdr: 2_000 * M,
    status: 'ACTIVE',
    pvpRequired: false,
    sourceAgreementId: null,
    pkResult: null,
    lastUpdatedAt: new Date(),
    milestones: tender({ PVP: 'NOT_APPLICABLE' }),
  };
  const codes = (input: Partial<DataIssueInput>) =>
    getDataIssues({ ...base, ...input }, settings).map((i) => i.code);

  it('is empty for a consistent work', () => {
    expect(codes({})).toEqual([]);
  });

  it('flags a method that does not match the value', () => {
    expect(codes({ amountIdr: 300 * M })).toEqual(['METHOD_MISMATCH']);
    expect(codes({ method: 'DIRECT_APPOINTMENT', amountIdr: 300 * M, milestones: [] })).toEqual([]);
  });

  it('flags imported history with a PO but no cost MoA', () => {
    const ms = tender({
      MEMO: 'DONE',
      RFQ: 'DONE',
      PVP: 'NOT_APPLICABLE',
      MOA_METHOD: 'DONE',
      PO: 'DONE',
      AGREEMENT: 'DONE',
    });
    const issues = getDataIssues({ ...base, milestones: ms }, settings);
    expect(issues.map((i) => i.code)).toEqual(['PO_WITHOUT_MOA']);
    expect(issues[0]!.message).toBe('PO tanpa MoA Biaya');
  });

  it('flags a required PVP skipped by later milestones', () => {
    const ms = tender({ MEMO: 'DONE', RFQ: 'DONE', MOA_METHOD: 'DONE' });
    expect(codes({ pvpRequired: true, milestones: ms })).toEqual(['PVP_MISSING']);
  });

  it('flags PK without source agreement or result', () => {
    const pk = DEFAULT_MILESTONE_TEMPLATES.SPECIAL_EXTENSION.map((t) => ({
      type: t.type,
      sequence: t.sequence,
      prerequisites: t.prerequisites,
      status: (t.isConditional ? 'NOT_APPLICABLE' : 'DONE') as MilestoneStatus,
    }));
    expect(codes({ method: 'SPECIAL_EXTENSION', milestones: pk })).toEqual([
      'PK_SOURCE_MISSING',
      'PK_RESULT_MISSING',
    ]);
  });

  it('flags a completed work whose final milestone is open', () => {
    expect(codes({ status: 'COMPLETED' })).toEqual(['COMPLETED_INCOMPLETE']);
  });
});

describe('isStale', () => {
  const now = new Date('2026-10-25T08:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it('marks active works not updated for more than STALE_WORK_DAYS', () => {
    expect(isStale({ status: 'ACTIVE', lastUpdatedAt: daysAgo(7) }, settings, now)).toBe(false);
    expect(isStale({ status: 'ACTIVE', lastUpdatedAt: daysAgo(7.1) }, settings, now)).toBe(true);
    expect(isStale({ status: 'ON_HOLD', lastUpdatedAt: daysAgo(30) }, settings, now)).toBe(false);
  });
});

describe('documentCompletions', () => {
  const d = (s: string) => new Date(s);
  const empty: DocumentSnapshot = {
    memos: [],
    rfq: null,
    pvp: null,
    purchaseOrders: [],
    agreements: [],
    addendums: [],
  };

  it('maps memo types per method and dates milestones by the documents', () => {
    const c = documentCompletions(
      'TENDER',
      null,
      {
        ...empty,
        memos: [
          { memoType: 'MEMO_PROCUREMENT', memoDate: d('2026-02-12') },
          { memoType: 'MOA_TENDER_RESULT', memoDate: d('2026-05-02') },
          { memoType: 'MOA_PL', memoDate: d('2026-05-03') }, // not a Tender memo
        ],
        rfq: { recordedAt: d('2026-03-01'), loaNo: 'LOA/1', loaDate: d('2026-05-27') },
        purchaseOrders: [{ poDate: d('2026-06-10') }, { poDate: d('2026-06-01') }],
      },
      2,
    );
    expect(c).toEqual({
      MEMO: d('2026-02-12'),
      MOA_METHOD: d('2026-05-02'),
      RFQ: d('2026-03-01'),
      LOA: d('2026-05-27'),
      PO: d('2026-06-01'),
    });
  });

  it('completes PVP only when APPROVED with enough director approvals', () => {
    const pvp = (status: 'PENDING' | 'APPROVED', approvals: number) => ({
      ...empty,
      pvp: {
        status,
        approvals: Array.from({ length: approvals }, (_, i) => ({
          decision: 'APPROVED' as const,
          approvalDate: d(`2026-04-1${i}`),
        })),
      },
    });
    expect(documentCompletions('TENDER', null, pvp('APPROVED', 1), 2).PVP).toBeUndefined();
    expect(documentCompletions('TENDER', null, pvp('PENDING', 3), 2).PVP).toBeUndefined();
    expect(documentCompletions('TENDER', null, pvp('APPROVED', 2), 2).PVP).toEqual(d('2026-04-11'));
  });

  it('completes the PK final step from the document matching the chosen result', () => {
    const docs = {
      ...empty,
      agreements: [{ periodStart: d('2026-07-01'), recordedAt: d('2026-06-20') }],
      addendums: [{ addendumDate: d('2026-06-15') }],
    };
    expect(documentCompletions('SPECIAL_EXTENSION', 'ADDENDUM', docs, 2)).toEqual({
      AGREEMENT_OR_ADDENDUM: d('2026-06-15'),
    });
    expect(documentCompletions('SPECIAL_EXTENSION', 'NEW_AGREEMENT', docs, 2)).toEqual({
      AGREEMENT_OR_ADDENDUM: d('2026-06-20'),
    });
    expect(documentCompletions('SPECIAL_EXTENSION', null, docs, 2)).toEqual({});
  });

  it('maps memo types to milestones only for their method', () => {
    expect(memoMilestone('MEMO_PK', 'SPECIAL_EXTENSION')).toBe('MEMO');
    expect(memoMilestone('MEMO_PK', 'TENDER')).toBeNull();
    expect(memoMilestone('MOA_COST', 'DIRECT_APPOINTMENT')).toBe('MOA_COST');
  });
});

describe('getDataIssues with documents', () => {
  it('flags DONE milestones without their document', () => {
    const ms = tender({ MEMO: 'DONE', RFQ: 'DONE', PVP: 'DONE' });
    const issues = getDataIssues(
      {
        method: 'TENDER',
        amountIdr: 2_000 * M,
        status: 'ACTIVE',
        pvpRequired: true,
        sourceAgreementId: null,
        pkResult: null,
        lastUpdatedAt: new Date(),
        milestones: ms,
        completions: { MEMO: new Date() },
      },
      settings,
    );
    expect(issues.map((i) => i.code)).toEqual(['DOCUMENT_MISSING', 'PVP_INSUFFICIENT_APPROVALS']);
    expect(issues[0]!.message).toBe('RFQ selesai tanpa dokumen');
  });
});

describe('agreementStatus', () => {
  const days = [90, 60, 30];
  it('derives the status from the effective end date', () => {
    expect(agreementStatus('2027-06-30', '2026-10-25', days)).toBe('ACTIVE');
    expect(agreementStatus('2027-01-23', '2026-10-25', days)).toBe('EXPIRING_SOON');
    expect(agreementStatus('2026-10-25', '2026-10-25', days)).toBe('EXPIRING_SOON');
    expect(agreementStatus('2026-10-24', '2026-10-25', days)).toBe('EXPIRED');
    expect(agreementStatus('2026-10-24', '2026-10-25', days, 'TERMINATED')).toBe('TERMINATED');
  });
});
