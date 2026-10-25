/**
 * A report as plain tables, rendered to Excel (lib/excel.ts) or PDF (lib/pdf.ts). Every
 * report builds one of these from the same data it returns as JSON, so the exports always
 * match the screen.
 */

export type ColumnKind = 'text' | 'int' | 'decimal' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  kind?: ColumnKind;
  /** Excel column width in characters. */
  width?: number;
}

export type ReportCell = string | number | null;

export interface ReportTable {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
}

export interface ReportDocument {
  title: string;
  /** Applied filters, e.g. "Tahun: 2015–2026". */
  filters: string[];
  tables: ReportTable[];
}

const idr = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

/** Display text of a cell (PDF and any text rendering). */
export function formatCell(value: ReportCell, kind: ColumnKind = 'text'): string {
  if (value === null || value === '') return '-';
  if (typeof value === 'string') {
    if (kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [y, m, d] = value.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    return value;
  }
  switch (kind) {
    case 'money':
      return `Rp ${idr.format(value)}`;
    case 'percent':
      return `${decimal.format(value)}%`;
    case 'int':
      return idr.format(value);
    default:
      return decimal.format(value);
  }
}
