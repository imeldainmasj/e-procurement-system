import { describe, expect, it } from 'vitest';
import '../zod.js';
import { prInputSchema, prItemInputSchema } from './pr.schema.js';

const uuid = '3f1c2b9e-8a4d-4f6e-9b2a-1c3d5e7f9a0b';

describe('prItemInputSchema', () => {
  it('accepts a catalog item without a unit', () => {
    const item = prItemInputSchema.parse({ itemId: uuid, qty: '2', estimatedUnitPrice: 1500000 });
    expect(item).toMatchObject({ itemId: uuid, freeTextName: null, unit: null, qty: 2 });
  });

  it('accepts a free-text item with a unit', () => {
    expect(
      prItemInputSchema.safeParse({
        freeTextName: 'Kabel HDMI 5m',
        unit: 'pcs',
        qty: 3,
        estimatedUnitPrice: 75000,
      }).success,
    ).toBe(true);
  });

  it('requires exactly one of catalog item or free text', () => {
    expect(
      prItemInputSchema.safeParse({ qty: 1, estimatedUnitPrice: 0, unit: 'pcs' }).success,
    ).toBe(false);
    expect(
      prItemInputSchema.safeParse({
        itemId: uuid,
        freeTextName: 'X',
        qty: 1,
        estimatedUnitPrice: 0,
      }).success,
    ).toBe(false);
  });

  it('requires a unit for free-text items', () => {
    const res = prItemInputSchema.safeParse({ freeTextName: 'X', qty: 1, estimatedUnitPrice: 0 });
    expect(res.error?.issues[0]?.path).toEqual(['unit']);
  });
});

describe('prInputSchema', () => {
  const base = {
    title: 'Laptop staf baru',
    justification: 'Penambahan 2 staf',
    neededDate: '2026-11-15',
    items: [{ itemId: uuid, qty: 2, estimatedUnitPrice: 15000000 }],
  };

  it('defaults priority to MEDIUM', () => {
    expect(prInputSchema.parse(base).priority).toBe('MEDIUM');
  });

  it('needs at least one item and a valid date', () => {
    expect(prInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(prInputSchema.safeParse({ ...base, neededDate: '15/11/2026' }).success).toBe(false);
  });
});
