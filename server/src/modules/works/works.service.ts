import {
  isManager,
  milestoneLabel,
  type DataIssue,
  type MilestoneStatus,
  type MilestoneTemplateDto,
  type MilestoneUpdatePayload,
  type ProcurementMethod,
  type RuleEvaluationDto,
  type StageDto,
  type WorkCreatePayload,
  type WorkDetailDto,
  type WorkListItemDto,
  type WorkListQuery,
  type WorkMilestoneDto,
  type WorkUpdateDto,
  type WorkUpdatePayload,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { amountInIdr, num, numOrNull } from '../../utils/money.js';
import { nextWorkCode } from '../../utils/numbering.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';
import {
  computeIncreasePercent,
  currentStages,
  DOCUMENT_MILESTONES,
  finalMilestone,
  isPvpRequired,
  isStale,
  missingPrerequisites,
  staleCutoff,
  suggestMethod,
  type RuleSettings,
} from '../../utils/procurementRules.js';
import {
  attachmentSelect,
  createAttachment,
  toAttachmentDto,
  withStoredFile,
  type UploadedFile,
} from '../attachments/attachments.service.js';
import { activeFor } from '../milestone-templates/milestone-templates.service.js';
import { getSettings } from '../settings/settings.service.js';
import { refreshWorkIssues } from './work-state.js';

const ENTITY = 'Work';
const active = { deletedAt: null };

// ─── Selects & DTOs ──────────────────────────────────────────────────────────

const milestoneSelect = {
  id: true,
  type: true,
  sequence: true,
  executor: true,
  status: true,
  isConditional: true,
  prerequisites: true,
  startedAt: true,
  completedAt: true,
  referenceNo: true,
  notes: true,
} satisfies Prisma.WorkMilestoneSelect;

const ref = { select: { id: true, name: true } } as const;
const codeRef = { select: { id: true, code: true, name: true } } as const;

const listSelect = {
  id: true,
  code: true,
  title: true,
  procurementType: true,
  category: true,
  method: true,
  procurementYear: true,
  picId: true,
  amount: true,
  currency: true,
  amountIdr: true,
  status: true,
  pvpRequired: true,
  lastUpdatedAt: true,
  dataIssues: true,
  pic: ref,
  vendor: codeRef,
  requesterDirectorate: codeRef,
  milestones: { select: milestoneSelect, orderBy: [{ sequence: 'asc' }, { type: 'asc' }] },
} satisfies Prisma.WorkSelect;

const detailSelect = {
  ...listSelect,
  exchangeRate: true,
  previousPurchaseAmount: true,
  increasePercent: true,
  periodStart: true,
  periodEnd: true,
  pkResult: true,
  notes: true,
  sourceAgreementId: true,
  createdAt: true,
  updatedAt: true,
  sourceAgreement: { select: { id: true, agreementNo: true, title: true, periodEnd: true } },
} satisfies Prisma.WorkSelect;

type ListRecord = Prisma.WorkGetPayload<{ select: typeof listSelect }>;
type DetailRecord = Prisma.WorkGetPayload<{ select: typeof detailSelect }>;
type MilestoneRecord = ListRecord['milestones'][number];

export const dateOnly = (d: Date | null) => (d ? dayjs(d).format('YYYY-MM-DD') : null);

function toStage(m: MilestoneRecord, method: ProcurementMethod): StageDto {
  return {
    type: m.type,
    label: milestoneLabel(m.type, method),
    executor: m.executor,
    status: m.status,
  };
}

function toListItem(w: ListRecord, settings: RuleSettings): WorkListItemDto {
  const applicable = w.milestones.filter((m) => m.status !== 'NOT_APPLICABLE');
  return {
    id: w.id,
    code: w.code,
    title: w.title,
    procurementType: w.procurementType,
    category: w.category,
    method: w.method,
    procurementYear: w.procurementYear,
    pic: w.pic,
    vendor: w.vendor,
    requesterDirectorate: w.requesterDirectorate,
    amount: num(w.amount),
    currency: w.currency,
    amountIdr: num(w.amountIdr),
    status: w.status,
    pvpRequired: w.pvpRequired,
    lastUpdatedAt: iso(w.lastUpdatedAt),
    isStale: isStale(w, settings),
    currentStages:
      w.status === 'ACTIVE' || w.status === 'ON_HOLD'
        ? currentStages(w.milestones).map((m) => toStage(m, w.method))
        : [],
    progress: {
      done: applicable.filter((m) => m.status === 'DONE').length,
      total: applicable.length,
    },
    issues: w.dataIssues as unknown as DataIssue[],
  };
}

function toMilestoneDto(m: MilestoneRecord, all: MilestoneRecord[], method: ProcurementMethod) {
  return {
    id: m.id,
    type: m.type,
    label: milestoneLabel(m.type, method),
    sequence: m.sequence,
    executor: m.executor,
    status: m.status,
    isConditional: m.isConditional,
    prerequisites: m.prerequisites,
    missingPrerequisites: missingPrerequisites(m, all),
    startedAt: dateOnly(m.startedAt),
    completedAt: dateOnly(m.completedAt),
    referenceNo: m.referenceNo,
    notes: m.notes,
  } satisfies WorkMilestoneDto;
}

function toDetail(w: DetailRecord, settings: RuleSettings, actor: Actor): WorkDetailDto {
  const owner = canModify(w, actor);
  return {
    ...toListItem(w, settings),
    exchangeRate: num(w.exchangeRate),
    previousPurchaseAmount: numOrNull(w.previousPurchaseAmount),
    increasePercent: numOrNull(w.increasePercent),
    suggestedMethod: suggestMethod(num(w.amountIdr), settings),
    periodStart: dateOnly(w.periodStart),
    periodEnd: dateOnly(w.periodEnd),
    sourceAgreement: w.sourceAgreement && {
      ...w.sourceAgreement,
      periodEnd: dateOnly(w.sourceAgreement.periodEnd)!,
    },
    pkResult: w.pkResult,
    notes: w.notes,
    milestones: w.milestones.map((m) => toMilestoneDto(m, w.milestones, w.method)),
    access: { canEdit: owner, canDelete: owner, canReassign: isManagerActor(actor) },
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

// ─── Ownership (CLAUDE.md §4) ────────────────────────────────────────────────

/** Admins act with manager rights on works. */
export function isManagerActor(actor: Actor): boolean {
  return actor.isAdmin || isManager(actor.jobLevel);
}

export function canModify(work: { picId: string }, actor: Actor): boolean {
  return isManagerActor(actor) || work.picId === actor.userId;
}

export function assertCanModify(work: { picId: string }, actor: Actor): void {
  if (!canModify(work, actor)) {
    throw new AppError(403, 'NOT_WORK_OWNER', 'Anda hanya dapat mengubah pekerjaan milik Anda');
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const SORTABLE = [
  'code',
  'title',
  'procurementYear',
  'amountIdr',
  'status',
  'lastUpdatedAt',
  'createdAt',
  'pic.name',
  'vendor.name',
] as const;

function listWhere(q: WorkListQuery, settings: RuleSettings): Prisma.WorkWhereInput {
  const and: Prisma.WorkWhereInput[] = [];
  if (q.search) {
    const contains = { contains: q.search, mode: 'insensitive' as const };
    and.push({
      OR: [{ code: contains }, { title: contains }, { vendor: { name: contains } }],
    });
  }
  if (q.hasIssues !== undefined) {
    const staleNow = { status: 'ACTIVE' as const, lastUpdatedAt: { lt: staleCutoff(settings) } };
    and.push(
      q.hasIssues
        ? { OR: [{ hasDataIssues: true }, staleNow] }
        : { hasDataIssues: false, NOT: staleNow },
    );
  }
  if (q.stale !== undefined) {
    const staleNow = { status: 'ACTIVE' as const, lastUpdatedAt: { lt: staleCutoff(settings) } };
    and.push(q.stale ? staleNow : { NOT: staleNow });
  }
  return {
    ...active,
    ...(q.year !== undefined && { procurementYear: q.year }),
    ...((q.yearFrom !== undefined || q.yearTo !== undefined) && {
      procurementYear: { gte: q.yearFrom, lte: q.yearTo },
    }),
    ...(q.method && { method: q.method }),
    ...(q.procurementType && { procurementType: q.procurementType }),
    ...(q.category && { category: q.category }),
    ...(q.vendorId && { vendorId: q.vendorId }),
    ...(q.picId && { picId: q.picId }),
    ...(q.requesterDirectorateId && { requesterDirectorateId: q.requesterDirectorateId }),
    ...(q.status && { status: q.status }),
    ...(and.length > 0 && { AND: and }),
  };
}

export async function list(q: WorkListQuery) {
  const settings = await getSettings();
  const where = listWhere(q, settings);
  const [rows, total] = await prisma.$transaction([
    prisma.work.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy<Prisma.WorkOrderByWithRelationInput>(q.sort, SORTABLE, {
        lastUpdatedAt: 'desc',
      }),
      ...pageArgs(q),
    }),
    prisma.work.count({ where }),
  ]);
  return { data: rows.map((w) => toListItem(w, settings)), meta: pageMeta(q, total) };
}

async function findOrThrow(db: TxClient, id: string): Promise<DetailRecord> {
  const work = await db.work.findFirst({ where: { id, ...active }, select: detailSelect });
  if (!work) throw AppError.notFound('Pekerjaan tidak ditemukan');
  return work;
}

export async function get(id: string, actor: Actor): Promise<WorkDetailDto> {
  const [work, settings] = await Promise.all([findOrThrow(prisma, id), getSettings()]);
  return toDetail(work, settings, actor);
}

export async function evaluateRules(
  amountIdr: number,
  previousPurchaseAmount: number | undefined,
): Promise<RuleEvaluationDto> {
  const settings = await getSettings();
  const increasePercent = computeIncreasePercent(amountIdr, previousPurchaseAmount ?? null);
  return {
    suggestedMethod: suggestMethod(amountIdr, settings),
    increasePercent,
    pvpRequired: isPvpRequired(amountIdr, increasePercent, settings),
  };
}

// ─── Create / update / delete ────────────────────────────────────────────────

/** Milestones for a new work; conditional ones (PVP*) are N/A when PVP is not required. */
export function milestonesFromTemplate(templates: MilestoneTemplateDto[], pvpRequired: boolean) {
  return templates.map((t) => ({
    type: t.type,
    sequence: t.sequence,
    executor: t.executor,
    prerequisites: t.prerequisites,
    isConditional: t.isConditional,
    status: (t.isConditional && !pvpRequired ? 'NOT_APPLICABLE' : 'NOT_STARTED') as MilestoneStatus,
  }));
}

/** Derived money and PVP fields shared by create and update. */
function derivedFields(input: WorkCreatePayload, settings: RuleSettings) {
  const amountIdr = amountInIdr(input.amount, input.exchangeRate);
  const increasePercent = computeIncreasePercent(num(amountIdr), input.previousPurchaseAmount);
  return {
    amountIdr,
    increasePercent,
    pvpRequired: isPvpRequired(num(amountIdr), increasePercent, settings),
  };
}

async function assertReferences(db: TxClient, input: WorkCreatePayload): Promise<void> {
  const pic = await db.user.findFirst({ where: { id: input.picId, ...active, isActive: true } });
  if (!pic) throw AppError.badRequest('PIC tidak ditemukan atau tidak aktif');
  if (
    input.vendorId &&
    !(await db.vendor.findFirst({ where: { id: input.vendorId, ...active } }))
  ) {
    throw AppError.badRequest('Vendor tidak ditemukan');
  }
  if (
    input.requesterDirectorateId &&
    !(await db.directorate.findFirst({ where: { id: input.requesterDirectorateId, ...active } }))
  ) {
    throw AppError.badRequest('Direktorat peminta tidak ditemukan');
  }
  if (
    input.sourceAgreementId &&
    !(await db.agreement.findFirst({ where: { id: input.sourceAgreementId, ...active } }))
  ) {
    throw AppError.badRequest('Kontrak sumber tidak ditemukan');
  }
}

function workData(input: WorkCreatePayload) {
  return {
    title: input.title,
    procurementType: input.procurementType,
    category: input.category,
    method: input.method,
    procurementYear: input.procurementYear,
    picId: input.picId,
    requesterDirectorateId: input.requesterDirectorateId,
    vendorId: input.vendorId,
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    previousPurchaseAmount: input.previousPurchaseAmount,
    periodStart: input.periodStart ? new Date(input.periodStart) : null,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    sourceAgreementId: input.sourceAgreementId,
    pkResult: input.pkResult,
    notes: input.notes,
  };
}

export async function create(input: WorkCreatePayload, actor: Actor): Promise<WorkDetailDto> {
  // Staff create works for themselves; managers may assign any PIC.
  if (!isManagerActor(actor) && input.picId !== actor.userId) {
    throw new AppError(
      403,
      'NOT_WORK_OWNER',
      'Staff hanya dapat membuat pekerjaan untuk dirinya sendiri',
    );
  }
  const settings = await getSettings();
  const work = await prisma.$transaction(async (tx) => {
    await assertReferences(tx, input);
    const templates = await activeFor(tx, input.method);
    if (templates.length === 0) {
      throw AppError.badRequest('Template milestone untuk metode ini belum diatur');
    }
    const derived = derivedFields(input, settings);
    const created = await tx.work.create({
      data: {
        ...workData(input),
        ...derived,
        code: await nextWorkCode(tx, input.procurementYear),
        createdById: actor.userId,
        updatedById: actor.userId,
        milestones: { create: milestonesFromTemplate(templates, derived.pvpRequired) },
      },
      select: { id: true },
    });
    await tx.workUpdate.create({
      data: { workId: created.id, authorId: actor.userId, note: 'Pekerjaan dibuat' },
    });
    await refreshWorkIssues(tx, created.id, settings);
    const saved = await findOrThrow(tx, created.id);
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: toDetail(saved, settings, actor),
    });
    return saved;
  });
  return toDetail(work, settings, actor);
}

const isUntouched = (m: { status: MilestoneStatus }) =>
  m.status === 'NOT_STARTED' || m.status === 'NOT_APPLICABLE';

export async function update(
  id: string,
  input: WorkUpdatePayload,
  actor: Actor,
): Promise<WorkDetailDto> {
  const settings = await getSettings();
  const work = await prisma.$transaction(async (tx) => {
    const before = await findOrThrow(tx, id);
    assertCanModify(before, actor);
    if (input.picId !== before.picId && !isManagerActor(actor)) {
      throw new AppError(403, 'NOT_WORK_OWNER', 'Hanya manager yang dapat mengganti PIC');
    }
    await assertReferences(tx, input);

    // COMPLETED only once the final milestone is DONE (§5.7).
    if (input.status === 'COMPLETED' && before.status !== 'COMPLETED') {
      const last = finalMilestone(before.milestones);
      if (last && last.status !== 'DONE') {
        throw new AppError(
          422,
          'WORK_NOT_FINISHED',
          `Pekerjaan belum dapat diselesaikan: ${milestoneLabel(last.type, before.method)} belum selesai`,
        );
      }
    }

    const derived = derivedFields(input, settings);
    let milestones: Prisma.WorkUpdateInput['milestones'];

    if (input.method !== before.method) {
      // Milestones follow the method's template; only rebuildable while nothing has started.
      if (!before.milestones.every(isUntouched)) {
        throw new AppError(
          422,
          'METHOD_LOCKED',
          'Metode tidak dapat diubah karena sudah ada milestone yang berjalan atau selesai',
        );
      }
      const templates = await activeFor(tx, input.method);
      milestones = {
        deleteMany: {},
        create: milestonesFromTemplate(templates, derived.pvpRequired),
      };
    } else if (derived.pvpRequired !== before.pvpRequired) {
      // Toggle an untouched PVP between NOT_STARTED and NOT_APPLICABLE.
      const pvp = before.milestones.find((m) => m.isConditional && isUntouched(m));
      if (pvp) {
        milestones = {
          update: {
            where: { id: pvp.id },
            data: { status: derived.pvpRequired ? 'NOT_STARTED' : 'NOT_APPLICABLE' },
          },
        };
      }
    }

    await tx.work.update({
      where: { id },
      data: {
        ...workData(input),
        ...derived,
        status: input.status,
        updatedById: actor.userId,
        lastUpdatedAt: new Date(),
        ...(milestones && { milestones }),
      },
    });
    if (input.status !== before.status) {
      await tx.workUpdate.create({
        data: {
          workId: id,
          authorId: actor.userId,
          note: `Status pekerjaan diubah dari ${before.status} ke ${input.status}`,
        },
      });
    }
    await refreshWorkIssues(tx, id, settings);
    const after = await findOrThrow(tx, id);
    await writeAuditLog(tx, {
      actor,
      action: input.status !== before.status ? 'STATUS_CHANGE' : 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDetail(before, settings, actor),
      after: toDetail(after, settings, actor),
    });
    return after;
  });
  return toDetail(work, settings, actor);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    const work = await findOrThrow(tx, id);
    assertCanModify(work, actor);
    await tx.work.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDetail(work, settings, actor),
    });
  });
}

