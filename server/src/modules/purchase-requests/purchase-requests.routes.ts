import { Router } from 'express';
import {
  idParamSchema,
  prInputSchema,
  prListQuerySchema,
  prStockCheckSchema,
  reasonSchema,
} from '@sipita/shared';
import { validate } from '../../middleware/validate.js';
import * as controller from './purchase-requests.controller.js';

// Permission checks depend on ownership and status, so they live in the service (shared PR rules).
export const purchaseRequestsRouter = Router();

const byId = validate({ params: idParamSchema });

purchaseRequestsRouter.get('/', validate({ query: prListQuerySchema }), controller.list);
purchaseRequestsRouter.post('/', validate({ body: prInputSchema }), controller.create);
purchaseRequestsRouter.get('/:id', byId, controller.get);
purchaseRequestsRouter.get('/:id/history', byId, controller.history);
purchaseRequestsRouter.put(
  '/:id',
  validate({ params: idParamSchema, body: prInputSchema }),
  controller.update,
);
purchaseRequestsRouter.delete('/:id', byId, controller.remove);
purchaseRequestsRouter.post('/:id/submit', byId, controller.submit);
purchaseRequestsRouter.post('/:id/start-stock-check', byId, controller.startStockCheck);
purchaseRequestsRouter.post(
  '/:id/stock-check',
  validate({ params: idParamSchema, body: prStockCheckSchema }),
  controller.completeStockCheck,
);
purchaseRequestsRouter.post(
  '/:id/cancel',
  validate({ params: idParamSchema, body: reasonSchema }),
  controller.cancel,
);
