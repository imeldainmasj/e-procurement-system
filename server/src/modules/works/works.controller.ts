import type { Request, RequestHandler } from 'express';
import type {
  IdParam,
  MilestoneUpdatePayload,
  WorkCreatePayload,
  WorkListQuery,
  WorkUpdatePayload,
  evaluateRulesQuerySchema,
  reassignSchema,
  workUpdateLogSchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { exportPage, sendXlsx } from '../../utils/export.js';
import { sendSuccess } from '../../utils/response.js';
import { workHistory } from './work-history.js';
import { workListDocument } from './works.export.js';
import * as service from './works.service.js';

const idOf = (req: Request) => (req.params as IdParam).id;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(req.query as unknown as WorkListQuery);
  sendSuccess(res, data, meta);
};

/** Same filters as the list, limited to the current user's works. */
export const mine: RequestHandler = async (req, res) => {
  const q = req.query as unknown as WorkListQuery;
  const { data, meta } = await service.list({ ...q, picId: getActor(req).userId });
  sendSuccess(res, data, meta);
};

/** Excel export of the list (or of the current user's works) with the same filters and sort. */
export const exportList =
  (mine: boolean): RequestHandler =>
  async (req, res) => {
    const q = req.query as unknown as WorkListQuery;
    const { data } = await service.list({
      ...q,
      ...exportPage,
      ...(mine && { picId: getActor(req).userId }),
    });
    await sendXlsx(
      res,
      mine ? 'pekerjaan-saya' : 'pekerjaan',
      workListDocument(mine ? 'Pekerjaan Saya' : 'Daftar Pekerjaan', data),
    );
  };

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get(idOf(req), getActor(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.create(req.body as WorkCreatePayload, getActor(req)),
    undefined,
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as WorkUpdatePayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove(idOf(req), getActor(req));
  sendSuccess(res, null);
};

export const reassign: RequestHandler = async (req, res) => {
  const { picId, note } = req.body as z.output<typeof reassignSchema>;
  sendSuccess(res, await service.reassign(idOf(req), picId, note, getActor(req)));
};

export const updateMilestone: RequestHandler = async (req, res) => {
  const { id, milestoneId } = req.params as { id: string; milestoneId: string };
  sendSuccess(
    res,
    await service.updateMilestone(
      id,
      milestoneId,
      req.body as MilestoneUpdatePayload,
      getActor(req),
    ),
  );
};

export const listUpdates: RequestHandler = async (req, res) => {
  const { data, meta } = await service.listUpdates(
    idOf(req),
    req.query as unknown as { page: number; limit: number },
  );
  sendSuccess(res, data, meta);
};

export const history: RequestHandler = async (req, res) => {
  const { data, meta } = await workHistory(
    idOf(req),
    req.query as unknown as { page: number; limit: number },
  );
  sendSuccess(res, data, meta);
};

export const addUpdate: RequestHandler = async (req, res) => {
  const input = req.body as z.output<typeof workUpdateLogSchema>;
  sendSuccess(
    res,
    await service.addUpdate(idOf(req), input, req.file, getActor(req)),
    undefined,
    201,
  );
};

export const evaluateRules: RequestHandler = async (req, res) => {
  const q = req.query as unknown as z.output<typeof evaluateRulesQuerySchema>;
  sendSuccess(res, await service.evaluateRules(q.amountIdr, q.previousPurchaseAmount));
};
