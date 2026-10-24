import { describe, expect, it } from 'vitest';
import { computeTotal } from './prForm';

describe('computeTotal', () => {
  it('sums qty × price per row and ignores blanks', () => {
    expect(
      computeTotal([
        { qty: 2, estimatedUnitPrice: 15_000_000 },
        { qty: 3, estimatedUnitPrice: 75_000.5 },
        { qty: '', estimatedUnitPrice: 10 },
      ]),
    ).toBe(30_225_001.5);
  });
});
