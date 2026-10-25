import ExcelJS from 'exceljs';
import type { SettingsDto } from '@sipita/shared';
import { formatRupiah } from '@sipita/shared';
import {
  headerText,
  isList,
  LISTS,
  SHEETS,
  type ColumnSpec,
  type ListName,
} from './import.spec.js';

/**
 * Official import template (CLAUDE.md §7): same sheets, headers, column order, comments,
 * dropdowns and formulas as docs/import/template-import.xlsx, without the sample rows.
 */

const COLOR = {
  required: 'FF4B5BD6',
  optional: 'FF8F9BEF',
  auto: 'FFE9EBEC',
  white: 'FFFFFFFF',
  autoText: 'FF495057',
  black: 'FF000000',
  red: 'FFC0392B',
  blue: 'FF0000FF',
} as const;

/** Rows covered by dropdowns/validation and by the "(otomatis)" formulas. */
const LAST_VALIDATED_ROW = 1000;
const LAST_FORMULA_ROW = 200;

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});
const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const NUM_FMT: Partial<Record<ColumnSpec['type'], string>> = {
  int: '0',
  money: '#,##0.00',
  rate: '#,##0.00',
  date: 'dd/mm/yyyy',
  percent: '0.00%',
};

/** ExcelJS supports one validation for a whole range at runtime, but does not type it. */
function rangeValidations(ws: ExcelJS.Worksheet) {
  return (
    ws as unknown as {
      dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
    }
  ).dataValidations;
}

function validationFor(c: ColumnSpec): ExcelJS.DataValidation | null {
  const base = { allowBlank: true, showErrorMessage: true };
  if (isList(c.type)) return { ...base, type: 'list', formulae: [c.type] };
  if (c.type === 'currency') return { ...base, type: 'list', formulae: ['MataUang'] };
  if (c.type === 'bool') return { ...base, type: 'list', formulae: ['YaTidak'] };
  if (c.type === 'money' || c.type === 'rate') {
    return { ...base, type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0] };
  }
  if (c.type === 'date') {
    return {
      ...base,
      type: 'date',
      operator: 'greaterThan',
      formulae: [new Date(Date.UTC(1900, 0, 1))],
    };
  }
  return null;
}

function addDataSheet(wb: ExcelJS.Workbook, name: string, columns: ColumnSpec[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ width: c.width }));
  const header = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = headerText(c);
    cell.fill = solid(
      c.type === 'auto' ? COLOR.auto : c.required ? COLOR.required : COLOR.optional,
    );
    cell.font = { bold: true, color: { argb: c.type === 'auto' ? COLOR.autoText : COLOR.white } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (c.note) cell.note = c.note;

    const col = ws.getColumn(i + 1);
    const fmt =
      c.type === 'auto' ? (c.key === 'increasePercent' ? undefined : '#,##0.00') : NUM_FMT[c.type];
    if (fmt) col.numFmt = fmt;
    const letter = colLetter(i + 1);
    const dv = validationFor(c);
    if (dv) rangeValidations(ws).add(`${letter}2:${letter}${LAST_VALIDATED_ROW}`, dv);
    if (c.formula) {
      for (let r = 2; r <= LAST_FORMULA_ROW; r++) {
        const cell2 = ws.getCell(`${letter}${r}`);
        cell2.value = { formula: c.formula(r) };
        cell2.fill = solid(COLOR.auto);
      }
    }
  });
  header.height = 32;
}

function addListSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Daftar', { state: 'hidden' });
  (Object.keys(LISTS) as ListName[]).forEach((name, i) => {
    const labels = Object.values(LISTS[name]);
    const letter = colLetter(i + 1);
    ws.getCell(`${letter}1`).value = name;
    ws.getCell(`${letter}1`).font = { bold: true };
    labels.forEach((label, j) => (ws.getCell(`${letter}${j + 2}`).value = label));
    wb.definedNames.add(`Daftar!$${letter}$2:$${letter}$${labels.length + 1}`, name);
  });
}

