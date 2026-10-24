import { Router } from 'express';
import { idParamSchema, PROCUREMENT_READ_ROLES, priceHistoryQuerySchema } from '@sipita/shared';
import type { IdParam } from '@sipita/shared';
import type { z } from 'zod';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './price-history.service.js';

export const priceHistoryRouter = Router();

priceHistoryRouter.use(requireRole(...PROCUREMENT_READ_ROLES));

priceHistoryRouter.get('/', validate({ query: priceHistoryQuerySchema }), async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof priceHistoryQuerySchema>,
  );
  sendSuccess(res, data, meta);
});

priceHistoryRouter.get(
  '/items/:id/summary',
  validate({ params: idParamSchema }),
  async (req, res) => {
    sendSuccess(res, await service.itemSummary((req.params as IdParam).id));
  },
);
