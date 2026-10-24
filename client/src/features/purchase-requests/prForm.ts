import type { PrDto, PrInput, PrItemInput } from '@sipita/shared';

/** Form row: the API fields plus UI-only state (stripped by the zod schema on submit). */
export type PrItemFormRow = PrItemInput & {
  mode: 'catalog' | 'manual';
  /** Display label of the chosen catalog item. */
  itemLabel: string;
};

export type PrFormValues = Omit<PrInput, 'items'> & { items: PrItemFormRow[] };

export const emptyItemRow = (): PrItemFormRow => ({
  mode: 'catalog',
  itemId: '',
  itemLabel: '',
  freeTextName: '',
  unit: '',
  qty: 1,
  estimatedUnitPrice: 0,
  notes: '',
});

export function toFormValues(pr: PrDto | undefined, defaultNeededDate: string): PrFormValues {
  if (!pr) {
    return {
      title: '',
      justification: '',
      priority: 'MEDIUM',
      neededDate: defaultNeededDate,
      items: [emptyItemRow()],
    };
  }
  return {
    title: pr.title,
    justification: pr.justification,
    priority: pr.priority,
    neededDate: pr.neededDate,
    items: pr.items.map((i) => ({
      mode: i.itemId ? 'catalog' : 'manual',
      itemId: i.itemId ?? '',
      itemLabel: i.item ? `${i.item.code} — ${i.item.name}` : '',
      freeTextName: i.freeTextName ?? '',
      unit: i.unit,
      qty: i.qty,
      estimatedUnitPrice: Number(i.estimatedUnitPrice),
      notes: i.notes ?? '',
    })),
  };
}

/** Live total of the form rows (mirrors the server calculation). */
export function computeTotal(items: Pick<PrItemFormRow, 'qty' | 'estimatedUnitPrice'>[]): number {
  return items.reduce((sum, row) => {
    const qty = Number(row.qty) || 0;
    const price = Number(row.estimatedUnitPrice) || 0;
    return sum + Math.round(qty * price * 100) / 100;
  }, 0);
}
