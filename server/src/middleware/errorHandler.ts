import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@sipita/shared';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`));
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError(
      400,
      'VALIDATION_ERROR',
      'Data yang dikirim tidak valid',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return AppError.conflict('Data dengan nilai tersebut sudah ada');
    if (err.code === 'P2025') return AppError.notFound();
    if (err.code === 'P2003') return AppError.badRequest('Data relasi tidak valid');
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return new AppError(400, 'INVALID_JSON', 'Format JSON tidak valid');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);

  if (appError.statusCode >= 500) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  }

  const body: ApiErrorBody = {
    success: false,
    error: { code: appError.code, message: appError.message, details: appError.details },
  };
  res.status(appError.statusCode).json(body);
};
