import { Router, type Request, type Response } from 'express';
import {
  annualSummaryQuerySchema,
  complianceQuerySchema,
  expiringQuerySchema,
  reportFilterSchema,
  yoyTrendQuerySchema,
  type ReportFilter,
} from '@sipita/shared';
import { z } from 'zod';
import { dayjs } from '../../lib/dayjs.js';
import { toXlsx } from '../../lib/excel.js';
import { toPdf } from '../../lib/pdf.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './reports.service.js';
import type { ReportResult } from './reports.service.js';

/**
 * GET /reports/<name>?format=json|xlsx|pdf (CLAUDE.md §8, §10): the same query returns the
 * data for the page or the export file.
 */
export const reportsRouter = Router();

reportsRouter.use(requirePermission('REPORT', 'view'));

async function respond<T>(req: Request, res: Response, name: string, result: ReportResult<T>) {
  const { format } = req.query as unknown as ReportFilter;
  if (format === 'json') {
    sendSuccess(res, result.data);
    return;
  }
  const stamp = dayjs().tz().format('YYYYMMDD');
  const file = `sipita-${name}-${stamp}.${format}`;
  const buffer = format === 'xlsx' ? await toXlsx(result.document) : await toPdf(result.document);
  res
    .status(200)
    .type(
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
    )
    .setHeader('Content-Disposition', `attachment; filename="${file}"`)
    .setHeader('Cache-Control', 'private, no-store')
    .send(buffer);
}

/** Validates the shared filters together with the report's own parameters. */
const query = (extra: z.ZodObject) =>
  validate({ query: z.intersection(reportFilterSchema, extra) });
const filters = (req: Request) => req.query as unknown as ReportFilter;

reportsRouter.get('/annual-summary', query(annualSummaryQuerySchema), async (req, res) => {
  const { groupBy } = req.query as unknown as z.output<typeof annualSummaryQuerySchema>;
  await respond(req, res, 'rekap-tahunan', await service.annualSummary(filters(req), groupBy));
});

reportsRouter.get('/yoy-trend', query(yoyTrendQuerySchema), async (req, res) => {
  const { groupBy } = req.query as unknown as z.output<typeof yoyTrendQuerySchema>;
  await respond(req, res, 'tren', await service.yoyTrend(filters(req), groupBy));
});

reportsRouter.get('/expiring-agreements', query(expiringQuerySchema), async (req, res) => {
  const { days } = req.query as unknown as z.output<typeof expiringQuerySchema>;
  await respond(req, res, 'jatuh-tempo', await service.expiringAgreements(filters(req), days));
});

reportsRouter.get('/vendor-history', query(z.object({})), async (req, res) => {
  await respond(req, res, 'vendor', await service.vendorHistory(filters(req)));
});

reportsRouter.get('/compliance', query(complianceQuerySchema), async (req, res) => {
  const q = req.query as unknown as z.output<typeof complianceQuerySchema>;
  const exporting = filters(req).format !== 'json';
  await respond(req, res, 'kepatuhan', await service.compliance(filters(req), q, exporting));
});

reportsRouter.get('/team-performance', query(z.object({})), async (req, res) => {
  await respond(req, res, 'kinerja-tim', await service.teamPerformance(filters(req)));
});
