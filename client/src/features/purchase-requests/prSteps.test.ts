import { describe, expect, it } from 'vitest';
import { buildPrSteps } from './prSteps';

const states = (...args: Parameters<typeof buildPrSteps>) =>
  buildPrSteps(...args).map((s) => `${s.label}:${s.state}`);

describe('buildPrSteps', () => {
  it('marks progress along the main flow', () => {
    expect(states('STOCK_CHECK').slice(0, 4)).toEqual([
      'Draft:done',
      'Diajukan:done',
      'Cek Stok:current',
      'Approval:todo',
    ]);
  });

  it('ends after the stock check when fulfilled from stock', () => {
    expect(states('FULFILLED_FROM_STOCK')).toEqual([
      'Draft:done',
      'Diajukan:done',
      'Cek Stok:done',
      'Dipenuhi dari Stok:done',
    ]);
  });

  it('flags the approval step when rejected', () => {
    expect(states('REJECTED')[3]).toBe('Approval:error');
  });

  it('treats an approved PR as waiting for quotations', () => {
    expect(states('APPROVED').slice(3, 5)).toEqual(['Approval:done', 'Penawaran:current']);
  });

  it('flags the step a PR was cancelled at', () => {
    expect(states('CANCELLED', 'SUBMITTED').slice(0, 3)).toEqual([
      'Draft:done',
      'Diajukan:error',
      'Cek Stok:todo',
    ]);
  });

  it('marks every step done when completed', () => {
    expect(buildPrSteps('COMPLETED').every((s) => s.state === 'done')).toBe(true);
  });
});