export async function reassign(
  id: string,
  picId: string,
  note: string | null,
  actor: Actor,
): Promise<WorkDetailDto> {
  if (!isManagerActor(actor)) throw AppError.forbidden('Hanya manager yang dapat mengganti PIC');
  const settings = await getSettings();
  const work = await prisma.$transaction(async (tx) => {
    const before = await findOrThrow(tx, id);
    if (before.picId === picId) throw AppError.badRequest('PIC baru sama dengan PIC saat ini');
    const pic = await tx.user.findFirst({ where: { id: picId, ...active, isActive: true } });
    if (!pic) throw AppError.badRequest('PIC tidak ditemukan atau tidak aktif');

    await tx.work.update({
      where: { id },
      data: { picId, updatedById: actor.userId, lastUpdatedAt: new Date() },
    });
    await tx.workUpdate.create({
      data: {
        workId: id,
        authorId: actor.userId,
        note: `PIC diganti dari ${before.pic.name} ke ${pic.name}${note ? `. ${note}` : ''}`,
      },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'REASSIGN',
      entity: ENTITY,
      entityId: id,
      before: { pic: before.pic },
      after: { pic: { id: pic.id, name: pic.name }, note },
    });
    return findOrThrow(tx, id);
  });
  return toDetail(work, settings, actor);
}

