import { Router } from 'express';
import {
  idParamSchema,
  resetPasswordSchema,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
} from '@sipita/shared';
import { requireAdmin } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();

// Every signed-in user needs the user list for PIC pickers and filters.
usersRouter.get('/options', controller.options);

usersRouter.use(requireAdmin);

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
