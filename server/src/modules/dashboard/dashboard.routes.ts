import { Router } from 'express';
import { DASHBOARD_ANALYTICS_ROLES, spendingQuerySchema, yearQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './dashboard.service.js';

type YearQuery = z.output<typeof yearQuerySchema>;
type SpendingQuery = z.output<typeof spendingQuerySchema>;

export const dashboardRouter = Router();

// Every role gets a summary scoped to what it may see.
dashboardRouter.get('/summary', async (req, res) => {
  sendSuccess(res, await service.summary(getActor(req)));
});

const analytics = requireRole(...DASHBOARD_ANALYTICS_ROLES);

dashboardRouter.get(
  '/spending',
  analytics,
  validate({ query: spendingQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as SpendingQuery;
    sendSuccess(res, await service.spending(q.groupBy, q.year));
  },
);

dashboardRouter.get(
  '/lead-time',
  analytics,
  validate({ query: yearQuerySchema }),
  async (req, res) => {
    sendSuccess(res, await service.leadTime((req.query as unknown as YearQuery).year));
  },
);

dashboardRouter.get(
  '/vendor-performance',
  analytics,
  validate({ query: yearQuerySchema }),
  async (req, res) => {
    sendSuccess(res, await service.vendorPerformance((req.query as unknown as YearQuery).year));
  },
);
