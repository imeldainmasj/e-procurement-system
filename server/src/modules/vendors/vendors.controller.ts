import type { RequestHandler } from 'express';
import type {
  IdParam,
  VendorPayload,
  vendorDocumentInputSchema,
  vendorListQuerySchema,
  vendorStatusInputSchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './vendors.service.js';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.params as IdParam).id;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof vendorListQuerySchema>,
  );
  sendSuccess(res, data, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get(idOf(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.create(req.body as VendorPayload, getActor(req)), undefined, 201);
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as VendorPayload, getActor(req)));
};

export const changeStatus: RequestHandler = async (req, res) => {
  const { status, reason } = req.body as z.output<typeof vendorStatusInputSchema>;
  sendSuccess(res, await service.changeStatus(idOf(req), status, reason, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove(idOf(req), getActor(req));
  sendSuccess(res, null);
};

export const listRatings: RequestHandler = async (req, res) => {
  const { data, meta } = await service.listRatings(
    idOf(req),
    req.query as unknown as { page: number; limit: number },
  );
  sendSuccess(res, data, meta);
};

export const addDocument: RequestHandler = async (req, res) => {
  const input = req.body as z.output<typeof vendorDocumentInputSchema>;
  sendSuccess(
    res,
    await service.addDocument(idOf(req), input, req.file, getActor(req)),
    undefined,
    201,
  );
};

export const removeDocument: RequestHandler = async (req, res) => {
  const { id, documentId } = req.params as { id: string; documentId: string };
  await service.removeDocument(id, documentId, getActor(req));
  sendSuccess(res, null);
};
