import type {
  AddendumPayload,
  AgreementDto,
  AgreementListQuery,
  AgreementOptionDto,
  AgreementPayload,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { amountInIdr } from '../../utils/money.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';
import { agreementStatus } from '../../utils/procurementRules.js';
import {
  assertHasMilestone,
  duplicateNumber,
  withWorkDocument,
  type DocWork,
} from '../documents/documents.service.js';
import { getSettings } from '../settings/settings.service.js';
import { canModify } from '../works/works.service.js';
import {
  addendumSelect,
  agreementSelect,
  effectiveEnd,
  toAddendumDto,
  toAgreementDto,
} from './agreements.dto.js';

const live = { deletedAt: null };
const today = () => dayjs().tz().format('YYYY-MM-DD');

function ruleError(code: string, message: string): AppError {
  return new AppError(422, code, message);
}

// ─── Status ──────────────────────────────────────────────────────────────────

/** Recomputes the stored status from the effective end date (also used by the daily job). */
export async function refreshAgreementStatus(
  tx: TxClient,
  agreementId: string,
  reminderDays: readonly number[],
): Promise<void> {
  const a = await tx.agreement.findUniqueOrThrow({
    where: { id: agreementId },
    select: {
      status: true,
      periodEnd: true,
      addendums: { where: live, select: { newPeriodEnd: true } },
    },
  });
  const status = agreementStatus(effectiveEnd(a), today(), reminderDays, a.status);
  if (status !== a.status)
    await tx.agreement.update({ where: { id: agreementId }, data: { status } });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const SORTABLE = ['agreementNo', 'title', 'periodEnd', 'periodStart', 'amountIdr', 'vendor.name'];

export async function list(q: AgreementListQuery, actor: Actor) {
  const where: Prisma.AgreementWhereInput = {
    ...live,
    ...(q.status && { status: q.status }),
    ...(q.vendorId && { vendorId: q.vendorId }),
    ...(q.picId && { picId: q.picId }),
    ...(q.mine && { picId: actor.userId }),
    ...(q.workId && { workId: q.workId }),
    ...(q.expiringWithin && {
      status: { not: 'TERMINATED' },
      periodEnd: {
        gte: new Date(today()),
        lte: new Date(dayjs().tz().add(q.expiringWithin, 'day').format('YYYY-MM-DD')),
      },
    }),
    ...(q.search && {
      OR: [
        { agreementNo: { contains: q.search, mode: 'insensitive' } },
        { title: { contains: q.search, mode: 'insensitive' } },
        { vendor: { name: { contains: q.search, mode: 'insensitive' } } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.agreement.findMany({
      where,
      select: agreementSelect,
      orderBy: buildOrderBy<Prisma.AgreementOrderByWithRelationInput>(q.sort, SORTABLE, {
        periodEnd: 'asc',
      }),
      ...pageArgs(q),
    }),
    prisma.agreement.count({ where }),
  ]);
  const t = today();
  return { data: rows.map((a) => toAgreementDto(a, t, actor)), meta: pageMeta(q, total) };
}

async function findOrThrow(db: TxClient, id: string) {
  const a = await db.agreement.findFirst({ where: { id, ...live }, select: agreementSelect });
  if (!a) throw AppError.notFound('Agreement tidak ditemukan');
  return a;
}

export async function get(id: string, actor: Actor): Promise<AgreementDto> {
  return toAgreementDto(await findOrThrow(prisma, id), today(), actor);
}

/**
 * Agreements that can be extended by a Perpanjangan Khusus: not terminated and still
 * running today. The exact "active on the Memo PK date" check happens on the memo.
 */
export async function options(search: string | undefined): Promise<AgreementOptionDto[]> {
  const rows = await prisma.agreement.findMany({
    where: {
      ...live,
      status: { not: 'TERMINATED' },
      periodEnd: { gte: new Date(today()) },
      ...(search && {
        OR: [
          { agreementNo: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { vendor: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    },
    select: {
      id: true,
      agreementNo: true,
      title: true,
      periodEnd: true,
      vendor: { select: { name: true } },
    },
    orderBy: { periodEnd: 'asc' },
    take: 50,
  });
  return rows.map((a) => ({
    id: a.id,
    agreementNo: a.agreementNo,
    title: a.title,
    vendorName: a.vendor.name,
    periodEnd: dayjs(a.periodEnd).format('YYYY-MM-DD'),
  }));
}

// ─── Agreement ───────────────────────────────────────────────────────────────

/** Which of the work's milestones an agreement completes, with the PK checks (§5.5 rule 5). */
function assertAgreementAllowed(work: DocWork): void {
  if (work.method === 'SPECIAL_EXTENSION') {
    if (!work.pkResult) {
      throw ruleError(
        'PK_RESULT_REQUIRED',
        'Pilih hasil PK (Addendum atau Agreement baru) di data pekerjaan sebelum mencatat dokumen akhir',
      );
    }
    if (work.pkResult !== 'NEW_AGREEMENT') {
      throw ruleError(
        'PK_RESULT_MISMATCH',
        'Hasil PK pekerjaan ini adalah Addendum; catat addendum pada kontrak sumber',
      );
    }
    assertHasMilestone(work, 'AGREEMENT_OR_ADDENDUM', 'Agreement');
  } else {
    assertHasMilestone(work, 'AGREEMENT', 'Agreement');
  }
}

async function checkAgreement(tx: TxClient, input: AgreementPayload, currentId?: string) {
  const notThis = currentId ? { NOT: { id: currentId } } : {};
  if (await tx.agreement.findFirst({ where: { agreementNo: input.agreementNo, ...notThis } })) {
    throw duplicateNumber('No. agreement', input.agreementNo);
  }
  const po = await tx.purchaseOrder.findFirst({
    where: { id: input.poId, workId: input.workId, ...live },
    select: { id: true },
  });
  if (!po) throw AppError.badRequest('PO tidak ditemukan pada pekerjaan ini');
  // 1 agreement ↔ 1 PO; the unique index also covers soft-deleted agreements.
  if (await tx.agreement.findFirst({ where: { poId: input.poId, ...notThis } })) {
    throw AppError.conflict('PO ini sudah dipakai agreement lain');
  }
  if (!(await tx.vendor.findFirst({ where: { id: input.vendorId, ...live } }))) {
    throw AppError.badRequest('Vendor tidak ditemukan');
  }
  if (!(await tx.user.findFirst({ where: { id: input.picId, ...live } }))) {
    throw AppError.badRequest('PIC tidak ditemukan');
  }
}

function agreementData(input: AgreementPayload, reminderDays: readonly number[]) {
  return {
    agreementNo: input.agreementNo,
    agreementType: input.agreementType,
    title: input.title,
    vendorId: input.vendorId,
    poId: input.poId,
    picId: input.picId,
    periodStart: new Date(input.periodStart),
    periodEnd: new Date(input.periodEnd),
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    amountIdr: amountInIdr(input.amount, input.exchangeRate),
    status: agreementStatus(input.periodEnd, today(), reminderDays),
  };
}

export async function create(input: AgreementPayload, actor: Actor): Promise<AgreementDto> {
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  const id = await withWorkDocument(
    input.workId,
    actor,
    `Agreement ${input.agreementNo} dicatat`,
    async (tx, work) => {
      assertAgreementAllowed(work);
      await checkAgreement(tx, input);
      const { id } = await tx.agreement.create({
        data: {
          workId: input.workId,
          ...agreementData(input, CONTRACT_REMINDER_DAYS),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      const after = await findOrThrow(tx, id);
      await writeAuditLog(tx, {
        actor,
        action: 'CREATE',
        entity: 'Agreement',
        entityId: id,
        after: toAgreementDto(after, today(), actor),
      });
      return id;
    },
  );
  return get(id, actor);
}

export async function update(
  id: string,
  input: AgreementPayload,
  actor: Actor,
): Promise<AgreementDto> {
  const before = await findOrThrow(prisma, id);
  if (before.work.id !== input.workId) {
    throw AppError.badRequest('Agreement tidak dapat dipindahkan ke pekerjaan lain');
  }
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  await withWorkDocument(
    input.workId,
    actor,
    `Agreement ${input.agreementNo} diperbarui`,
    async (tx) => {
      await checkAgreement(tx, input, id);
      const { status: _computed, ...data } = agreementData(input, CONTRACT_REMINDER_DAYS);
      await tx.agreement.update({ where: { id }, data: { ...data, updatedById: actor.userId } });
      await refreshAgreementStatus(tx, id, CONTRACT_REMINDER_DAYS);
      const after = await findOrThrow(tx, id);
      await writeAuditLog(tx, {
        actor,
        action: 'UPDATE',
        entity: 'Agreement',
        entityId: id,
        before: toAgreementDto(before, today(), actor),
        after: toAgreementDto(after, today(), actor),
      });
    },
  );
  return get(id, actor);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const before = await findOrThrow(prisma, id);
  if (before.addendums.length > 0 || before.extensions.length > 0) {
    throw AppError.conflict('Agreement sudah memiliki addendum atau menjadi kontrak sumber PK');
  }
  await withWorkDocument(before.work.id, actor, 'Agreement dihapus', async (tx) => {
    await tx.agreement.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Agreement',
      entityId: id,
      before: toAgreementDto(before, today(), actor),
    });
  });
}

/** Ending a contract early is a decision made outside SIPITA; it is only recorded here. */
export async function terminate(id: string, actor: Actor): Promise<AgreementDto> {
  const before = await findOrThrow(prisma, id);
  if (!canModify({ picId: before.work.picId }, actor)) {
    throw new AppError(
      403,
      'NOT_WORK_OWNER',
      'Anda hanya dapat mengubah kontrak dari pekerjaan Anda',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.agreement.update({
      where: { id },
      data: { status: 'TERMINATED', updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'STATUS_CHANGE',
      entity: 'Agreement',
      entityId: id,
      before: { status: before.status },
      after: { status: 'TERMINATED' },
    });
  });
  return get(id, actor);
}

// ─── Addendum ────────────────────────────────────────────────────────────────

/** Addendums come from a PK work with result ADDENDUM on its source agreement (§5.4). */
function assertAddendumAllowed(work: DocWork, agreementId: string): void {
  if (work.method !== 'SPECIAL_EXTENSION') {
    throw ruleError(
      'ADDENDUM_REQUIRES_PK',
      'Addendum hanya dicatat dari pekerjaan Perpanjangan Khusus',
    );
  }
  if (!work.pkResult) {
    throw ruleError(
      'PK_RESULT_REQUIRED',
      'Pilih hasil PK (Addendum atau Agreement baru) di data pekerjaan sebelum mencatat dokumen akhir',
    );
  }
  if (work.pkResult !== 'ADDENDUM') {
    throw ruleError(
      'PK_RESULT_MISMATCH',
      'Hasil PK pekerjaan ini adalah Agreement baru, bukan Addendum',
    );
  }
  if (work.sourceAgreementId !== agreementId) {
    throw ruleError('ADDENDUM_WRONG_AGREEMENT', 'Addendum harus dicatat pada kontrak sumber PK');
  }
}

async function checkAddendum(tx: TxClient, input: AddendumPayload, currentId?: string) {
  const notThis = currentId ? { NOT: { id: currentId } } : {};
  if (await tx.addendum.findFirst({ where: { addendumNo: input.addendumNo, ...notThis } })) {
    throw duplicateNumber('No. addendum', input.addendumNo);
  }
  if (
    input.poId &&
    !(await tx.purchaseOrder.findFirst({
      where: { id: input.poId, workId: input.workId, ...live },
    }))
  ) {
    throw AppError.badRequest('PO tidak ditemukan pada pekerjaan ini');
  }
}

function addendumData(input: AddendumPayload) {
  const hasValue = input.valueChange !== null;
  return {
    addendumNo: input.addendumNo,
    title: input.title,
    addendumDate: new Date(input.addendumDate),
    newPeriodEnd: input.newPeriodEnd ? new Date(input.newPeriodEnd) : null,
    valueChange: input.valueChange,
    currency: hasValue ? input.currency : null,
    exchangeRate: hasValue ? input.exchangeRate : null,
    valueChangeIdr: hasValue ? amountInIdr(input.valueChange!, input.exchangeRate) : null,
    poId: input.poId,
    notes: input.notes,
  };
}

export async function createAddendum(agreementId: string, input: AddendumPayload, actor: Actor) {
  await findOrThrow(prisma, agreementId);
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  await withWorkDocument(
    input.workId,
    actor,
    `Addendum ${input.addendumNo} dicatat`,
    async (tx, work) => {
      assertAddendumAllowed(work, agreementId);
      assertHasMilestone(work, 'AGREEMENT_OR_ADDENDUM', 'Addendum');
      await checkAddendum(tx, input);
      const addendum = await tx.addendum.create({
        data: {
          agreementId,
          workId: input.workId,
          ...addendumData(input),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
        select: addendumSelect,
      });
      await refreshAgreementStatus(tx, agreementId, CONTRACT_REMINDER_DAYS);
      await writeAuditLog(tx, {
        actor,
        action: 'CREATE',
        entity: 'Addendum',
        entityId: addendum.id,
        after: toAddendumDto(addendum),
      });
    },
  );
  return get(agreementId, actor);
}

async function findAddendum(tx: TxClient, agreementId: string, id: string) {
  const a = await tx.addendum.findFirst({
    where: { id, agreementId, ...live },
    select: { ...addendumSelect, workId: true },
  });
  if (!a) throw AppError.notFound('Addendum tidak ditemukan');
  return a;
}

export async function updateAddendum(
  agreementId: string,
  id: string,
  input: AddendumPayload,
  actor: Actor,
) {
  const before = await findAddendum(prisma, agreementId, id);
  if (before.workId !== input.workId) {
    throw AppError.badRequest('Addendum tidak dapat dipindahkan ke pekerjaan lain');
  }
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  await withWorkDocument(
    input.workId,
    actor,
    `Addendum ${input.addendumNo} diperbarui`,
    async (tx) => {
      await checkAddendum(tx, input, id);
      const addendum = await tx.addendum.update({
        where: { id },
        data: { ...addendumData(input), updatedById: actor.userId },
        select: addendumSelect,
      });
      await refreshAgreementStatus(tx, agreementId, CONTRACT_REMINDER_DAYS);
      await writeAuditLog(tx, {
        actor,
        action: 'UPDATE',
        entity: 'Addendum',
        entityId: id,
        before: toAddendumDto(before),
        after: toAddendumDto(addendum),
      });
    },
  );
  return get(agreementId, actor);
}

export async function deleteAddendum(agreementId: string, id: string, actor: Actor) {
  const before = await findAddendum(prisma, agreementId, id);
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  await withWorkDocument(before.workId, actor, 'Addendum dihapus', async (tx) => {
    await tx.addendum.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await refreshAgreementStatus(tx, agreementId, CONTRACT_REMINDER_DAYS);
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Addendum',
      entityId: id,
      before: toAddendumDto(before),
    });
  });
  return get(agreementId, actor);
}
