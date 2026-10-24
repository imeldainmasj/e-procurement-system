import {
  APPROVAL_LEVEL_LABELS,
  APPROVAL_STEP_STATUS_LABELS,
  formatRupiah,
  PR_PRIORITY_LABELS,
} from '@sipita/shared';
import { dayjs } from '../../lib/dayjs.js';
import { createPdf, drawFooters, drawKeyValues, drawTable, pdfToBuffer } from '../../lib/pdf.js';
import type { MemoDetailRecord } from './memos.service.js';

const levelLabel = (level: number) => APPROVAL_LEVEL_LABELS[level] ?? `Level ${level}`;
const date = (d: Date | null, format = 'D MMMM YYYY') => (d ? dayjs(d).tz().format(format) : '-');

/** Renders the internal memo (header, details, items, approval table) as a PDF buffer. */
export async function renderMemoPdf(memo: MemoDetailRecord): Promise<Buffer> {
  const doc = createPdf(memo.number);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Header
  doc.font('Helvetica-Bold').fontSize(16).text('MEMO INTERNAL', { align: 'center' });
  doc.font('Helvetica').fontSize(10).text('Divisi Teknologi Informasi', { align: 'center' });
  doc.moveDown(0.5);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.8);

  const levels = memo.steps.map((s) => levelLabel(s.level));
  drawKeyValues(doc, [
    ['Nomor', memo.number],
    ['Tanggal', date(memo.createdAt)],
    ['Kepada', levels.join(', ')],
    ['Dari', `${memo.pr.requester.name} (${memo.pr.division.name})`],
    ['Perihal', memo.subject],
    ['Referensi', memo.pr.number ?? '-'],
    ['Prioritas', PR_PRIORITY_LABELS[memo.pr.priority]],
    ['Tanggal Dibutuhkan', date(memo.pr.neededDate)],
  ]);
  doc.moveDown(0.5);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.8);

  doc.font('Helvetica').fontSize(10).text(memo.body, { width, align: 'justify', paragraphGap: 4 });
  doc.moveDown();

  doc.font('Helvetica-Bold').fontSize(11).text('Rincian Kebutuhan');
  doc.moveDown(0.4);
  drawTable(
    doc,
    [
      { header: 'No', width: 28, align: 'center' },
      { header: 'Item', width: 207 },
      { header: 'Jumlah', width: 70, align: 'right' },
      { header: 'Estimasi Harga', width: 95, align: 'right' },
      { header: 'Subtotal', width: 95, align: 'right' },
    ],
    [
      ...memo.pr.items.map((item, i) => [
        String(i + 1),
        [
          item.item ? `${item.item.name} (${item.item.code})` : (item.freeTextName ?? ''),
          item.notes,
        ]
          .filter(Boolean)
          .join('\n'),
        `${item.qty} ${item.unit}`,
        formatRupiah(item.estimatedUnitPrice.toString()),
        formatRupiah(item.subtotal.toString()),
      ]),
      ['', 'TOTAL', '', '', formatRupiah(memo.totalAmount.toString())],
    ],
  );

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).text('Persetujuan');
  doc.moveDown(0.4);
  drawTable(
    doc,
    [
      { header: 'Level', width: 40, align: 'center' },
      { header: 'Jabatan', width: 85 },
      { header: 'Status', width: 85 },
      { header: 'Nama', width: 95 },
      { header: 'Tanggal', width: 80 },
      { header: 'Catatan', width: 110 },
    ],
    memo.steps.map((step) => [
      String(step.level),
      levelLabel(step.level),
      APPROVAL_STEP_STATUS_LABELS[step.status],
      step.approver?.name ?? '-',
      date(step.actedAt, 'D MMM YYYY HH:mm'),
      step.comment ?? '',
    ]),
  );

  drawFooters(
    doc,
    `Dibuat otomatis oleh SIPITA pada ${dayjs().tz().format('D MMMM YYYY HH:mm')} WIB`,
  );
  return pdfToBuffer(doc);
}

export function memoPdfFileName(number: string): string {
  return `${number.replaceAll('/', '-')}.pdf`;
}
