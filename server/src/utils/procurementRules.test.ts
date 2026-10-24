import {
  DEFAULT_MILESTONE_TEMPLATES,
  SETTING_DEFAULTS,
  type MilestoneStatus,
} from '@sipita/shared';
import { describe, expect, it } from 'vitest';
import {
  canRecordPo,
  canStartMilestone,
  computeIncreasePercent,
  currentStages,
  getDataIssues,
  isPvpRequired,
  isStale,
  suggestMethod,
  type DataIssueInput,
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

  it('reports parallel branches as current stages', () => {
    const ms = tender({ MEMO: 'DONE', RFQ: 'DONE', PVP: 'DONE', LOA: 'IN_PROGRESS' });
    expect(currentStages(ms).map((m) => m.type)).toEqual(['MOA_METHOD', 'MOA_COST', 'LOA']);
  });

  it('does not wait for LoA before the PO', () => {
    const ms = tender({
      MEMO: 'DONE',
      RFQ: 'DONE',
      PVP: 'DONE',
      MOA_METHOD: 'DONE',
      MOA_COST: 'DONE',
    });
    expect(currentStages(ms).map((m) => m.type)).toEqual(['LOA', 'PO']);
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
