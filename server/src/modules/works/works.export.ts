import {
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  WORK_STATUS_LABELS,
  type WorkListItemDto,
} from '@sipita/shared';
import type { ReportDocument } from '../../lib/report-document.js';

/** Excel export of the work list, one row per work as filtered on screen. */
export function workListDocument(title: string, rows: WorkListItemDto[]): ReportDocument {
  return {
    title,
    filters: [],
    tables: [
      {
        columns: [
          { key: 'code', label: 'Kode', width: 15 },
          { key: 'title', label: 'Judul', width: 40 },
          { key: 'year', label: 'Tahun', kind: 'int', width: 8 },
          { key: 'type', label: 'Jenis', width: 18 },
          { key: 'category', label: 'Kategori', width: 10 },
          { key: 'method', label: 'Metode', width: 22 },
          { key: 'vendor', label: 'Vendor', width: 28 },
          { key: 'directorate', label: 'Direktorat Peminta', width: 24 },
          { key: 'pic', label: 'PIC', width: 20 },
          { key: 'currency', label: 'Mata Uang', width: 10 },
          { key: 'amount', label: 'Nilai', kind: 'decimal', width: 18 },
          { key: 'amountIdr', label: 'Nilai (IDR)', kind: 'money', width: 20 },
          { key: 'pvp', label: 'PVP Wajib', width: 10 },
          { key: 'stages', label: 'Tahapan Saat Ini', width: 30 },
          { key: 'progress', label: 'Progres', width: 10 },
          { key: 'status', label: 'Status', width: 12 },
          { key: 'lastUpdatedAt', label: 'Update Terakhir', kind: 'date', width: 14 },
          { key: 'issues', label: 'Catatan Data', width: 40 },
        ],
        rows: rows.map((w) => ({
          code: w.code,
          title: w.title,
          year: w.procurementYear,
          type: PROCUREMENT_TYPE_LABELS[w.procurementType],
          category: PROJECT_CATEGORY_LABELS[w.category],
          method: PROCUREMENT_METHOD_LABELS[w.method],
          vendor: w.vendor?.name ?? null,
          directorate: w.requesterDirectorate?.name ?? null,
          pic: w.pic.name,
          currency: w.currency,
          amount: w.amount,
          amountIdr: w.amountIdr,
          pvp: w.pvpRequired ? 'Ya' : 'Tidak',
          stages: w.currentStages.map((s) => s.label).join(', ') || null,
          progress: `${w.progress.done}/${w.progress.total}`,
          status: WORK_STATUS_LABELS[w.status],
          lastUpdatedAt: w.lastUpdatedAt,
          issues:
            [...w.issues.map((i) => i.message), ...(w.isStale ? ['Tidak di-update'] : [])].join(
              '; ',
            ) || null,
        })),
      },
    ],
  };
}
