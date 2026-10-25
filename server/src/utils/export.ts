import type { Response } from 'express';
import { dayjs } from '../lib/dayjs.js';
import { toXlsx } from '../lib/excel.js';
import type { ReportDocument } from '../lib/report-document.js';

/** Upper bound of rows in a list export; the list filters narrow it down. */
export const EXPORT_MAX_ROWS = 10_000;

/** Query of a list export: the list's own filters and sort, all pages at once. */
export const exportPage = { page: 1, limit: EXPORT_MAX_ROWS } as const;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Sends a generated file as a download named `sipita-<name>-YYYYMMDD.<ext>`. */
export function sendDownload(res: Response, name: string, ext: string, mime: string, body: Buffer) {
  const file = `sipita-${name}-${dayjs().tz().format('YYYYMMDD')}.${ext}`;
  res
    .status(200)
    .type(mime)
    .setHeader('Content-Disposition', `attachment; filename="${file}"`)
    .setHeader('Cache-Control', 'private, no-store')
    .send(body);
}

/** Excel export of a list table (CLAUDE.md §9: every list can be exported to Excel). */
export async function sendXlsx(res: Response, name: string, doc: ReportDocument): Promise<void> {
  sendDownload(res, name, 'xlsx', XLSX_MIME, await toXlsx(doc));
}
