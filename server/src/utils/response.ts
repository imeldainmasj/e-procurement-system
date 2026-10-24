import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@sipita/shared';

export function sendSuccess<T>(res: Response, data: T, meta?: PaginationMeta, status = 200): void {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  res.status(status).json(body);
}
