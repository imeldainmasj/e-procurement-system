import { Router } from 'express';
import {
  departmentInputSchema,
  directorateInputSchema,
  divisionInputSchema,
  idParamSchema,
  organizationListQuerySchema,
  uuidSchema,
  type IdParam,
  type PaginationMeta,
} from '@sipita/shared';
import type { z } from 'zod';
import { requireAdmin } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { getActor, type Actor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './organization.service.js';

interface UnitHandlers<Q, P> {
  list: (q: Q) => Promise<{ data: unknown[]; meta: PaginationMeta }>;
  save: (id: string | undefined, input: P, actor: Actor) => Promise<unknown>;
  remove: (id: string, actor: Actor) => Promise<void>;
}

/**
 * Same endpoints for every organisation level: everyone signed in reads (forms and
 * filters need the lists), only admins write (CLAUDE.md §4).
 */
function unitRouter<Q, P>(listQuery: z.ZodType<Q>, body: z.ZodType<P>, h: UnitHandlers<Q, P>) {
  const router = Router();
  router.get('/', validate({ query: listQuery }), async (req, res) => {
    const { data, meta } = await h.list(req.query as unknown as Q);
    sendSuccess(res, data, meta);
  });
  router.post('/', requireAdmin, validate({ body }), async (req, res) => {
    sendSuccess(res, await h.save(undefined, req.body as P, getActor(req)), undefined, 201);
  });
  router.put('/:id', requireAdmin, validate({ params: idParamSchema, body }), async (req, res) => {
    const { id } = req.params as IdParam;
    sendSuccess(res, await h.save(id, req.body as P, getActor(req)));
  });
  router.delete('/:id', requireAdmin, validate({ params: idParamSchema }), async (req, res) => {
    await h.remove((req.params as IdParam).id, getActor(req));
    sendSuccess(res, null);
  });
  return router;
}

export const directoratesRouter = unitRouter(organizationListQuerySchema, directorateInputSchema, {
  list: service.listDirectorates,
  save: service.saveDirectorate,
  remove: service.removeDirectorate,
});

export const divisionsRouter = unitRouter(
  organizationListQuerySchema.extend({ directorateId: uuidSchema.optional() }),
  divisionInputSchema,
  { list: service.listDivisions, save: service.saveDivision, remove: service.removeDivision },
);

export const departmentsRouter = unitRouter(
  organizationListQuerySchema.extend({ divisionId: uuidSchema.optional() }),
  departmentInputSchema,
  { list: service.listDepartments, save: service.saveDepartment, remove: service.removeDepartment },
);
