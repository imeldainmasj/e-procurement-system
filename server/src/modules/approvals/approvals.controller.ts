import type { RequestHandler } from 'express';
import type { ApproveInput, IdParam, RejectInput, approvalListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './approvals.service.js';

export const list: RequestHandler = async (req, res) => {
  const q = req.query as unknown as z.output<typeof approvalListQuerySchema>;
  const { data, meta } = await service.list(q, getActor(req));
  sendSuccess(res, data, meta);
};

export const pendingCount: RequestHandler = async (req, res) => {
  sendSuccess(res, { count: await service.pendingCount(getActor(req)) });
};

export const approve: RequestHandler = async (req, res) => {
  const { comment } = req.body as ApproveInput;
  sendSuccess(
    res,
    await service.approve((req.params as IdParam).id, comment ?? null, getActor(req)),
  );
};

export const reject: RequestHandler = async (req, res) => {
  const { reason } = req.body as RejectInput;
  sendSuccess(res, await service.reject((req.params as IdParam).id, reason, getActor(req)));
};
