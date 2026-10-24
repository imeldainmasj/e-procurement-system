import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import {
  describeRange,
  findCoverageGaps,
  rangesOverlap,
  ruleMatches,
  type RuleRange,
} from './approval-rules.logic.js';

const D = (v: number | string) => new Prisma.Decimal(v);

// The default rules from CLAUDE.md §5.
const L1: RuleRange = {
  minAmount: D(0),
  minInclusive: true,
  maxAmount: D(10_000_000),
  maxInclusive: false,
};
const L2: RuleRange = {
  minAmount: D(10_000_000),
  minInclusive: true,
  maxAmount: D(50_000_000),
  maxInclusive: true,
};
const L3: RuleRange = {
  minAmount: D(50_000_000),
  minInclusive: false,
  maxAmount: null,
  maxInclusive: false,
};

describe('ruleMatches', () => {
  it.each([
    [0, 'L1'],
    [9_999_999.99, 'L1'],
    [10_000_000, 'L2'],
    [50_000_000, 'L2'],
    [50_000_000.01, 'L3'],
    [1_000_000_000, 'L3'],
  ])('%d → %s', (amount, expected) => {
    const rules = { L1, L2, L3 };
    const matched = Object.entries(rules)
      .filter(([, r]) => ruleMatches(r, D(amount)))
      .map(([name]) => name);
    expect(matched).toEqual([expected]);
  });
});

describe('rangesOverlap', () => {
  it('treats touching bounds with one exclusive side as non-overlapping', () => {
    expect(rangesOverlap(L1, L2)).toBe(false);
    expect(rangesOverlap(L2, L3)).toBe(false);
  });

  it('detects a shared boundary point', () => {
    const r: RuleRange = { ...L3, minInclusive: true }; // ≥ 50jt overlaps "≤ 50jt"
    expect(rangesOverlap(L2, r)).toBe(true);
  });

  it('detects overlap with an unbounded rule', () => {
    const big: RuleRange = {
      minAmount: D(1_000_000),
      minInclusive: true,
      maxAmount: null,
      maxInclusive: false,
    };
    expect(rangesOverlap(L1, big)).toBe(true);
  });
});

describe('findCoverageGaps', () => {
  it('returns nothing for the default rules', () => {
    expect(findCoverageGaps([L3, L1, L2])).toEqual([]);
  });

  it('finds a missing middle tier and a missing top', () => {
    const gaps = findCoverageGaps([L1]).map(describeRange);
    expect(gaps).toEqual(['≥ Rp 10.000.000']);

    const middle = findCoverageGaps([L1, L3]).map(describeRange);
    expect(middle).toEqual(['≥ Rp 10.000.000 dan ≤ Rp 50.000.000']);
  });

  it('finds a gap at zero and a single uncovered point', () => {
    const fromOne: RuleRange = { ...L1, minAmount: D(1) };
    expect(findCoverageGaps([fromOne, L2, L3]).map(describeRange)).toEqual(['≥ Rp 0 dan < Rp 1']);

    const L2open: RuleRange = { ...L2, maxInclusive: false }; // 50jt itself now uncovered
    expect(findCoverageGaps([L1, L2open, L3]).map(describeRange)).toEqual([
      '≥ Rp 50.000.000 dan ≤ Rp 50.000.000',
    ]);
  });

  it('reports everything when there are no rules', () => {
    expect(findCoverageGaps([]).map(describeRange)).toEqual(['≥ Rp 0']);
  });
});
