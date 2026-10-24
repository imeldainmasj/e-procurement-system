import type { RequestHandler } from 'express';
import type {
  IdParam,
  PoCreatePayload,
  PoUpdatePayload,
  ReasonInput,
  VendorRatingPayload,
  poListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import { getSettings } from '../settings/settings.service.js';
import { poPdfFileName, renderPoPdf } from './po.pdf.js';
import * as service from './purchase-orders.service.js';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.params as IdParam).id;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof poListQuerySchema>,
  );
  sendSuccess(res, data, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get(idOf(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.create(req.body as PoCreatePayload, getActor(req)),
    undefined,
    201,
  );
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as PoUpdatePayload, getActor(req)));
};

export const issue: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.issue(idOf(req), getActor(req)));
};

export const cancel: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.cancel(idOf(req), (req.body as ReasonInput).reason, getActor(req)),
  );
};

export const rate: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.rate(idOf(req), req.body as VendorRatingPayload, getActor(req)));
};

/** Rendered on demand so it always reflects the current status. `?download=1` forces a download. */
export const pdf: RequestHandler = async (req, res) => {
  const [po, settings] = await Promise.all([service.findOrThrow(idOf(req)), getSettings()]);
  const buffer = await renderPoPdf(po, settings);
  const disposition = req.query['download'] ? 'attachment' : 'inline';
  res
    .status(200)
    .type('application/pdf')
    .setHeader('Content-Disposition', `${disposition}; filename="${poPdfFileName(po.number)}"`)
    .setHeader('Cache-Control', 'private, no-store')
    .send(buffer);
};
