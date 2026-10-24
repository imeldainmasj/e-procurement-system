import { Router } from 'express';
import { z } from 'zod';
import { approvalRuleInputSchema, idParamSchema } from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './approval-rules.controller.js';

const admin = requireRole('SUPER_ADMIN');
const resolveQuerySchema = z.object({ amount: z.coerce.number().min(0) });

export const approvalRulesRouter = Router();

approvalRulesRouter.get('/', controller.list);
approvalRulesRouter.get('/resolve', validate({ query: resolveQuerySchema }), controller.resolve);
approvalRulesRouter.get('/:id', validate({ params: idParamSchema }), controller.get);
approvalRulesRouter.post(
  '/',
  admin,
  validate({ body: approvalRuleInputSchema }),
  controller.create,
);
approvalRulesRouter.put(
  '/:id',
  admin,
  validate({ params: idParamSchema, body: approvalRuleInputSchema }),
  controller.update,
);
approvalRulesRouter.delete('/:id', admin, validate({ params: idParamSchema }), controller.remove);
