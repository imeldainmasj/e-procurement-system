import {
  MEMO_TYPE_LABELS,
  PK_RESULT_LABELS,
  PO_TYPE_LABELS,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  PVP_DECISION_LABELS,
  PVP_STATUS_LABELS,
  WORK_STATUS_LABELS,
} from '@sipita/shared';

/**
 * Structure of the import workbook (CLAUDE.md §7), matching docs/import/template-import.xlsx.
 * Used both to generate the official template and to parse uploaded files, so the two can
 * never drift apart.
 */

/** Dropdown lists on the hidden `Daftar` sheet: Excel label → system code. */
export const LISTS = {
  Jenis: PROCUREMENT_TYPE_LABELS,
  Kategori: PROJECT_CATEGORY_LABELS,
  Metode: PROCUREMENT_METHOD_LABELS,
  MetodeRFQ: {
    TENDER: PROCUREMENT_METHOD_LABELS.TENDER,
    BIDDING: PROCUREMENT_METHOD_LABELS.BIDDING,
  },
  StatusPekerjaan: WORK_STATUS_LABELS,
  HasilPK: PK_RESULT_LABELS,
  JenisMemo: MEMO_TYPE_LABELS,
  StatusPVP: PVP_STATUS_LABELS,
  Keputusan: PVP_DECISION_LABELS,
  Tipe: PO_TYPE_LABELS,
  MataUang: { IDR: 'IDR', USD: 'USD', SGD: 'SGD', EUR: 'EUR' },
  YaTidak: { true: 'Ya', false: 'Tidak' },
} as const satisfies Record<string, Record<string, string>>;

export type ListName = keyof typeof LISTS;

export type ColumnType =
  | 'text'
  /** Uppercased business code (vendor, directorate). */
  | 'code'
  | 'int'
  /** Amount ≥ 0. */
  | 'money'
  /** Exchange rate > 0. */
  | 'rate'
  | 'date'
  /** Excel percentage (0.5 = 50%), stored as 0–100. */
  | 'percent'
  /** "(otomatis)" formula column: ignored on import and recomputed on the server. */
  | 'auto'
  /** Free 3-letter currency code; the dropdown only offers the common ones. */
  | 'currency'
  | 'bool'
  | ListName;

export interface ColumnSpec {
  key: string;
  /** Header text without the required marker " *". */
  header: string;
  required?: boolean;
  type: ColumnType;
  width: number;
  note?: string;
  /** Excel formula for "(otomatis)" columns; `r` is the row number. */
  formula?: (r: number) => string;
}

export interface SheetSpec {
  name: SheetName;
  columns: ColumnSpec[];
}

export const SHEET_NAMES = [
  'Vendor',
  'Pekerjaan',
  'Memo',
  'RFQ',
  'PVP',
  'PVP_Approval',
  'Approval_Pejabat',
  'PO',
  'PO_TOP',
  'Agreement',
  'Addendum',
] as const;
export type SheetName = (typeof SHEET_NAMES)[number];

const REF_NOTE = 'Ref Baris dari sheet Pekerjaan, atau Kode Pekerjaan yang sudah ada di sistem.';
const RATE_NOTE = 'Isi 1 untuk IDR.';

