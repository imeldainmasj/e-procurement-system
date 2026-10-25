import ExcelJS from 'exceljs';
import type { IssueLevel } from '@sipita/shared';
import { AppError } from '../../utils/AppError.js';
import {
  isList,
  LISTS,
  MAX_ROWS_PER_SHEET,
  normalizeHeader,
  SHEETS,
  type ColumnSpec,
  type SheetName,
} from './import.spec.js';

export interface Issue {
  sheet: string;
  rowNumber: number;
  level: IssueLevel;
  field: string | null;
  message: string;
}

export type CellValue = string | number | boolean | null;

export interface ParsedRow {
  sheet: SheetName;
  rowNumber: number;
  /** Converted values by column key; null when empty or invalid. */
  values: Record<string, CellValue>;
}

export interface ParsedWorkbook {
  rows: Record<SheetName, ParsedRow[]>;
  issues: Issue[];
  totalRows: number;
}

/** Raw cell value, never a formula: formulas and macros are ignored (§12). */
function rawValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return (v as { result?: unknown }).result ?? null;
    if ('richText' in v)
      return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ('error' in v) return null;
    return null;
  }
  return v;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD from an Excel date cell, a serial number, or dd/mm/yyyy / yyyy-mm-dd text. */
function toIsoDate(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86_400_000));
  else if (typeof v === 'string') {
    const s = v.trim();
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    m = m ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  // Excel stores dates without a time zone; ExcelJS returns them at UTC midnight.
  const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && d.getUTCFullYear() >= 1990 && d.getUTCFullYear() <= 2100
    ? iso
    : null;
}

/** Numbers typed as text, in Indonesian ("1.250.000,50") or plain ("1250000.5") notation. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/\s|Rp/gi, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}

type Converted = { value: CellValue } | { error: string };

function convert(c: ColumnSpec, raw: unknown): Converted {
  const text = typeof raw === 'string' ? raw.trim() : raw;
  switch (c.type) {
    case 'text':
      return { value: text instanceof Date ? toIsoDate(text) : String(text) };
    case 'code':
      return { value: String(text).toUpperCase() };
    case 'int': {
      const n = toNumber(text);
      return n !== null && Number.isInteger(n) ? { value: n } : { error: 'harus bilangan bulat' };
    }
    case 'money': {
      const n = toNumber(text);
      return n !== null && n >= 0 ? { value: n } : { error: 'harus angka ≥ 0' };
    }
    case 'rate': {
      const n = toNumber(text);
      return n !== null && n > 0 ? { value: n } : { error: 'harus angka > 0' };
    }
    case 'percent': {
      // Percent-formatted cells hold fractions (0.5 = 50%); "50%" text is also accepted.
      const pct =
        typeof text === 'string' && text.endsWith('%')
          ? toNumber(text.slice(0, -1))
          : (() => {
              const n = toNumber(text);
              return n === null ? null : n * 100;
            })();
      return pct !== null && pct >= 0 && pct <= 100
        ? { value: Math.round(pct * 100) / 100 }
        : { error: 'harus persen 0–100%' };
    }
    case 'date': {
      const iso = toIsoDate(text);
      return iso ? { value: iso } : { error: 'format tanggal salah (gunakan dd/mm/yyyy)' };
    }
    case 'currency': {
      const s = String(text).toUpperCase();
      return /^[A-Z]{3}$/.test(s)
        ? { value: s }
        : { error: 'harus kode mata uang 3 huruf, mis. IDR' };
    }
    case 'bool': {
      if (typeof text === 'boolean') return { value: text };
      const s = String(text).toLowerCase();
      if (['ya', 'y', 'yes', 'true', '1'].includes(s)) return { value: true };
      if (['tidak', 't', 'no', 'false', '0'].includes(s)) return { value: false };
      return { error: "harus 'Ya' atau 'Tidak'" };
    }
    case 'auto':
      return { value: null };
    default: {
      if (!isList(c.type)) return { value: null };
      // Label (as in the dropdown) or the system code itself.
      const s = String(text).trim().toLowerCase();
      const match = Object.entries(LISTS[c.type]).find(
        ([code, label]) => label.toLowerCase() === s || code.toLowerCase() === s,
      );
      return match ? { value: match[0] } : { error: `'${String(text)}' tidak ada di daftar` };
    }
  }
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Reads every sheet of the template (§7): headers are matched by name (the "*" marker,
 * case and spacing are ignored), formula columns are skipped, labels become enum codes.
 * Cell-level problems become ERROR issues; business rules are checked later.
 */
export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'File bukan Excel .xlsx yang valid');
  }

  const issues: Issue[] = [];
  const rows = Object.fromEntries(SHEETS.map((s) => [s.name, [] as ParsedRow[]])) as Record<
    SheetName,
    ParsedRow[]
  >;
  let totalRows = 0;

  for (const spec of SHEETS) {
    const ws = wb.getWorksheet(spec.name);
    if (!ws) {
      issues.push({
        sheet: spec.name,
        rowNumber: 0,
        level: 'WARNING',
        field: null,
        message: `Sheet ${spec.name} tidak ada; dilewati`,
      });
      continue;
    }
    const headerIndex = new Map<string, number>();
    ws.getRow(1).eachCell((cell, col) => {
      const text = rawValue(cell);
      if (typeof text === 'string') headerIndex.set(normalizeHeader(text), col);
    });
    const missing = spec.columns.filter(
      (c) => c.required && !headerIndex.has(normalizeHeader(c.header)),
    );
    if (missing.length > 0) {
      issues.push({
        sheet: spec.name,
        rowNumber: 1,
        level: 'ERROR',
        field: null,
        message: `Kolom wajib tidak ditemukan: ${missing.map((c) => c.header).join(', ')}. Gunakan template resmi.`,
      });
      continue;
    }

    const lastRow = ws.actualRowCount === 0 ? 0 : ws.rowCount;
    let count = 0;
    for (let r = 2; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const raw = spec.columns.map((c) => {
        const col = headerIndex.get(normalizeHeader(c.header));
        return c.type === 'auto' || !col ? null : rawValue(row.getCell(col));
      });
      if (raw.every(isEmpty)) continue;
      if (++count > MAX_ROWS_PER_SHEET) {
        issues.push({
          sheet: spec.name,
          rowNumber: r,
          level: 'ERROR',
          field: null,
          message: `Maksimal ${MAX_ROWS_PER_SHEET.toLocaleString('id-ID')} baris per sheet; sisa baris diabaikan`,
        });
        break;
      }
      const values: Record<string, CellValue> = {};
      spec.columns.forEach((c, i) => {
        const v = raw[i];
        values[c.key] = null;
        if (c.type === 'auto') return;
        if (isEmpty(v)) {
          if (c.required) {
            issues.push({
              sheet: spec.name,
              rowNumber: r,
              level: 'ERROR',
              field: c.header,
              message: `${c.header} wajib diisi`,
            });
          }
          return;
        }
        const result = convert(c, v);
        if ('error' in result) {
          issues.push({
            sheet: spec.name,
            rowNumber: r,
            level: 'ERROR',
            field: c.header,
            message: `${c.header} ${result.error}`,
          });
        } else {
          values[c.key] = result.value;
        }
      });
      rows[spec.name].push({ sheet: spec.name, rowNumber: r, values });
    }
    totalRows += Math.min(count, MAX_ROWS_PER_SHEET);
  }
  return { rows, issues, totalRows };
}
