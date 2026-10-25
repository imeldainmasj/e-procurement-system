import { Router } from 'express';
import { z } from 'zod';
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  addendumInputSchema,
  agreementInputSchema,
  agreementListQuerySchema,
  docParamsSchema,
  idParamSchema,
  type AddendumPayload,
  type AgreementListQuery,
  type AgreementPayload,
  type IdParam,
} from '@sipita/shared';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { exportPage, sendXlsx } from '../../utils/export.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './agreements.service.js';

export const agreementsRouter = Router();

const canView = requirePermission('AGREEMENT', 'view');
const canCreate = requirePermission('AGREEMENT', 'create');
const canUpdate = requirePermission('AGREEMENT', 'update');
const canDelete = requirePermission('AGREEMENT', 'delete');
const byId = validate({ params: idParamSchema });
const idOf = (params: unknown) => (params as IdParam).id;

// Source-agreement picker of the work form (Perpanjangan Khusus).
agreementsRouter.get(
  '/options',
  requirePermission('WORK', 'view'),
  validate({ query: z.object({ search: z.string().trim().min(1).optional() }) }),
  async (req, res) => {
    sendSuccess(res, await service.options((req.query as { search?: string }).search));
  },
);

agreementsRouter.get(
  '/',
  canView,
  validate({ query: agreementListQuerySchema }),
  async (req, res) => {
    const { data, meta } = await service.list(
      req.query as unknown as AgreementListQuery,
      getActor(req),
    );
    sendSuccess(res, data, meta);
  },
);
agreementsRouter.get(
  '/export',
  canView,
  validate({ query: agreementListQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as AgreementListQuery;
    const { data } = await service.list({ ...q, ...exportPage }, getActor(req));
    await sendXlsx(res, 'kontrak', {
      title: 'Daftar Kontrak',
      filters: [],
      tables: [
        {
          columns: [
            { key: 'agreementNo', label: 'No. Agreement', width: 22 },
            { key: 'title', label: 'Judul', width: 40 },
            { key: 'type', label: 'Jenis', width: 10 },
            { key: 'vendor', label: 'Vendor', width: 28 },
            { key: 'pic', label: 'PIC', width: 20 },
            { key: 'work', label: 'Pekerjaan', width: 15 },
            { key: 'poNo', label: 'No. PO', width: 16 },
            { key: 'periodStart', label: 'Mulai', kind: 'date', width: 12 },
            { key: 'periodEnd', label: 'Berakhir', kind: 'date', width: 12 },
            { key: 'effectiveEnd', label: 'Berakhir (+Addendum)', kind: 'date', width: 14 },
            { key: 'daysLeft', label: 'Sisa Hari', kind: 'int', width: 10 },
            { key: 'currency', label: 'Mata Uang', width: 10 },
            { key: 'amount', label: 'Nilai', kind: 'decimal', width: 18 },
            { key: 'amountIdr', label: 'Nilai (IDR)', kind: 'money', width: 20 },
            { key: 'addendums', label: 'Addendum', kind: 'int', width: 10 },
            { key: 'status', label: 'Status', width: 16 },
          ],
          rows: data.map((a) => ({
            agreementNo: a.agreementNo,
            title: a.title,
            type: AGREEMENT_TYPE_LABELS[a.agreementType],
            vendor: a.vendor.name,
            pic: a.pic.name,
            work: a.work.code,
            poNo: a.po.poNo,
            periodStart: a.periodStart,
            periodEnd: a.periodEnd,
            effectiveEnd: a.effectivePeriodEnd,
            daysLeft: a.daysLeft,
            currency: a.currency,
            amount: a.amount,
            amountIdr: a.amountIdr,
            addendums: a.addendums.length,
            status: AGREEMENT_STATUS_LABELS[a.status],
          })),
        },
      ],
    });
  },
);
agreementsRouter.get('/:id', canView, byId, async (req, res) => {
  sendSuccess(res, await service.get(idOf(req.params), getActor(req)));
});
// Ownership (the agreement's work) and the PK rules are checked in the service.
agreementsRouter.post(
  '/',
  canCreate,
  validate({ body: agreementInputSchema }),
  async (req, res) => {
    sendSuccess(
      res,
      await service.create(req.body as AgreementPayload, getActor(req)),
      undefined,
      201,
    );
  },
);
agreementsRouter.put(
  '/:id',
  canUpdate,
  validate({ params: idParamSchema, body: agreementInputSchema }),
  async (req, res) => {
    sendSuccess(
      res,
      await service.update(idOf(req.params), req.body as AgreementPayload, getActor(req)),
    );
  },
);
agreementsRouter.delete('/:id', canDelete, byId, async (req, res) => {
  await service.remove(idOf(req.params), getActor(req));
  sendSuccess(res, null);
});
agreementsRouter.post('/:id/terminate', canUpdate, byId, async (req, res) => {
  sendSuccess(res, await service.terminate(idOf(req.params), getActor(req)));
});

agreementsRouter.post(
  '/:id/addendums',
  canUpdate,
  validate({ params: idParamSchema, body: addendumInputSchema }),
  async (req, res) => {
    sendSuccess(
      res,
      await service.createAddendum(idOf(req.params), req.body as AddendumPayload, getActor(req)),
      undefined,
      201,
    );
  },
);
agreementsRouter.put(
  '/:id/addendums/:docId',
  canUpdate,
  validate({ params: docParamsSchema, body: addendumInputSchema }),
  async (req, res) => {
    const { id, docId } = req.params as { id: string; docId: string };
    sendSuccess(
      res,
      await service.updateAddendum(id, docId, req.body as AddendumPayload, getActor(req)),
    );
  },
);
agreementsRouter.delete(
  '/:id/addendums/:docId',
  canDelete,
  validate({ params: docParamsSchema }),
  async (req, res) => {
    const { id, docId } = req.params as { id: string; docId: string };
    sendSuccess(res, await service.deleteAddendum(id, docId, getActor(req)));
  },
);
