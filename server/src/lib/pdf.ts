import PDFDocument from 'pdfkit';

export type PdfDoc = InstanceType<typeof PDFDocument>;

export interface PdfColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

const CELL_PADDING = 4;
const FONT_SIZE = 9;

export function createPdf(title: string): PdfDoc {
  return new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true,
    info: { Title: title, Creator: 'SIPITA' },
  });
}

/** Collects the rendered document into a Buffer. */
export function pdfToBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function rowHeight(doc: PdfDoc, columns: PdfColumn[], cells: string[]): number {
  return (
    Math.max(
      ...columns.map((col, i) =>
        doc.heightOfString(cells[i] ?? '', { width: col.width - CELL_PADDING * 2 }),
      ),
    ) +
    CELL_PADDING * 2
  );
}

function drawRow(
  doc: PdfDoc,
  columns: PdfColumn[],
  cells: string[],
  y: number,
  height: number,
  header: boolean,
) {
  let x = doc.page.margins.left;
  if (header)
    doc
      .rect(
        x,
        y,
        columns.reduce((w, c) => w + c.width, 0),
        height,
      )
      .fill('#f1f3f5')
      .fillColor('#000');
  doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT_SIZE);
  columns.forEach((col, i) => {
    doc.rect(x, y, col.width, height).strokeColor('#ced4da').lineWidth(0.5).stroke();
    doc.fillColor('#000').text(cells[i] ?? '', x + CELL_PADDING, y + CELL_PADDING, {
      width: col.width - CELL_PADDING * 2,
      align: col.align ?? 'left',
    });
    x += col.width;
  });
}

/** Bordered table that breaks across pages, repeating the header row. */
export function drawTable(doc: PdfDoc, columns: PdfColumn[], rows: string[][]): void {
  const bottom = () => doc.page.height - doc.page.margins.bottom - 30;
  const headerCells = columns.map((c) => c.header);
  doc.fontSize(FONT_SIZE);

  let y = doc.y;
  const drawHeader = () => {
    const h = rowHeight(doc, columns, headerCells);
    drawRow(doc, columns, headerCells, y, h, true);
    y += h;
  };
  drawHeader();

  for (const cells of rows) {
    doc.font('Helvetica');
    const h = rowHeight(doc, columns, cells);
    if (y + h > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    drawRow(doc, columns, cells, y, h, false);
    y += h;
  }
  doc.x = doc.page.margins.left;
  doc.y = y + 8;
}

/** Label/value pairs in two aligned columns. */
export function drawKeyValues(doc: PdfDoc, pairs: [string, string][], labelWidth = 120): void {
  const left = doc.page.margins.left;
  const valueWidth = doc.page.width - doc.page.margins.right - left - labelWidth;
  doc.fontSize(10);
  for (const [label, value] of pairs) {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(label, left, y, { width: labelWidth });
    doc.font('Helvetica').text(`: ${value}`, left + labelWidth, y, { width: valueWidth });
    doc.y = Math.max(doc.y, y) + 2;
  }
  doc.x = left;
}

/** "Halaman x dari y" plus a generated-by line on every page. */
export function drawFooters(doc: PdfDoc, note: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - doc.page.margins.bottom - 10;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // Lift the bottom margin so writing in the footer area does not add a page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#6c757d');
    doc.text(note, doc.page.margins.left, y, { width, align: 'left', lineBreak: false });
    doc.text(`Halaman ${i - range.start + 1} dari ${range.count}`, doc.page.margins.left, y, {
      width,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = margin;
    doc.fillColor('#000');
  }
}