// ─── Milestones ──────────────────────────────────────────────────────────────

function ruleError(code: string, message: string): AppError {
  return new AppError(422, code, message);
}

/**
 * Status change of one milestone through the app, with the blocking rules of §5.5.
 * Document-backed milestones only move between NOT_STARTED and IN_PROGRESS here; they
 * become DONE when their document is recorded (rule 8). Writes a progress log entry,
 * bumps lastUpdatedAt and refreshes the data issues.
 */
export async function updateMilestone(
  workId: string,
  milestoneId: string,
  input: MilestoneUpdatePayload,
  actor: Actor,
): Promise<WorkDetailDto> {
  const settings = await getSettings();
  const work = await prisma.$transaction(async (tx) => {
    const w = await findOrThrow(tx, workId);
    assertCanModify(w, actor);
    if (w.status === 'CANCELLED' || w.status === 'COMPLETED') {
      throw ruleError('WORK_CLOSED', 'Pekerjaan yang sudah selesai/dibatalkan tidak dapat diubah');
    }
    const m = w.milestones.find((x) => x.id === milestoneId);
    if (!m) throw AppError.notFound('Milestone tidak ditemukan');
    const label = milestoneLabel(m.type, w.method);

    if (input.status === 'NOT_APPLICABLE' || m.status === 'NOT_APPLICABLE') {
      if (input.status !== m.status) {
        throw ruleError(
          'MILESTONE_NOT_APPLICABLE',
          'Status "Tidak Berlaku" ditentukan otomatis dari aturan PVP',
        );
      }
    }

    if (DOCUMENT_MILESTONES.has(m.type)) {
      if (input.status === 'DONE' && m.status !== 'DONE') {
        throw ruleError(
          'MILESTONE_REQUIRES_DOCUMENT',
          `${label} selesai otomatis saat dokumennya dicatat di tab Dokumen`,
        );
      }
      if (m.status === 'DONE' && input.status !== 'DONE') {
        throw ruleError(
          'MILESTONE_REQUIRES_DOCUMENT',
          `${label} sudah memiliki dokumen; ubah atau hapus dokumennya untuk membuka kembali`,
        );
      }
    }

    if (input.status === 'IN_PROGRESS' || input.status === 'DONE') {
      const missing = missingPrerequisites(m, w.milestones);
      if (missing.length > 0) {
        throw ruleError(
          'MILESTONE_PREREQUISITE_NOT_MET',
          `${label} belum dapat dimulai: tunggu ${missing.map((t) => milestoneLabel(t, w.method)).join(', ')} selesai`,
        );
      }
    }

    // Reopening is blocked while a milestone that depends on this one is under way.
    if (m.status === 'DONE' && input.status !== 'DONE') {
      const dependent = w.milestones.find(
        (x) =>
          x.prerequisites.includes(m.type) && (x.status === 'DONE' || x.status === 'IN_PROGRESS'),
      );
      if (dependent) {
        throw ruleError(
          'MILESTONE_HAS_DEPENDENTS',
          `${label} tidak dapat dibuka kembali karena ${milestoneLabel(dependent.type, w.method)} sudah berjalan`,
        );
      }
    }

    // A document-backed milestone keeps the date of its document.
    const completedAt =
      input.status !== 'DONE'
        ? null
        : DOCUMENT_MILESTONES.has(m.type)
          ? m.completedAt
          : new Date(input.completedAt ?? dayjs().tz().format('YYYY-MM-DD'));

    const startedAt =
      input.status === 'NOT_STARTED'
        ? null
        : input.startedAt
          ? new Date(input.startedAt)
          : (m.startedAt ?? completedAt ?? new Date(dayjs().tz().format('YYYY-MM-DD')));

    await tx.workMilestone.update({
      where: { id: milestoneId },
      data: {
        status: input.status,
        startedAt,
        completedAt,
        referenceNo: input.referenceNo,
        notes: input.notes,
        updatedById: actor.userId,
      },
    });
    await tx.workUpdate.create({
      data: {
        workId,
        milestoneId,
        authorId: actor.userId,
        note: input.note ?? `${label} diperbarui`,
        ...(input.status !== m.status && { statusFrom: m.status, statusTo: input.status }),
      },
    });
    await tx.work.update({
      where: { id: workId },
      data: { lastUpdatedAt: new Date(), updatedById: actor.userId },
    });
    await refreshWorkIssues(tx, workId, settings);
    await writeAuditLog(tx, {
      actor,
      action: input.status !== m.status ? 'STATUS_CHANGE' : 'UPDATE',
      entity: 'WorkMilestone',
      entityId: milestoneId,
      before: m,
      after: { ...input, workId },
    });
    return findOrThrow(tx, workId);
  });
  return toDetail(work, settings, actor);
}

