import type { RequestHandler } from 'express';
import multer from 'multer';
import { isAllowedUpload } from '@sipita/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Single-file multipart upload kept in memory (≤ MAX_UPLOAD_MB) so it can be checked before saving. */
export function uploadSingle(field = 'file'): RequestHandler {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      // Multer decodes the original name as latin1; restore UTF-8 names.
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (isAllowedUpload(file.mimetype, file.originalname)) cb(null, true);
      else
        cb(
          new AppError(
            400,
            'INVALID_FILE_TYPE',
            'Tipe file tidak diizinkan. Gunakan PDF, JPG, PNG, XLSX, atau DOCX.',
          ),
        );
    },
  }).single(field);

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(400, 'FILE_TOO_LARGE', `Ukuran file maksimal ${env.MAX_UPLOAD_MB} MB`),
          );
        }
        return next(new AppError(400, 'UPLOAD_ERROR', 'Unggahan file tidak valid'));
      }
      next(err);
    });
  };
}
