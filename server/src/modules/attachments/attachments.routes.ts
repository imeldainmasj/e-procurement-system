import { Router } from 'express';
import { idParamSchema, type IdParam } from '@sipita/shared';
import { logger } from '../../lib/logger.js';
import { openFile } from '../../lib/storage.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { findDownloadable } from './attachments.service.js';

export const attachmentsRouter = Router();

/** RFC 6266 Content-Disposition with a UTF-8 file name. */
function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// Files are never served statically; every download goes through this access check.
attachmentsRouter.get('/:id/download', validate({ params: idParamSchema }), async (req, res) => {
  const attachment = await findDownloadable((req.params as IdParam).id, getActor(req));
  const inline =
    req.query['inline'] === '1' && /^(application\/pdf|image\/)/.test(attachment.mimeType);

  // Open the file before sending headers, so a missing file still gets a JSON error.
  const stream = openFile(attachment.path);
  await new Promise<void>((resolve, reject) => {
    stream.once('open', () => resolve());
    stream.once('error', (err) => {
      logger.error({ err, attachmentId: attachment.id }, 'File lampiran tidak ada di penyimpanan');
      reject(AppError.notFound('File tidak ditemukan di penyimpanan'));
    });
  });
  stream.on('error', (err) => {
    logger.error({ err, attachmentId: attachment.id }, 'Gagal membaca file lampiran');
    res.destroy(err);
  });
  res
    .status(200)
    .type(attachment.mimeType)
    .setHeader('Content-Length', String(attachment.size))
    .setHeader(
      'Content-Disposition',
      contentDisposition(inline ? 'inline' : 'attachment', attachment.fileName),
    )
    .setHeader('Cache-Control', 'private, no-store');
  stream.pipe(res);
});
