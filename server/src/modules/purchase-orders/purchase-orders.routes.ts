import { Router } from 'express';
import {
  idParamSchema,
  poCreateSchema,
  poListQuerySchema,
  poUpdateSchema,
  reasonSchema,
  vendorRatingInputSchema,
} from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './purchase-orders.controller.js';
import { PO_READ_ROLES } from './purchase-orders.service.js';

const canEdit = requireRole('PROCUREMENT');
const byId = validate({ params: idParamSchema });

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireRole(...PO_READ_ROLES));

purchaseOrdersRouter.get('/', validate({ query: poListQuerySchema }), controller.list);
purchaseOrdersRouter.post('/', canEdit, validate({ body: poCreateSchema }), controller.create);
purchaseOrdersRouter.get('/:id', byId, controller.get);
purchaseOrdersRouter.get('/:id/pdf', byId, controller.pdf);
purchaseOrdersRouter.put(
  '/:id',
  canEdit,
  validate({ params: idParamSchema, body: poUpdateSchema }),
  controller.update,
);
purchaseOrdersRouter.post('/:id/issue', canEdit, byId, controller.issue);
purchaseOrdersRouter.post(
  '/:id/cancel',
  canEdit,
  validate({ params: idParamSchema, body: reasonSchema }),
  controller.cancel,
);
purchaseOrdersRouter.post(
  '/:id/rating',
  canEdit,
  validate({ params: idParamSchema, body: vendorRatingInputSchema }),
  controller.rate,
);
