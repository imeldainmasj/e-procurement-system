import type { RequestHandler } from 'express';
import type {
  IdParam,
  QuotationCreatePayload,
  QuotationPayload,
  SelectQuotationInput,
} from '@sipita/shared';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './quotations.service.js';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.params as IdParam).id;

export const comparison: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.comparison(idOf(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.create(req.body as QuotationCreatePayload, getActor(req)),
    undefined,
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as QuotationPayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove(idOf(req), getActor(req));
  sendSuccess(res, null);
};

export const uploadFile: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.uploadFile(idOf(req), req.file, getActor(req)));
};

export const removeFile: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.removeFileOf(idOf(req), getActor(req)));
};

export const select: RequestHandler = async (req, res) => {
  const { justification } = req.body as SelectQuotationInput;
  sendSuccess(res, await service.select(idOf(req), justification ?? null, getActor(req)));
};

export const unselect: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.unselect(idOf(req), getActor(req)));
};
