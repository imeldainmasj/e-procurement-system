import type { RequestHandler } from 'express';
import type {
  IdParam,
  PrPayload,
  PrStockCheckInput,
  ReasonInput,
  prListQuerySchema,
  prRequesterQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './purchase-requests.service.js';

type ListQuery = z.output<typeof prListQuerySchema>;
type RequesterQuery = z.output<typeof prRequesterQuerySchema>;
const idOf = (req: Parameters<RequestHandler>[0]) => (req.params as IdParam).id;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(req.query as unknown as ListQuery, getActor(req));
  sendSuccess(res, data, meta);
};

export const requesters: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.requesters(req.query as unknown as RequesterQuery, getActor(req)));
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get(idOf(req), getActor(req)));
};

export const history: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.history(idOf(req), getActor(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.create(req.body as PrPayload, getActor(req)), undefined, 201);
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as PrPayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove(idOf(req), getActor(req));
  sendSuccess(res, null);
};

export const submit: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.submit(idOf(req), getActor(req)));
};

export const startStockCheck: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.startStockCheck(idOf(req), getActor(req)));
};

export const completeStockCheck: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.completeStockCheck(idOf(req), req.body as PrStockCheckInput, getActor(req)),
  );
};

export const cancel: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.cancel(idOf(req), (req.body as ReasonInput).reason, getActor(req)),
  );
};