// ─── Progress log ────────────────────────────────────────────────────────────

export const updateSelect = {
  id: true,
  note: true,
  statusFrom: true,
  statusTo: true,
  createdAt: true,
  author: ref,
  milestone: { select: { id: true, type: true } },
  attachment: { select: attachmentSelect },
  work: { select: { method: true } },
} satisfies Prisma.WorkUpdateSelect;

type UpdateRecord = Prisma.WorkUpdateGetPayload<{ select: typeof updateSelect }>;

export function toUpdateDto(u: UpdateRecord): WorkUpdateDto {
  return {
    id: u.id,
    note: u.note,
    milestone: u.milestone && {
      ...u.milestone,
      label: milestoneLabel(u.milestone.type, u.work.method),
    },
    statusFrom: u.statusFrom,
    statusTo: u.statusTo,
    author: u.author,
    attachment: u.attachment && toAttachmentDto(u.attachment),
    createdAt: iso(u.createdAt),
  };
}

export async function listUpdates(workId: string, q: { page: number; limit: number }) {
  await findOrThrow(prisma, workId);
  const where = { workId };
  const [rows, total] = await prisma.$transaction([
    prisma.workUpdate.findMany({
      where,
      select: updateSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(q),
    }),
    prisma.workUpdate.count({ where }),
  ]);
  return { data: rows.map(toUpdateDto), meta: pageMeta(q, total) };
}

