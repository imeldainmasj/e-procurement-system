import { Router } from 'express';
import { divisionInputSchema, divisionListQuerySchema, idParamSchema } from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './divisions.controller.js';

export const divisionsRouter = Router();

// Read access for every signed-in user (forms need the division list).
divisionsRouter.get('/', validate({ query: divisionListQuerySchema }), controller.list);
divisionsRouter.get('/:id', validate({ params: idParamSchema }), controller.get);

divisionsRouter.post(
  '/',
  requireRole('SUPER_ADMIN'),
  validate({ body: divisionInputSchema }),
  controller.create,
);
divisionsRouter.put(
  '/:id',
  requireRole('SUPER_ADMIN'),
  validate({ params: idParamSchema, body: divisionInputSchema }),
  controller.update,
);
divisionsRouter.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  validate({ params: idParamSchema }),
  controller.remove,
);
