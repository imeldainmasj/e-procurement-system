import type { RequestHandler } from 'express';
import type { ApprovalRulePayload, IdParam } from '@sipita/shared';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './approval-rules.service.js';

export const list: RequestHandler = async (_req, res) => {
  sendSuccess(res, await service.list());
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get((req.params as IdParam).id));
};

export const resolve: RequestHandler = async (req, res) => {
  const { amount } = req.query as unknown as { amount: number };
  sendSuccess(res, await service.resolveApprovalLevels(amount));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.create(req.body as ApprovalRulePayload, getActor(req)),
    undefined,
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  const { id } = req.params as IdParam;
  sendSuccess(res, await service.update(id, req.body as ApprovalRulePayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove((req.params as IdParam).id, getActor(req));
  sendSuccess(res, null);
};
