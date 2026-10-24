import { Router } from 'express';
import { idParamSchema, vendorInputSchema, vendorListQuerySchema } from '@sipita/shared';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './vendors.controller.js';

const byId = validate({ params: idParamSchema });

export const vendorsRouter = Router();

vendorsRouter.get(
  '/',
  requirePermission('VENDOR', 'view'),
  validate({ query: vendorListQuerySchema }),
  controller.list,
);
vendorsRouter.get('/:id', requirePermission('VENDOR', 'view'), byId, controller.get);
vendorsRouter.post(
  '/',
  requirePermission('VENDOR', 'create'),
  validate({ body: vendorInputSchema }),
  controller.create,
);
vendorsRouter.put(
  '/:id',
  requirePermission('VENDOR', 'update'),
  validate({ params: idParamSchema, body: vendorInputSchema }),
  controller.update,
);
vendorsRouter.delete('/:id', requirePermission('VENDOR', 'delete'), byId, controller.remove);
