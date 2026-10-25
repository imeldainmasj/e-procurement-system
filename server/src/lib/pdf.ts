import puppeteer, { type Browser } from 'puppeteer';
import { dayjs } from './dayjs.js';
import { logger } from './logger.js';
import { formatCell, type ReportDocument } from './report-document.js';

/**
 * Report PDF (CLAUDE.md §2: puppeteer): the report tables rendered as an HTML page and
 * printed on A4 landscape. One headless browser is shared and started on first use.
 */

let browser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browser ??= puppeteer.launch({ headless: true }).catch((err: unknown) => {
    browser = null;
    throw err;
  });
  return browser;
}

export async function closePdfBrowser(): Promise<void> {
  const current = browser;
  browser = null;
  if (current)
    await (
      await current
    )
      .close()
      .catch((err: unknown) => logger.warn({ err }, 'Gagal menutup browser PDF'));
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Printable HTML of a report; Velzon primary for headers, everything else neutral. */
export function reportHtml(doc: ReportDocument): string {
  const tables = doc.tables
    .map((t) => {
      const head = t.columns
        .map(
          (c) =>
            `<th class="${c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'num' : ''}">${escape(c.label)}</th>`,
        )
        .join('');
      const body = t.rows.length
        ? t.rows
            .map(
              (row) =>
                `<tr>${t.columns
                  .map((c) => {
                    const num = c.kind && c.kind !== 'text' && c.kind !== 'date';
                    return `<td class="${num ? 'num' : ''}">${escape(formatCell(row[c.key] ?? null, c.kind))}</td>`;
                  })
                  .join('')}</tr>`,
            )
            .join('')
        : `<tr><td colspan="${t.columns.length}" class="empty">Tidak ada data</td></tr>`;
      return `${t.title && t.title !== doc.title ? `<h2>${escape(t.title)}</h2>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join('');
  const meta = [...doc.filters, `Dibuat ${dayjs().tz().format('DD/MM/YYYY HH:mm')}`]
    .map(escape)
    .join(' · ');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #212529; margin: 0; }
    h1 { font-size: 16px; margin: 0 0 2px; } h2 { font-size: 12px; margin: 16px 0 6px; }
    .meta { color: #6c757d; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    tr { page-break-inside: avoid; } thead { display: table-header-group; }
    th { background: #687cfe; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
    td { padding: 4px 6px; border-bottom: 1px solid #e9ebec; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f9f6f3; }
    .num { text-align: right; white-space: nowrap; } .empty { text-align: center; color: #6c757d; }
  </style></head><body><h1>SIPITA — ${escape(doc.title)}</h1><div class="meta">${meta}</div>${tables}</body></html>`;
}

export async function toPdf(doc: ReportDocument): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(reportHtml(doc), { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:right;padding-right:10mm;color:#6c757d">Halaman <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
