import { Router } from 'express';
import { z } from 'zod';
import {
  idParamSchema,
  uuidSchema,
  vendorDocumentInputSchema,
  vendorInputSchema,
  vendorListQuerySchema,
  vendorStatusInputSchema,
} from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { uploadSingle } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './vendors.controller.js';
import { VENDOR_READ_ROLES } from './vendors.service.js';

const canEdit = requireRole('PROCUREMENT');
const byId = validate({ params: idParamSchema });
const documentParams = z.object({ id: uuidSchema, documentId: uuidSchema });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const vendorsRouter = Router();

vendorsRouter.use(requireRole(...VENDOR_READ_ROLES));

vendorsRouter.get('/', validate({ query: vendorListQuerySchema }), controller.list);
vendorsRouter.post('/', canEdit, validate({ body: vendorInputSchema }), controller.create);
vendorsRouter.get('/:id', byId, controller.get);
vendorsRouter.put(
  '/:id',
  canEdit,
  validate({ params: idParamSchema, body: vendorInputSchema }),
  controller.update,
);
vendorsRouter.post(
  '/:id/status',
  canEdit,
  validate({ params: idParamSchema, body: vendorStatusInputSchema }),
  controller.changeStatus,
);
vendorsRouter.delete('/:id', canEdit, byId, controller.remove);
vendorsRouter.get(
  '/:id/ratings',
  validate({ params: idParamSchema, query: pageQuery }),
  controller.listRatings,
);
// Multipart: `file` plus the document fields; multer must run before body validation.
vendorsRouter.post(
  '/:id/documents',
  canEdit,
  uploadSingle('file'),
  validate({ params: idParamSchema, body: vendorDocumentInputSchema }),
  controller.addDocument,
);
vendorsRouter.delete(
  '/:id/documents/:documentId',
  canEdit,
  validate({ params: documentParams }),
  controller.removeDocument,
);