export const SHEETS: SheetSpec[] = [
  {
    name: 'Vendor',
    columns: [
      {
        key: 'code',
        header: 'Kode Vendor',
        required: true,
        type: 'code',
        width: 13,
        note: 'Kode unik vendor. Dipakai sheet lain untuk merujuk vendor.',
      },
      { key: 'name', header: 'Nama Vendor', required: true, type: 'text', width: 30 },
      { key: 'address', header: 'Alamat Vendor', required: true, type: 'text', width: 42 },
      { key: 'picName', header: 'PIC Vendor', required: true, type: 'text', width: 18 },
      {
        key: 'npwp',
        header: 'NPWP',
        type: 'text',
        width: 20,
        note: '16 digit, tulis sebagai teks.',
      },
      { key: 'email', header: 'Email', type: 'text', width: 28 },
      { key: 'phone', header: 'Telepon', type: 'text', width: 15 },
    ],
  },
  {
    name: 'Pekerjaan',
    columns: [
      {
        key: 'ref',
        header: 'Ref Baris',
        required: true,
        type: 'text',
        width: 9,
        note: "Penanda unik baris di file ini (mis. R1). Dipakai sheet lain di kolom 'Ref Pekerjaan'.",
      },
      {
        key: 'code',
        header: 'Kode Pekerjaan',
        type: 'code',
        width: 14,
        note: 'Kosongkan untuk pekerjaan baru (sistem membuat WRK-YYYY-NNNN). Isi jika memperbarui pekerjaan yang sudah ada.',
      },
      { key: 'title', header: 'Judul Pekerjaan', required: true, type: 'text', width: 42 },
      {
        key: 'procurementType',
        header: 'Jenis Pengadaan',
        required: true,
        type: 'Jenis',
        width: 17,
      },
      { key: 'category', header: 'Kategori', required: true, type: 'Kategori', width: 10 },
      { key: 'method', header: 'Metode Pengadaan', required: true, type: 'Metode', width: 21 },
      {
        key: 'procurementYear',
        header: 'Tahun Pengadaan',
        required: true,
        type: 'int',
        width: 10,
        note: 'Tahun yang dipakai di rekap tahunan.',
      },
      {
        key: 'pic',
        header: 'PIC (Username)',
        required: true,
        type: 'text',
        width: 16,
        note: 'Username staff IT SAPM di SIPITA.',
      },
      {
        key: 'directorate',
        header: 'Direktorat Peminta',
        type: 'code',
        width: 13,
        note: 'Kode direktorat peminta (opsional).',
      },
      {
        key: 'vendor',
        header: 'Kode Vendor',
        type: 'code',
        width: 11,
        note: 'Harus ada di sheet Vendor atau di sistem.',
      },
      { key: 'currency', header: 'Mata Uang', required: true, type: 'currency', width: 10 },
      {
        key: 'amount',
        header: 'Nilai',
        required: true,
        type: 'money',
        width: 17,
        note: 'Nilai dalam mata uang aslinya.',
      },
      {
        key: 'exchangeRate',
        header: 'Kurs ke IDR',
        required: true,
        type: 'rate',
        width: 11,
        note: RATE_NOTE,
      },
      {
        key: 'amountIdr',
        header: 'Nilai IDR (otomatis)',
        type: 'auto',
        width: 18,
        note: 'money: dihitung = Nilai x Kurs. Jangan diisi.',
        formula: (r) => `IF(OR(L${r}="",M${r}=""),"",L${r}*M${r})`,
      },
      {
        key: 'previousPurchaseAmount',
        header: 'Nilai Pembelian Tahun Sebelumnya (IDR)',
        type: 'money',
        width: 22,
        note: 'Kosongkan untuk pengadaan baru. Dipakai menghitung kenaikan & syarat PVP.',
      },
      {
        key: 'increasePercent',
        header: 'Kenaikan % (otomatis)',
        type: 'auto',
        width: 13,
        note: 'Dihitung = (Nilai IDR - Tahun Sebelumnya) / Tahun Sebelumnya. Jangan diisi.',
        formula: (r) => `IF(OR(N${r}="",O${r}="",O${r}=0),"",(N${r}-O${r})/O${r})`,
      },
      { key: 'periodStart', header: 'Periode Mulai', type: 'date', width: 13 },
      { key: 'periodEnd', header: 'Periode Selesai', type: 'date', width: 13 },
      {
        key: 'sourceAgreementNo',
        header: 'No. Agreement Sumber (PK)',
        type: 'text',
        width: 20,
        note: 'Wajib untuk Perpanjangan Khusus: agreement aktif yang diperpanjang.',
      },
      {
        key: 'pkResult',
        header: 'Hasil PK',
        type: 'HasilPK',
        width: 15,
        note: 'Khusus PK: Addendum atau Agreement Baru (keputusan di luar sistem).',
      },
      {
        key: 'status',
        header: 'Status Pekerjaan',
        required: true,
        type: 'StatusPekerjaan',
        width: 13,
      },
      { key: 'notes', header: 'Catatan', type: 'text', width: 48 },
    ],
  },
  {
    name: 'Memo',
    columns: [
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: REF_NOTE,
      },
      {
        key: 'memoNo',
        header: 'No. Memo',
        required: true,
        type: 'text',
        width: 28,
        note: 'Nomor sesuai dokumen asli. Harus unik.',
      },
      {
        key: 'memoType',
        header: 'Jenis Memo',
        required: true,
        type: 'JenisMemo',
        width: 19,
        note: 'Memo pengajuan atau jenis MoA.',
      },
      { key: 'title', header: 'Judul Memo', required: true, type: 'text', width: 46 },
      { key: 'memoDate', header: 'Tanggal Memo', required: true, type: 'date', width: 14 },
      { key: 'requesterName', header: 'Requestor Memo', required: true, type: 'text', width: 18 },
      { key: 'currency', header: 'Mata Uang', type: 'currency', width: 10 },
      { key: 'amount', header: 'Nilai', type: 'money', width: 17 },
      { key: 'exchangeRate', header: 'Kurs ke IDR', type: 'rate', width: 11, note: RATE_NOTE },
      { key: 'notes', header: 'Catatan', type: 'text', width: 40 },
    ],
  },
  {
    name: 'RFQ',
    columns: [
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: 'Hanya untuk metode Tender/Bidding. 1 pekerjaan = 1 RFQ.',
      },
      { key: 'rfqNo', header: 'No. RFQ', required: true, type: 'text', width: 18 },
      { key: 'method', header: 'Metode', required: true, type: 'MetodeRFQ', width: 10 },
      { key: 'periodStart', header: 'Periode Mulai', type: 'date', width: 13 },
      { key: 'periodEnd', header: 'Periode Selesai', type: 'date', width: 13 },
      { key: 'currency', header: 'Mata Uang', type: 'currency', width: 10 },
      { key: 'amount', header: 'Nilai', type: 'money', width: 17 },
      { key: 'exchangeRate', header: 'Kurs ke IDR', type: 'rate', width: 11, note: RATE_NOTE },
      { key: 'termOfPayment', header: 'Term of Payment', type: 'text', width: 28 },
      {
        key: 'loaNo',
        header: 'No. LoA',
        type: 'text',
        width: 20,
        note: 'Diproses tim di luar IT, diinput staff IT. Kosongkan jika belum terbit.',
      },
      { key: 'loaDate', header: 'Tanggal LoA', type: 'date', width: 13 },
      {
        key: 'loaProcessedBy',
        header: 'LoA Diproses Oleh',
        type: 'text',
        width: 18,
        note: 'Nama tim di luar IT yang memproses LoA.',
      },
    ],
  },
  {
    name: 'PVP',
    columns: [
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: '1 pekerjaan = 1 PVP. Isi hanya jika PVP dilakukan.',
      },
      { key: 'pvpDate', header: 'Tanggal PVP', required: true, type: 'date', width: 13 },
      {
        key: 'status',
        header: 'Status PVP',
        required: true,
        type: 'StatusPVP',
        width: 12,
        note: 'Disetujui jika minimal 2 direktur menyetujui (lihat sheet PVP_Approval).',
      },
      { key: 'notes', header: 'Catatan', type: 'text', width: 36 },
    ],
  },
  {
    name: 'PVP_Approval',
    columns: [
      { key: 'workRef', header: 'Ref Pekerjaan', required: true, type: 'text', width: 13 },
      {
        key: 'directorName',
        header: 'Nama Direktur',
        required: true,
        type: 'text',
        width: 24,
        note: 'Direktur bukan pengguna SIPITA, tulis namanya.',
      },
      { key: 'decision', header: 'Keputusan', required: true, type: 'Keputusan', width: 12 },
      { key: 'approvalDate', header: 'Tanggal Approval', required: true, type: 'date', width: 15 },
      { key: 'notes', header: 'Catatan', type: 'text', width: 30 },
    ],
  },
  {
    name: 'Approval_Pejabat',
    columns: [
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: 'Untuk metode PL dan PK.',
      },
      { key: 'officialName', header: 'Nama Pejabat', required: true, type: 'text', width: 20 },
      { key: 'position', header: 'Jabatan', type: 'text', width: 18 },
      {
        key: 'referenceNo',
        header: 'No. Referensi',
        type: 'text',
        width: 20,
        note: 'Nomor surat/disposisi jika ada.',
      },
      {
        key: 'approvalDate',
        header: 'Tanggal Approval',
        type: 'date',
        width: 15,
        note: 'Kosongkan jika belum disetujui.',
      },
      { key: 'notes', header: 'Catatan', type: 'text', width: 38 },
    ],
  },
  {
    name: 'PO',
    columns: [
      { key: 'workRef', header: 'Ref Pekerjaan', required: true, type: 'text', width: 13 },
      { key: 'poNo', header: 'No. PO', required: true, type: 'text', width: 13 },
      {
        key: 'poType',
        header: 'Tipe PO',
        required: true,
        type: 'Tipe',
        width: 10,
        note: 'Renewal wajib mengisi data PO sebelumnya.',
      },
      { key: 'poName', header: 'Nama PO', required: true, type: 'text', width: 36 },
      { key: 'poDate', header: 'Tanggal PO', required: true, type: 'date', width: 13 },
      { key: 'currency', header: 'Mata Uang', required: true, type: 'currency', width: 10 },
      { key: 'amount', header: 'Nilai PO', required: true, type: 'money', width: 17 },
      {
        key: 'exchangeRate',
        header: 'Kurs ke IDR',
        required: true,
        type: 'rate',
        width: 11,
        note: RATE_NOTE,
      },
      {
        key: 'amountIdr',
        header: 'Nilai IDR (otomatis)',
        type: 'auto',
        width: 18,
        note: 'money: dihitung = Nilai PO x Kurs. Jangan diisi.',
        formula: (r) => `IF(OR(G${r}="",H${r}=""),"",G${r}*H${r})`,
      },
      { key: 'requesterName', header: 'Requestor PO', type: 'text', width: 16 },
      { key: 'previousPoNo', header: 'No. PO Sebelumnya', type: 'text', width: 17 },
      { key: 'previousPoAmount', header: 'Nilai PO Sebelumnya', type: 'money', width: 17 },
      { key: 'previousPoCurrency', header: 'Mata Uang PO Sebelumnya', type: 'currency', width: 14 },
    ],
  },
  {
    name: 'PO_TOP',
    columns: [
      {
        key: 'poNo',
        header: 'No. PO',
        required: true,
        type: 'text',
        width: 13,
        note: 'Harus ada di sheet PO atau di sistem.',
      },
      { key: 'sequence', header: 'Urutan', required: true, type: 'int', width: 8 },
      { key: 'description', header: 'Deskripsi', required: true, type: 'text', width: 40 },
      {
        key: 'percentage',
        header: 'Persentase',
        type: 'percent',
        width: 12,
        note: 'Isi sebagai persen, mis. 50%.',
      },
      {
        key: 'amount',
        header: 'Nilai Termin (otomatis)',
        type: 'auto',
        width: 20,
        note: 'money: Persentase x Nilai PO. Jangan diisi.',
        formula: (r) =>
          `IF(OR(A${r}="",D${r}=""),"",IFERROR(D${r}*INDEX(PO!$G$2:$G$1000,MATCH(A${r},PO!$B$2:$B$1000,0)),""))`,
      },
      { key: 'dueDate', header: 'Jatuh Tempo', type: 'date', width: 13 },
      { key: 'isPaid', header: 'Sudah Dibayar', type: 'bool', width: 13 },
    ],
  },
  {
    name: 'Agreement',
    columns: [
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: 'Pekerjaan yang menghasilkan agreement ini.',
      },
      { key: 'agreementNo', header: 'No. Agreement', required: true, type: 'text', width: 17 },
      { key: 'agreementType', header: 'Tipe Agreement', required: true, type: 'Tipe', width: 13 },
      { key: 'title', header: 'Judul Agreement', required: true, type: 'text', width: 44 },
      { key: 'vendor', header: 'Kode Vendor', required: true, type: 'code', width: 11 },
      {
        key: 'poNo',
        header: 'No. PO',
        required: true,
        type: 'text',
        width: 13,
        note: '1 agreement = 1 PO.',
      },
      { key: 'pic', header: 'PIC (Username)', required: true, type: 'text', width: 16 },
      { key: 'periodStart', header: 'Periode Mulai', required: true, type: 'date', width: 13 },
      { key: 'periodEnd', header: 'Periode Selesai', required: true, type: 'date', width: 13 },
      { key: 'currency', header: 'Mata Uang', required: true, type: 'currency', width: 10 },
      { key: 'amount', header: 'Nilai', required: true, type: 'money', width: 17 },
      { key: 'exchangeRate', header: 'Kurs ke IDR', required: true, type: 'rate', width: 11 },
      {
        key: 'amountIdr',
        header: 'Nilai IDR (otomatis)',
        type: 'auto',
        width: 18,
        note: 'money: Nilai x Kurs. Jangan diisi.',
        formula: (r) => `IF(OR(K${r}="",L${r}=""),"",K${r}*L${r})`,
      },
    ],
  },
  {
    name: 'Addendum',
    columns: [
      {
        key: 'agreementNo',
        header: 'No. Agreement',
        required: true,
        type: 'text',
        width: 17,
        note: 'Agreement yang di-addendum.',
      },
      {
        key: 'workRef',
        header: 'Ref Pekerjaan',
        required: true,
        type: 'text',
        width: 13,
        note: 'Pekerjaan PK yang menghasilkan addendum ini.',
      },
      { key: 'addendumNo', header: 'No. Addendum', required: true, type: 'text', width: 24 },
      { key: 'title', header: 'Judul Addendum', required: true, type: 'text', width: 46 },
      { key: 'addendumDate', header: 'Tanggal Addendum', required: true, type: 'date', width: 15 },
      { key: 'newPeriodEnd', header: 'Periode Selesai Baru', type: 'date', width: 17 },
      {
        key: 'valueChange',
        header: 'Perubahan Nilai',
        type: 'money',
        width: 17,
        note: 'Tambahan nilai karena addendum.',
      },
      { key: 'currency', header: 'Mata Uang', type: 'currency', width: 10 },
      { key: 'poNo', header: 'No. PO Terkait', type: 'text', width: 14 },
      { key: 'notes', header: 'Catatan', type: 'text', width: 24 },
    ],
  },
];

export const sheetSpec = (name: SheetName) => SHEETS.find((s) => s.name === name)!;

/** Header as written in the file: required columns end with " *". */
export const headerText = (c: ColumnSpec) => (c.required ? `${c.header} *` : c.header);

/** Header comparison ignores the "*" marker, case and extra spaces (§7). */
export const normalizeHeader = (h: string) =>
  h.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

export const isList = (t: ColumnType): t is ListName => t in LISTS;

/** Rows per sheet accepted from one file (§12: limit rows per sheet). */
export const MAX_ROWS_PER_SHEET = 10_000;
