import { Router } from 'express';
import {
  idParamSchema,
  resetPasswordSchema,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
} from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(requireRole('SUPER_ADMIN'));

usersRouter.get('/', validate({ query: userListQuerySchema }), controller.list);
usersRouter.get('/:id', validate({ params: idParamSchema }), controller.get);
usersRouter.post('/', validate({ body: userCreateSchema }), controller.create);
usersRouter.put(
  '/:id',
  validate({ params: idParamSchema, body: userUpdateSchema }),
  controller.update,
);
usersRouter.post(
  '/:id/reset-password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  controller.resetPassword,
);
usersRouter.delete('/:id', validate({ params: idParamSchema }), controller.remove);
