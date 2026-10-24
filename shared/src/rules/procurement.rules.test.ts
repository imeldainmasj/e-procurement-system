import { describe, expect, it } from 'vitest';
import { computePoTotals, selectionJustificationReasons } from './procurement.rules.js';

const ctx = {
  quotationTotals: [10_000_000, 11_000_000, 12_000_000],
  selectedTotal: 10_000_000,
  minQuotations: 3,
  approvedAmount: 12_000_000,
};

describe('selectionJustificationReasons', () => {
  it('needs nothing for the cheapest of enough quotations within the approved amount', () => {
    expect(selectionJustificationReasons(ctx)).toEqual([]);
  });

  it('flags too few quotations', () => {
    expect(
      selectionJustificationReasons({ ...ctx, quotationTotals: [10_000_000, 11_000_000] }),
    ).toEqual(['FEW_QUOTATIONS']);
  });

  it('flags a winner that is not the cheapest', () => {
    expect(selectionJustificationReasons({ ...ctx, selectedTotal: 11_000_000 })).toEqual([
      'NOT_CHEAPEST',
    ]);
  });

  it('flags a total above the approved amount, and combines reasons', () => {
    expect(
      selectionJustificationReasons({
        quotationTotals: [13_000_000],
        selectedTotal: 13_000_000,
        minQuotations: 3,
        approvedAmount: 12_000_000,
      }),
    ).toEqual(['FEW_QUOTATIONS', 'OVER_APPROVED']);
  });

  it('treats ties for cheapest and an exact approved amount as fine', () => {
    expect(
      selectionJustificationReasons({
        ...ctx,
        quotationTotals: [12_000_000, 12_000_000, 13_000_000],
        selectedTotal: 12_000_000,
      }),
    ).toEqual([]);
  });
});

describe('computePoTotals', () => {
  it('applies PPN and rounds to cents', () => {
    expect(computePoTotals(12_000_000, 11)).toEqual({
      subtotal: 12_000_000,
      taxAmount: 1_320_000,
      total: 13_320_000,
    });
    expect(computePoTotals(1_234_567.89, 11)).toEqual({
      subtotal: 1_234_567.89,
      taxAmount: 135_802.47,
      total: 1_370_370.36,
    });
  });

  it('supports 0% for non-PKP vendors', () => {
    expect(computePoTotals(5_000_000, 0).total).toBe(5_000_000);
  });
});
