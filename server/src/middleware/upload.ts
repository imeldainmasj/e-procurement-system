import type { RequestHandler } from 'express';
import multer from 'multer';
import { isAllowedUpload } from '@sipita/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface UploadOptions {
  /** Size limit in MB; default MAX_UPLOAD_MB. */
  maxMb?: number;
  /** Only .xlsx (Excel import, CLAUDE.md §12). */
  xlsxOnly?: boolean;
}

/** Single-file multipart upload kept in memory so it can be checked before saving. */
export function uploadSingle(field = 'file', options: UploadOptions = {}): RequestHandler {
  const maxMb = options.maxMb ?? env.MAX_UPLOAD_MB;
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      // Multer decodes the original name as latin1; restore UTF-8 names.
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const allowed = options.xlsxOnly
        ? file.mimetype === XLSX_MIME && file.originalname.toLowerCase().endsWith('.xlsx')
        : isAllowedUpload(file.mimetype, file.originalname);
      if (allowed) cb(null, true);
      else
        cb(
          new AppError(
            400,
            'INVALID_FILE_TYPE',
            options.xlsxOnly
              ? 'File import harus berformat Excel .xlsx'
              : 'Tipe file tidak diizinkan. Gunakan PDF, JPG, PNG, XLSX, atau DOCX.',
          ),
        );
    },
  }).single(field);

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(400, 'FILE_TOO_LARGE', `Ukuran file maksimal ${maxMb} MB`));
        }
        return next(new AppError(400, 'UPLOAD_ERROR', 'Unggahan file tidak valid'));
      }
      next(err);
    });
  };
}
