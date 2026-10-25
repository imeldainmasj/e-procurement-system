import { Router } from 'express';
import { z } from 'zod';
import {
  evaluateRulesQuerySchema,
  idParamSchema,
  milestoneParamsSchema,
  milestoneUpdateSchema,
  reassignSchema,
  workCreateSchema,
  workListQuerySchema,
  workUpdateLogSchema,
  workUpdateSchema,
} from '@sipita/shared';
import { requirePermission } from '../../middleware/permission.js';
import { uploadSingle } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { registerAttachmentAccess } from '../attachments/attachments.service.js';
import * as controller from './works.controller.js';

// Every IT SAPM member may read all procurement data, including progress attachments.
registerAttachmentAccess('WorkUpdate', () => true);

const canView = requirePermission('WORK', 'view');
const canUpdate = requirePermission('WORK', 'update');
const byId = validate({ params: idParamSchema });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const worksRouter = Router();

worksRouter.get('/', canView, validate({ query: workListQuerySchema }), controller.list);
worksRouter.get('/mine', canView, validate({ query: workListQuerySchema }), controller.mine);
worksRouter.get(
  '/export',
  canView,
  validate({ query: workListQuerySchema }),
  controller.exportList(false),
);
worksRouter.get(
  '/mine/export',
  canView,
  validate({ query: workListQuerySchema }),
  controller.exportList(true),
);
worksRouter.post(
  '/',
  requirePermission('WORK', 'create'),
  validate({ body: workCreateSchema }),
  controller.create,
);
worksRouter.get('/:id', canView, byId, controller.get);
// Ownership (staff → own works only) is checked in the service.
worksRouter.patch(
  '/:id',
  canUpdate,
  validate({ params: idParamSchema, body: workUpdateSchema }),
  controller.update,
);
worksRouter.delete('/:id', requirePermission('WORK', 'delete'), byId, controller.remove);
worksRouter.post(
  '/:id/reassign',
  canUpdate,
  validate({ params: idParamSchema, body: reassignSchema }),
  controller.reassign,
);
worksRouter.patch(
  '/:id/milestones/:milestoneId',
  canUpdate,
  validate({ params: milestoneParamsSchema, body: milestoneUpdateSchema }),
  controller.updateMilestone,
);
worksRouter.get(
  '/:id/updates',
  canView,
  validate({ params: idParamSchema, query: pageQuery }),
  controller.listUpdates,
);
worksRouter.get(
  '/:id/history',
  canView,
  validate({ params: idParamSchema, query: pageQuery }),
  controller.history,
);
// Multipart: `note`, `milestoneId` and an optional `file`; multer runs before validation.
worksRouter.post(
  '/:id/updates',
  canUpdate,
  uploadSingle('file'),
  validate({ params: idParamSchema, body: workUpdateLogSchema }),
  controller.addUpdate,
);

export const procurementRulesRouter = Router();

procurementRulesRouter.get(
  '/evaluate',
  validate({ query: evaluateRulesQuerySchema }),
  controller.evaluateRules,
);
