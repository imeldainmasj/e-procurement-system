import type { RequestHandler } from 'express';
import type { IdParam, memoListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import { memoPdfFileName, renderMemoPdf } from './memo.pdf.js';
import * as service from './memos.service.js';

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof memoListQuerySchema>,
  );
  sendSuccess(res, data, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get((req.params as IdParam).id, getActor(req)));
};

/** Rendered on demand so the approval table is always current. `?download=1` forces a download. */
export const pdf: RequestHandler = async (req, res) => {
  const memo = await service.findVisible((req.params as IdParam).id, getActor(req));
  const buffer = await renderMemoPdf(memo);
  const disposition = req.query['download'] ? 'attachment' : 'inline';
  res
    .status(200)
    .type('application/pdf')
    .setHeader('Content-Disposition', `${disposition}; filename="${memoPdfFileName(memo.number)}"`)
    .setHeader('Cache-Control', 'private, no-store')
    .send(buffer);
};
