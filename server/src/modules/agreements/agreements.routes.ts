import { Router } from 'express';
import { z } from 'zod';
import {
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
