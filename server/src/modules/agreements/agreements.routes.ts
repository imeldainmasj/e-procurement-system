import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './agreements.service.js';

export const agreementsRouter = Router();

// Source-agreement picker of the work form (Perpanjangan Khusus).
agreementsRouter.get(
  '/options',
  requirePermission('WORK', 'view'),
  validate({ query: z.object({ search: z.string().trim().min(1).optional() }) }),
  async (req, res) => {
    sendSuccess(res, await service.options((req.query as { search?: string }).search));
  },
);
