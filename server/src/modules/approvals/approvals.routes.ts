import { Router } from 'express';
import {
  approvalListQuerySchema,
  approveSchema,
  idParamSchema,
  rejectSchema,
} from '@sipita/shared';
import { validate } from '../../middleware/validate.js';
import * as controller from './approvals.controller.js';

// Level and ownership checks happen in the workflow; non-approvers simply get empty lists.
export const approvalsRouter = Router();

approvalsRouter.get('/', validate({ query: approvalListQuerySchema }), controller.list);
approvalsRouter.get('/pending-count', controller.pendingCount);
approvalsRouter.post(
  '/:id/approve',
  validate({ params: idParamSchema, body: approveSchema }),
  controller.approve,
);
approvalsRouter.post(
  '/:id/reject',
  validate({ params: idParamSchema, body: rejectSchema }),
  controller.reject,
);
