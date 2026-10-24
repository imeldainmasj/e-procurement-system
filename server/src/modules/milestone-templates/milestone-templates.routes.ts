import { Router } from 'express';
import {
  methodParamSchema,
  milestoneTemplateInputSchema,
  type MilestoneTemplatePayload,
  type ProcurementMethod,
} from '@sipita/shared';
import { requireAdmin } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './milestone-templates.service.js';

export const milestoneTemplatesRouter = Router();

// Readable by everyone (the work form shows which milestones a method will create).
milestoneTemplatesRouter.get('/', async (_req, res) => {
  sendSuccess(res, await service.list());
});

milestoneTemplatesRouter.put(
  '/:method',
  requireAdmin,
  validate({ params: methodParamSchema, body: milestoneTemplateInputSchema }),
  async (req, res) => {
    const { method } = req.params as { method: ProcurementMethod };
    sendSuccess(
      res,
      await service.replace(method, req.body as MilestoneTemplatePayload, getActor(req)),
    );
  },
);
