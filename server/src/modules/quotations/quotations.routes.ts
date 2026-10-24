import { Router } from 'express';
import {
  idParamSchema,
  PROCUREMENT_READ_ROLES,
  quotationCreateSchema,
  quotationInputSchema,
  selectQuotationSchema,
} from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { uploadSingle } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './quotations.controller.js';

const canEdit = requireRole('PROCUREMENT');
const byId = validate({ params: idParamSchema });

export const quotationsRouter = Router();

quotationsRouter.use(requireRole(...PROCUREMENT_READ_ROLES));

/** Side-by-side comparison of every quotation for one PR (`:id` = PR id). */
quotationsRouter.get('/by-pr/:id', byId, controller.comparison);
quotationsRouter.post('/', canEdit, validate({ body: quotationCreateSchema }), controller.create);
quotationsRouter.put(
  '/:id',
  canEdit,
  validate({ params: idParamSchema, body: quotationInputSchema }),
  controller.update,
);
quotationsRouter.delete('/:id', canEdit, byId, controller.remove);
quotationsRouter.post('/:id/file', canEdit, uploadSingle('file'), byId, controller.uploadFile);
quotationsRouter.delete('/:id/file', canEdit, byId, controller.removeFile);
quotationsRouter.post(
  '/:id/select',
  canEdit,
  validate({ params: idParamSchema, body: selectQuotationSchema }),
  controller.select,
);
quotationsRouter.post('/:id/unselect', canEdit, byId, controller.unselect);