function addGuideSheet(wb: ExcelJS.Workbook, settings: SettingsDto) {
  const ws = wb.addWorksheet('Petunjuk');
  ws.columns = [{ width: 30 }, { width: 34 }, { width: 70 }];
  const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
    name: 'Arial',
    size: 10,
    color: { argb: COLOR.black },
    ...extra,
  });
  let r = 1;
  const line = (values: string[], f: Partial<ExcelJS.Font> = font(), fill?: string) => {
    const row = ws.getRow(r++);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = f;
      if (fill) cell.fill = solid(fill);
    });
  };
  const title = (text: string) => line([text], font({ bold: true, size: 12 }));
  const tableHead = (values: string[]) => line(values, font({ bold: true }), COLOR.auto);
  const pvpMin = formatRupiah(settings.PVP_MIN_AMOUNT);
  const tender = formatRupiah(settings.TENDER_MIN_AMOUNT);

  line(['Template Import Data Pengadaan SIPITA — IT SAPM'], font({ bold: true, size: 14 }));
  line(
    [
      'Isi data mulai baris 2 di setiap sheet. Jangan mengubah nama sheet, judul kolom, atau urutan kolom.',
    ],
    font({ color: { argb: COLOR.red } }),
  );
  r++;
  title('Cara pakai');
  [
    '1. Isi sheet Vendor terlebih dahulu (jika vendor belum ada di sistem).',
    '2. Isi sheet Pekerjaan: satu baris = satu pengadaan. Beri setiap baris Ref Baris unik (R1, R2, ...).',
    '3. Isi dokumen di sheet lain dan hubungkan ke pekerjaan lewat kolom Ref Pekerjaan.',
    '4. Upload di menu Import SIPITA, periksa pratinjau, lalu klik Simpan.',
    "5. Baris ERROR ditolak; baris PERINGATAN tetap masuk dan ditandai 'belum lengkap'.",
  ].forEach((t) => line([t]));
  r++;
  title('Keterangan warna');
  line(
    ['Header biru tua', 'Kolom wajib (bertanda *)'],
    font({ bold: true, size: 11, color: { argb: COLOR.white } }),
    COLOR.required,
  );
  line(
    ['Header biru muda', 'Kolom opsional'],
    font({ bold: true, size: 11, color: { argb: COLOR.white } }),
    COLOR.optional,
  );
  line(
    [
      'Kolom abu-abu',
      'Dihitung otomatis (rumus). Jangan diisi; sistem menghitung ulang saat import.',
    ],
    font(),
    COLOR.auto,
  );
  line(['Teks biru', 'Data contoh / isian user'], font({ size: 11, color: { argb: COLOR.blue } }));
  line(['Komentar di header', 'Arahkan kursor ke header untuk melihat penjelasan kolom.']);
  r++;
  title('Sheet');
  tableHead(['Sheet', 'Isi', 'Penghubung']);
  [
    ['Vendor', 'Master vendor', 'Kode Vendor'],
    ['Pekerjaan', 'Satu baris per pengadaan', 'Ref Baris (baru) / Kode Pekerjaan (update)'],
    ['Memo', 'Memo pengajuan & semua MoA', 'Ref Pekerjaan'],
    ['RFQ', 'RFQ + LoA (Tender/Bidding)', 'Ref Pekerjaan (1 pekerjaan = 1 RFQ)'],
    ['PVP', 'Data PVP Forum', 'Ref Pekerjaan (1 pekerjaan = 1 PVP)'],
    ['PVP_Approval', 'Approval direktur per PVP', 'Ref Pekerjaan'],
    ['Approval_Pejabat', 'Approval pejabat (PL & PK)', 'Ref Pekerjaan'],
    ['PO', 'Purchase Order', 'Ref Pekerjaan; No. PO'],
    ['PO_TOP', 'Term of payment per PO', 'No. PO'],
    ['Agreement', 'Kontrak/agreement', 'Ref Pekerjaan; No. PO; Kode Vendor'],
    ['Addendum', 'Addendum agreement', 'No. Agreement; Ref Pekerjaan'],
  ].forEach((v) => line(v));
  r++;
  title('Aturan validasi');
  tableHead(['Level', 'Kondisi', 'Akibat']);
  [
    [
      'ERROR',
      'Kolom wajib kosong, format tanggal/angka salah, nilai tidak ada di daftar',
      'Baris ditolak',
    ],
    [
      'ERROR',
      'Nomor dokumen ganda (memo, RFQ, LoA, PO, agreement, addendum)',
      'Baris ditolak (jika sudah ada di sistem: data di-update)',
    ],
    [
      'ERROR',
      'Ref Pekerjaan / No. PO / Kode Vendor / No. Agreement tidak ditemukan',
      'Baris ditolak',
    ],
    [
      'PERINGATAN',
      'PO tanpa MoA sesuai metode atau tanpa MoA Biaya',
      'Masuk, ditandai belum lengkap',
    ],
    [
      'PERINGATAN',
      `PVP wajib (nilai > ${pvpMin} dan kenaikan > ${settings.PVP_MIN_INCREASE_PERCENT}%, atau pengadaan baru > ${pvpMin}) tetapi tidak ada data PVP / approval < ${settings.PVP_MIN_DIRECTOR_APPROVALS} direktur`,
      'Masuk, ditandai belum lengkap',
    ],
    [
      'PERINGATAN',
      `Metode tidak cocok dengan ambang nilai (Tender > ${tender}, Bidding ≤ ${tender})`,
      'Masuk, ditandai',
    ],
    [
      'PERINGATAN',
      'PK tanpa No. Agreement Sumber atau tanpa Hasil PK',
      'Masuk, ditandai belum lengkap',
    ],
  ].forEach((v) => line(v));
  r++;
  title('Daftar nilai (label di Excel → kode sistem)');
  tableHead(['Kolom', 'Label di Excel', 'Kode sistem']);
  const lists: [string, ListName][] = [
    ['Jenis Pengadaan', 'Jenis'],
    ['Kategori', 'Kategori'],
    ['Metode Pengadaan', 'Metode'],
    ['Status Pekerjaan', 'StatusPekerjaan'],
    ['Hasil PK', 'HasilPK'],
    ['Jenis Memo', 'JenisMemo'],
    ['Status PVP', 'StatusPVP'],
    ['Keputusan Direktur', 'Keputusan'],
    ['Tipe PO / Agreement', 'Tipe'],
  ];
  for (const [column, name] of lists) {
    Object.entries(LISTS[name]).forEach(([code, label], i) =>
      line([i === 0 ? column : '', label, code]),
    );
  }
}

export async function buildTemplate(settings: SettingsDto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIPITA';
  wb.created = new Date();
  addGuideSheet(wb, settings);
  for (const sheet of SHEETS) addDataSheet(wb, sheet.name, sheet.columns);
  addListSheet(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
