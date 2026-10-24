import { Router } from 'express';
import { idParamSchema, warehouseInputSchema, warehouseListQuerySchema } from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './warehouses.controller.js';

const admin = requireRole('SUPER_ADMIN');

export const warehousesRouter = Router();

warehousesRouter.get('/', validate({ query: warehouseListQuerySchema }), controller.list);
warehousesRouter.get('/:id', validate({ params: idParamSchema }), controller.get);
warehousesRouter.post('/', admin, validate({ body: warehouseInputSchema }), controller.create);
warehousesRouter.put(
  '/:id',
  admin,
  validate({ params: idParamSchema, body: warehouseInputSchema }),
  controller.update,
);
warehousesRouter.delete('/:id', admin, validate({ params: idParamSchema }), controller.remove);
