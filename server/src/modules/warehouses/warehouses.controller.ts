import type { RequestHandler } from 'express';
import type { IdParam, WarehousePayload, warehouseListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './warehouses.service.js';

type ListQuery = z.output<typeof warehouseListQuerySchema>;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(req.query as unknown as ListQuery);
  sendSuccess(res, data, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get((req.params as IdParam).id));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.create(req.body as WarehousePayload, getActor(req)),
    undefined,
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  const { id } = req.params as IdParam;
  sendSuccess(res, await service.update(id, req.body as WarehousePayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove((req.params as IdParam).id, getActor(req));
  sendSuccess(res, null);
};
