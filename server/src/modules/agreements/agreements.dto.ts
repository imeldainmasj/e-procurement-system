import type { AddendumDto, AgreementDto } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../../utils/actor.js';
import { num, numOrNull } from '../../utils/money.js';
import { canModify, dateOnly } from '../works/works.service.js';

const live = { deletedAt: null };
const day = (d: Date) => dateOnly(d)!;

export const addendumSelect = {
  id: true,
  addendumNo: true,
  title: true,
  addendumDate: true,
  newPeriodEnd: true,
  valueChange: true,
  currency: true,
  exchangeRate: true,
  valueChangeIdr: true,
  notes: true,
  work: { select: { id: true, code: true } },
  purchaseOrder: { select: { id: true, poNo: true } },
} satisfies Prisma.AddendumSelect;

export const agreementSelect = {
  id: true,
  agreementNo: true,
  agreementType: true,
  title: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  amountIdr: true,
  status: true,
  vendor: { select: { id: true, code: true, name: true } },
  pic: { select: { id: true, name: true } },
  work: { select: { id: true, code: true, title: true, picId: true } },
  purchaseOrder: { select: { id: true, poNo: true } },
  addendums: { where: live, select: addendumSelect, orderBy: { addendumDate: 'asc' } },
  extensions: { where: live, select: { id: true, code: true, title: true } },
} satisfies Prisma.AgreementSelect;

export type AgreementRecord = Prisma.AgreementGetPayload<{ select: typeof agreementSelect }>;
type AddendumRecord = Prisma.AddendumGetPayload<{ select: typeof addendumSelect }>;

export function toAddendumDto(a: AddendumRecord): AddendumDto {
  return {
    id: a.id,
    addendumNo: a.addendumNo,
    title: a.title,
    addendumDate: day(a.addendumDate),
    newPeriodEnd: dateOnly(a.newPeriodEnd),
    valueChange: numOrNull(a.valueChange),
    currency: a.currency,
    exchangeRate: numOrNull(a.exchangeRate),
    valueChangeIdr: numOrNull(a.valueChangeIdr),
    notes: a.notes,
    work: a.work,
    po: a.purchaseOrder,
  };
}

/** Latest end date including addendum extensions (YYYY-MM-DD). */
export function effectiveEnd(a: {
  periodEnd: Date;
  addendums: readonly { newPeriodEnd: Date | null }[];
}): string {
  return a.addendums.reduce(
    (end, ad) => (ad.newPeriodEnd && day(ad.newPeriodEnd) > end ? day(ad.newPeriodEnd) : end),
    day(a.periodEnd),
  );
}

export function toAgreementDto(a: AgreementRecord, today: string, actor: Actor): AgreementDto {
  const end = effectiveEnd(a);
  const { picId, ...work } = a.work;
  return {
    id: a.id,
    agreementNo: a.agreementNo,
    agreementType: a.agreementType,
    title: a.title,
    periodStart: day(a.periodStart),
    periodEnd: day(a.periodEnd),
    effectivePeriodEnd: end,
    daysLeft: Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000),
    status: a.status,
    amount: num(a.amount),
    currency: a.currency,
    exchangeRate: num(a.exchangeRate),
    amountIdr: num(a.amountIdr),
    vendor: a.vendor,
    pic: a.pic,
    work,
    po: a.purchaseOrder,
    addendums: a.addendums.map(toAddendumDto),
    extensions: a.extensions,
    canEdit: canModify({ picId }, actor),
  };
}