/** Append-only progress note; corrections are written as a new note (§6). */
export async function addUpdate(
  workId: string,
  input: { note: string; milestoneId: string | null },
  file: UploadedFile | undefined,
  actor: Actor,
): Promise<WorkUpdateDto> {
  const settings = await getSettings();
  const persist = (stored?: { path: string; attachmentId: string }) =>
    prisma.$transaction(async (tx) => {
      const work = await findOrThrow(tx, workId);
      assertCanModify(work, actor);
      if (input.milestoneId && !work.milestones.some((m) => m.id === input.milestoneId)) {
        throw AppError.badRequest('Milestone tidak ditemukan pada pekerjaan ini');
      }
      const { id } = await tx.workUpdate.create({
        data: { workId, milestoneId: input.milestoneId, authorId: actor.userId, note: input.note },
      });
      if (file && stored) {
        await createAttachment(tx, file, stored, { type: 'WorkUpdate', id }, actor);
        await tx.workUpdate.update({ where: { id }, data: { attachmentId: stored.attachmentId } });
      }
      await tx.work.update({ where: { id: workId }, data: { lastUpdatedAt: new Date() } });
      await refreshWorkIssues(tx, workId, settings);
      return tx.workUpdate.findUniqueOrThrow({ where: { id }, select: updateSelect });
    });

  const created = file ? await withStoredFile(file, persist) : await persist();
  return toUpdateDto(created);
}
