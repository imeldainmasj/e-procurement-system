import { describe, expect, it } from 'vitest';
import { describeRuleRange, levelLabel } from './approvalRule';

describe('describeRuleRange', () => {
  it('describes bounded and unbounded ranges', () => {
    expect(
      describeRuleRange({
        minAmount: '10000000.00',
        minInclusive: true,
        maxAmount: '50000000.00',
        maxInclusive: true,
      }),
    ).toBe('≥ Rp 10.000.000 dan ≤ Rp 50.000.000');
    expect(
      describeRuleRange({
        minAmount: '50000000.00',
        minInclusive: false,
        maxAmount: null,
        maxInclusive: false,
      }),
    ).toBe('> Rp 50.000.000');
  });

  it('labels levels', () => {
    expect(levelLabel(2)).toBe('Keuangan');
    expect(levelLabel(7)).toBe('Level 7');
  });
});
