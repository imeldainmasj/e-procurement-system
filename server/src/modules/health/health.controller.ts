import type { RequestHandler } from 'express';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/response.js';
import { checkDatabase } from './health.service.js';

export const liveness: RequestHandler = (_req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
};

export const readiness: RequestHandler = async (_req, res) => {
  const database = await checkDatabase();
  if (!database) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database tidak dapat dihubungi');
  sendSuccess(res, { status: 'ok', database: 'up' });
};
