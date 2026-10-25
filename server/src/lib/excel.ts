import ExcelJS from 'exceljs';
import { dayjs } from './dayjs.js';
import type { ColumnKind, ReportDocument } from './report-document.js';

const HEADER_FILL = 'FF4B5BD6';
const NUM_FMT: Partial<Record<ColumnKind, string>> = {
  int: '#,##0',
  decimal: '#,##0.0',
  money: '#,##0',
  percent: '0.00"%"',
  date: 'dd/mm/yyyy',
};

/** Excel sheet names: max 31 chars, no []:*?/\ */
const sheetName = (name: string, used: Set<string>) => {
  let base =
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .slice(0, 31)
      .trim() || 'Data';
  for (let i = 2; used.has(base); i++) base = `${base.slice(0, 28)} ${i}`;
  used.add(base);
  return base;
};

/** One sheet per table: title, filters, then a styled header row and the data. */
export async function toXlsx(doc: ReportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIPITA';
  wb.created = new Date();
  const used = new Set<string>();

  for (const table of doc.tables) {
    const ws = wb.addWorksheet(sheetName(table.title ?? doc.title, used));
    ws.getCell('A1').value = doc.title;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = [
      ...doc.filters,
      `Dibuat ${dayjs().tz().format('DD/MM/YYYY HH:mm')}`,
    ].join(' · ');
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF6C757D' } };
    if (table.title && table.title !== doc.title) {
      ws.getCell('A3').value = table.title;
      ws.getCell('A3').font = { bold: true };
    }

    const headerRow = 5;
    ws.columns = table.columns.map((c) => ({ width: c.width ?? Math.max(12, c.label.length + 2) }));
    table.columns.forEach((c, i) => {
      const cell = ws.getRow(headerRow).getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    table.rows.forEach((row, r) => {
      const excelRow = ws.getRow(headerRow + 1 + r);
      table.columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        const v = row[c.key] ?? null;
        cell.value =
          c.kind === 'date' && typeof v === 'string' ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : v;
        const fmt = c.kind && NUM_FMT[c.kind];
        if (fmt) cell.numFmt = fmt;
      });
    });
    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: Math.max(1, table.columns.length) },
    };
  }
  if (doc.tables.length === 0) wb.addWorksheet('Data').getCell('A1').value = 'Tidak ada data';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
