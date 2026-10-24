import { Router } from 'express';
import { idParamSchema, memoListQuerySchema } from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './memos.controller.js';
import { MEMO_ROLES } from './memos.service.js';

export const memosRouter = Router();

memosRouter.get(
  '/',
  requireRole(...MEMO_ROLES),
  validate({ query: memoListQuerySchema }),
  controller.list,
);
// Detail and PDF are also open to anyone who can see the PR (checked in the service).
memosRouter.get('/:id', validate({ params: idParamSchema }), controller.get);
memosRouter.get('/:id/pdf', validate({ params: idParamSchema }), controller.pdf);
