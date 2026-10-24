import type { RequestHandler } from 'express';
import type { IdParam, notificationListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { requireUser } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './notifications.service.js';

export const list: RequestHandler = async (req, res) => {
  const q = req.query as unknown as z.output<typeof notificationListQuerySchema>;
  const { data, meta } = await service.list(requireUser(req).id, q);
  sendSuccess(res, data, meta);
};

export const unreadCount: RequestHandler = async (req, res) => {
  sendSuccess(res, { count: await service.unreadCount(requireUser(req).id) });
};

export const markRead: RequestHandler = async (req, res) => {
  await service.markRead(requireUser(req).id, (req.params as IdParam).id);
  sendSuccess(res, null);
};

export const markAllRead: RequestHandler = async (req, res) => {
  sendSuccess(res, { updated: await service.markAllRead(requireUser(req).id) });
};
