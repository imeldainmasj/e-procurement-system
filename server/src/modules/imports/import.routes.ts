import { Router } from 'express';
import {
  idParamSchema,
  importIssueQuerySchema,
  importListQuerySchema,
  type IdParam,
} from '@sipita/shared';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAdmin, requirePermission } from '../../middleware/permission.js';
import { uploadSingle } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './import.service.js';

export const importsRouter = Router();

const canView = requirePermission('IMPORT', 'view');
const canImport = requirePermission('IMPORT', 'create');
const byId = validate({ params: idParamSchema });
const idOf = (params: unknown) => (params as IdParam).id;

importsRouter.get('/template', canView, async (_req, res) => {
  const buffer = await service.template();
  res
    .status(200)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setHeader('Content-Disposition', 'attachment; filename="template-import-sipita.xlsx"')
    .send(buffer);
});

importsRouter.get('/', canView, validate({ query: importListQuerySchema }), async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof importListQuerySchema>,
  );
  sendSuccess(res, data, meta);
});

// The upload answers at once (202); validation continues in the background.
importsRouter.post(
  '/',
  canImport,
  uploadSingle('file', { maxMb: env.MAX_IMPORT_MB, xlsxOnly: true }),
  async (req, res) => {
    sendSuccess(res, await service.upload(req.file, getActor(req)), undefined, 202);
  },
);

importsRouter.get('/:id', canView, byId, async (req, res) => {
  sendSuccess(res, await service.get(idOf(req.params)));
});

importsRouter.get(
  '/:id/issues',
  canView,
  validate({ params: idParamSchema, query: importIssueQuerySchema }),
  async (req, res) => {
    const { data, meta } = await service.issues(
      idOf(req.params),
      req.query as unknown as z.output<typeof importIssueQuerySchema>,
    );
    sendSuccess(res, data, meta);
  },
);

importsRouter.post('/:id/commit', canImport, byId, async (req, res) => {
  sendSuccess(res, await service.commit(idOf(req.params), getActor(req)), undefined, 202);
});

importsRouter.delete('/:id', canImport, byId, async (req, res) => {
  await service.cancel(idOf(req.params));
  sendSuccess(res, null);
});

// Rollback is admin-only (CLAUDE.md §4).
importsRouter.post('/:id/rollback', requireAdmin, byId, async (req, res) => {
  sendSuccess(res, await service.rollback(idOf(req.params), getActor(req)), undefined, 202);
});
