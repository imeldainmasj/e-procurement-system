import { formatNpwp, formatRupiah, PO_STATUS_LABELS, type SettingsDto } from '@sipita/shared';
import { dayjs } from '../../lib/dayjs.js';
import { createPdf, drawFooters, drawKeyValues, drawTable, pdfToBuffer } from '../../lib/pdf.js';
import type { PoDetailRecord } from './purchase-orders.service.js';

const date = (d: Date | null) => (d ? dayjs(d).format('D MMMM YYYY') : '-');
const percent = (p: { toString(): string }) => `${Number(p.toString()).toLocaleString('id-ID')}%`;

/** Renders the purchase order (buyer, vendor, items, totals, terms, signatures) as a PDF. */
export async function renderPoPdf(po: PoDetailRecord, settings: SettingsDto): Promise<Buffer> {
  const doc = createPdf(po.number);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Header: buyer identity + document title
  doc.font('Helvetica-Bold').fontSize(13).text(settings.COMPANY_NAME, left, doc.y, { width });
  doc.font('Helvetica').fontSize(9).fillColor('#495057').text(settings.COMPANY_ADDRESS, { width });
  doc.fillColor('#000').moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(16).text('PURCHASE ORDER', { align: 'center' });
  if (po.status !== 'ISSUED') {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(po.status === 'CANCELLED' ? '#c92a2a' : '#868e96')
      .text(`[ ${PO_STATUS_LABELS[po.status].toUpperCase()} ]`, { align: 'center' });
    doc.fillColor('#000');
  }
  doc.moveDown(0.4);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.8);

  drawKeyValues(doc, [
    ['Nomor PO', po.number],
    ['Tanggal PO', date(po.orderDate)],
    ['Referensi', `${po.pr.number ?? '-'} — ${po.pr.title}`],
    ['No. Penawaran', po.quotation.quoteNumber],
    ['Estimasi Tiba', date(po.expectedDate)],
  ]);
  doc.moveDown(0.6);

  const vendorLines = [
    po.vendor.name,
    [po.vendor.address, po.vendor.city].filter(Boolean).join(', '),
    po.vendor.npwp ? `NPWP: ${formatNpwp(po.vendor.npwp)}` : '',
    [po.vendor.picName && `UP: ${po.vendor.picName}`, po.vendor.phone, po.vendor.email]
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);
  drawTable(
    doc,
    [
      { header: 'Kepada (Vendor)', width: width / 2 },
      { header: 'Alamat Pengiriman', width: width / 2 },
    ],
    [[vendorLines.join('\n'), po.deliveryAddress ?? settings.COMPANY_ADDRESS]],
  );

  doc.font('Helvetica-Bold').fontSize(11).text('Rincian Barang/Jasa');
  doc.moveDown(0.4);
  drawTable(
    doc,
    [
      { header: 'No', width: 28, align: 'center' },
      { header: 'Item', width: 207 },
      { header: 'Jumlah', width: 70, align: 'right' },
      { header: 'Harga Satuan', width: 95, align: 'right' },
      { header: 'Subtotal', width: 95, align: 'right' },
    ],
    [
      ...po.items.map((item, i) => [
        String(i + 1),
        item.item ? `${item.name} (${item.item.code})` : item.name,
        `${item.qty} ${item.unit}`,
        formatRupiah(item.unitPrice.toString()),
        formatRupiah(item.subtotal.toString()),
      ]),
      ['', 'Subtotal', '', '', formatRupiah(po.subtotal.toString())],
      ['', `PPN ${percent(po.taxPercent)}`, '', '', formatRupiah(po.taxAmount.toString())],
      ['', 'TOTAL', '', '', formatRupiah(po.total.toString())],
    ],
  );

  if (po.terms) {
    doc.font('Helvetica-Bold').fontSize(11).text('Syarat & Ketentuan');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text(po.terms, { width });
    doc.moveDown(0.6);
  }
  if (po.notes) {
    doc.font('Helvetica-Bold').fontSize(11).text('Catatan');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text(po.notes, { width });
    doc.moveDown(0.6);
  }

  // Signatures
  if (doc.y > doc.page.height - doc.page.margins.bottom - 140) doc.addPage();
  doc.moveDown(1);
  const y = doc.y;
  const col = width / 2;
  doc.font('Helvetica').fontSize(10);
  doc.text('Dibuat oleh,', left, y, { width: col, align: 'center' });
  doc.text('Vendor,', left + col, y, { width: col, align: 'center' });
  doc.font('Helvetica-Bold');
  doc.text(po.issuedBy?.name ?? po.createdBy.name, left, y + 70, { width: col, align: 'center' });
  doc.text(po.vendor.picName ?? po.vendor.name, left + col, y + 70, {
    width: col,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(9);
  doc.text('Staf Pengadaan', left, y + 84, { width: col, align: 'center' });
  doc.text('Tanda tangan & stempel', left + col, y + 84, { width: col, align: 'center' });
  doc.x = left;

  drawFooters(
    doc,
    `${po.number} · Dibuat otomatis oleh SIPITA pada ${dayjs().tz().format('D MMMM YYYY HH:mm')} WIB`,
  );
  return pdfToBuffer(doc);
}

export function poPdfFileName(number: string): string {
  return `${number.replaceAll('/', '-')}.pdf`;
}
