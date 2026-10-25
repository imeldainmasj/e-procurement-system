import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@sipita/shared';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/staff', requirePermission('DASHBOARD', 'view'), async (req, res) => {
  sendSuccess(res, await service.staffDashboard(getActor(req).userId));
});

// Team-wide numbers are for managers: the MONITORING feature is capped to manager levels.
dashboardRouter.get('/manager', requirePermission('MONITORING', 'view'), async (_req, res) => {
  sendSuccess(res, await service.managerDashboard());
});

export const monitoringRouter = Router();

monitoringRouter.use(requirePermission('MONITORING', 'view'));

monitoringRouter.get('/team', async (_req, res) => {
  sendSuccess(res, await service.team());
});

monitoringRouter.get('/board', async (_req, res) => {
  sendSuccess(res, await service.board());
});

monitoringRouter.get(
  '/staff/:userId',
  validate({ params: z.object({ userId: uuidSchema }) }),
  async (req, res) => {
    sendSuccess(res, await service.staff((req.params as { userId: string }).userId));
  },
);
