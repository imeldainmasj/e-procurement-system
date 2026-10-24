/**
 * Procurement sample data (stage 7): a year of completed purchasing history for the
 * dashboard and price trends, plus a live quotation round on this month's approved PR.
 *
 * History rows are written directly with back-dated timestamps (the services always use
 * "now"); the live round goes through the real services. Both are skipped when purchase
 * orders already exist, and the live round only touches an approved PR without
 * quotations, so reruns never duplicate data.
 */
import type { PrStatus } from '@sipita/shared';
import { Prisma } from '../src/generated/prisma/client.js';
import { dayjs } from '../src/lib/dayjs.js';
import { prisma, type TxClient } from '../src/lib/prisma.js';
import { resolveApprovalLevels } from '../src/modules/approval-rules/approval-rules.service.js';
import * as purchaseOrders from '../src/modules/purchase-orders/purchase-orders.service.js';
import * as quotations from '../src/modules/quotations/quotations.service.js';
import type { Actor } from '../src/utils/actor.js';
import { DOCUMENT_PREFIX, nextDocumentNumber } from '../src/utils/numbering.js';

interface HistoryPr {
  /** Submission date (Asia/Jakarta), YYYY-MM-DD. */
  date: string;
  requester: string;
  title: string;
  justification: string;
  items: { code: string; qty: number; price: number }[];
  /** Vendor code → price factor on the estimate; the cheapest ACTIVE vendor wins. */
  quotes: [string, number][];
  justify?: string;
}

const history: HistoryPr[] = [
  {
    date: '2026-01-06',
    requester: 'pengadaan',
    title: 'Laptop programmer baru',
    justification: 'Penambahan 3 programmer untuk proyek ERP.',
    items: [{ code: 'LPT-PRO', qty: 3, price: 24_000_000 }],
    quotes: [
      ['VND-001', 0.98],
      ['VND-006', 1.0],
      ['VND-007', 1.04],
    ],
  },
  {
    date: '2026-01-20',
    requester: 'requester',
    title: 'Perpanjangan lisensi Microsoft 365',
    justification: 'Lisensi tahunan 40 user operasional berakhir Februari.',
    items: [{ code: 'LIC-M365', qty: 40, price: 2_300_000 }],
    quotes: [
      ['VND-004', 0.97],
      ['VND-006', 1.03],
    ],
    justify: 'Hanya dua reseller resmi Microsoft yang terdaftar sebagai vendor.',
  },
  {
    date: '2026-02-10',
    requester: 'staf.keuangan',
    title: 'Monitor 24 inci staf keuangan',
    justification: 'Dual monitor untuk tim rekonsiliasi.',
    items: [{ code: 'MON-24', qty: 6, price: 2_100_000 }],
    quotes: [
      ['VND-001', 1.0],
      ['VND-006', 0.96],
      ['VND-007', 0.99],
    ],
  },
  {
    date: '2026-02-24',
    requester: 'pengadaan',
    title: 'Access point WiFi 6 lantai 2–4',
    justification: 'Sinyal WiFi lemah di lantai 2–4 setelah renovasi.',
    items: [{ code: 'AP-WIFI6', qty: 6, price: 4_500_000 }],
    quotes: [
      ['VND-002', 0.95],
      ['VND-003', 1.0],
      ['VND-007', 0.93],
    ],
    justify: 'Vendor termurah (CV Kabel Mandiri) masih dalam review dokumen.',
  },
  {
    date: '2026-03-09',
    requester: 'staf.hrd',
    title: 'Laptop staf HRD',
    justification: 'Penggantian laptop lama yang sudah 5 tahun.',
    items: [
      { code: 'LPT-STD', qty: 4, price: 14_500_000 },
      { code: 'BAG-LPT', qty: 4, price: 350_000 },
    ],
    quotes: [
      ['VND-001', 0.96],
      ['VND-006', 0.98],
      ['VND-007', 1.01],
    ],
  },
  {
    date: '2026-03-25',
    requester: 'staf.marketing',
    title: 'Printer warna MFP marketing',
    justification: 'Cetak materi promosi internal.',
    items: [
      { code: 'PRN-MFP', qty: 1, price: 18_000_000 },
      { code: 'INK-CMYK', qty: 10, price: 450_000 },
    ],
    quotes: [
      ['VND-005', 0.97],
      ['VND-001', 1.05],
    ],
    justify: 'Hanya dua vendor yang menyediakan unit MFP warna dengan servis on-site.',
  },
  {
    date: '2026-04-14',
    requester: 'pengadaan',
    title: 'Switch 24 port gedung B',
    justification: 'Switch lama sering restart.',
    items: [{ code: 'SW-24P', qty: 3, price: 18_000_000 }],
    quotes: [
      ['VND-002', 0.98],
      ['VND-003', 0.96],
      ['VND-007', 1.0],
    ],
  },
  {
    date: '2026-04-28',
    requester: 'requester',
    title: 'Toner & tinta kuartal II',
    justification: 'Kebutuhan rutin kuartal II.',
    items: [
      { code: 'TNR-LSR', qty: 20, price: 650_000 },
      { code: 'INK-CMYK', qty: 10, price: 450_000 },
    ],
    quotes: [
      ['VND-005', 0.95],
      ['VND-001', 1.02],
    ],
    justify: 'Pembelian rutin dari distributor resmi; vendor lain tidak menyediakan.',
  },
  {
    date: '2026-05-12',
    requester: 'staf.keuangan',
    title: 'NAS backup data keuangan',
    justification: 'Backup harian data akuntansi sesuai rekomendasi audit.',
    items: [
      { code: 'NAS-4BAY', qty: 1, price: 28_000_000 },
      { code: 'SSD-1TB', qty: 4, price: 1_600_000 },
    ],
    quotes: [
      ['VND-003', 0.97],
      ['VND-006', 1.0],
      ['VND-001', 1.03],
    ],
  },
  {
    date: '2026-05-27',
    requester: 'pengadaan',
    title: 'Jasa maintenance jaringan semester II',
    justification: 'Kontrak maintenance semester I berakhir Juni.',
    items: [{ code: 'SVC-MAINT', qty: 1, price: 35_000_000 }],
    quotes: [
      ['VND-002', 1.0],
      ['VND-003', 0.94],
    ],
    justify: 'Hanya dua vendor jaringan bersertifikat yang aktif.',
  },
  {
    date: '2026-06-09',
    requester: 'staf.marketing',
    title: 'Laptop desainer grafis',
    justification: 'Kebutuhan render video kampanye.',
    items: [{ code: 'LPT-PRO', qty: 2, price: 24_000_000 }],
    quotes: [
      ['VND-001', 0.99],
      ['VND-006', 0.97],
      ['VND-007', 0.95],
    ],
    justify: 'Vendor termurah masih dalam review; dipilih vendor aktif termurah.',
  },
  {
    date: '2026-06-23',
    requester: 'staf.hrd',
    title: 'Headset & webcam ruang rapat',
    justification: 'Rapat daring dengan kantor cabang.',
    items: [
      { code: 'HEADSET', qty: 10, price: 650_000 },
      { code: 'WEBCAM-HD', qty: 10, price: 900_000 },
    ],
    quotes: [
      ['VND-001', 0.96],
      ['VND-006', 1.0],
      ['VND-007', 0.98],
    ],
  },
  {
    date: '2026-07-07',
    requester: 'requester',
    title: 'PC desktop admin gudang',
    justification: 'Penambahan meja admin di gudang baru.',
    items: [{ code: 'PC-DSK', qty: 5, price: 11_000_000 }],
    quotes: [
      ['VND-001', 1.0],
      ['VND-006', 0.97],
      ['VND-007', 1.02],
    ],
  },
  {
    date: '2026-07-21',
    requester: 'pengadaan',
    title: 'UPS ruang server',
    justification: 'Baterai UPS lama sudah drop.',
    items: [{ code: 'UPS-3K', qty: 2, price: 12_500_000 }],
    quotes: [
      ['VND-003', 0.98],
      ['VND-006', 1.01],
      ['VND-001', 1.04],
    ],
  },
  {
    date: '2026-08-11',
    requester: 'staf.keuangan',
    title: 'Lisensi Adobe Acrobat',
    justification: 'Tanda tangan elektronik dokumen keuangan.',
    items: [{ code: 'LIC-ADOBE', qty: 8, price: 3_200_000 }],
    quotes: [
      ['VND-004', 0.96],
      ['VND-006', 1.02],
    ],
    justify: 'Hanya dua reseller lisensi Adobe yang terdaftar.',
  },
  {
    date: '2026-08-25',
    requester: 'pengadaan',
    title: 'Kabel & konektor jaringan',
    justification: 'Penataan ulang kabel ruang server.',
    items: [
      { code: 'CBL-CAT6', qty: 4, price: 2_750_000 },
      { code: 'RJ45', qty: 5, price: 250_000 },
    ],
    quotes: [
      ['VND-002', 0.97],
      ['VND-007', 0.92],
      ['VND-003', 1.0],
    ],
    justify: 'Vendor termurah masih dalam review; dipilih vendor aktif termurah.',
  },
  {
    date: '2026-09-08',
    requester: 'requester',
    title: 'Laptop supervisor operasional',
    justification: 'Promosi 3 supervisor baru.',
    items: [{ code: 'LPT-STD', qty: 3, price: 14_500_000 }],
    quotes: [
      ['VND-001', 1.01],
      ['VND-006', 0.99],
      ['VND-007', 1.03],
    ],
  },
  {
    date: '2026-09-22',
    requester: 'staf.marketing',
    title: 'Monitor 27 inci studio konten',
    justification: 'Akurasi warna untuk editing.',
    items: [{ code: 'MON-27', qty: 3, price: 4_200_000 }],
    quotes: [
      ['VND-001', 0.98],
      ['VND-006', 1.0],
      ['VND-007', 0.97],
    ],
    justify: 'Vendor termurah masih dalam review; dipilih vendor aktif termurah.',
  },
  {
    date: '2026-10-02',
    requester: 'staf.hrd',
    title: 'Lisensi Windows 11 Pro',
    justification: 'Upgrade OS laptop HRD.',
    items: [{ code: 'LIC-WIN-PRO', qty: 10, price: 2_900_000 }],
    quotes: [
      ['VND-004', 0.98],
      ['VND-006', 1.03],
    ],
    justify: 'Hanya dua reseller lisensi Microsoft yang terdaftar.',
  },
  {
    date: '2026-10-09',
    requester: 'pengadaan',
    title: 'Router edge kantor cabang',
    justification: 'Pembukaan kantor cabang Bandung.',
    items: [{ code: 'RTR-EDGE', qty: 2, price: 9_000_000 }],
    quotes: [
      ['VND-002', 0.97],
      ['VND-003', 1.0],
      ['VND-007', 0.99],
    ],
  },
];

/** Typical rating per vendor (onTime, quality, price, service); varied a little per PO. */
const vendorRatings: Record<string, [number, number, number, number]> = {
  'VND-001': [4, 4, 4, 5],
  'VND-002': [5, 4, 4, 4],
  'VND-003': [4, 5, 3, 4],
  'VND-004': [5, 4, 5, 4],
  'VND-005': [3, 4, 4, 3],
  'VND-006': [4, 3, 5, 4],
};

const APPROVER_BY_LEVEL: Record<number, string> = { 1: 'manajer.it', 2: 'keuangan', 3: 'direksi' };
const at = (date: string, addDays: number, hour = 9) =>
  dayjs.tz(date).add(addDays, 'day').hour(hour).toDate();
const dateOnly = (d: Date) => new Date(dayjs(d).tz().format('YYYY-MM-DD'));
const round = (n: number) => Math.round(n / 1000) * 1000;

async function userId(tx: TxClient, key: string): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({
    where: { email: `${key}@perusahaan.co.id` },
    select: { id: true },
  });
  return user.id;
}

/** Writes one back-dated PR status change, mirroring transitionPr's audit entry. */
async function logStatus(
  tx: TxClient,
  prId: string,
  number: string,
  from: PrStatus,
  to: PrStatus,
  by: string,
  when: Date,
  note: string | null = null,
) {
  await tx.auditLog.create({
    data: {
      userId: by,
      action: 'STATUS_CHANGE',
      entity: 'PurchaseRequest',
      entityId: prId,
      before: { status: from },
      after: { status: to, number, note },
      createdAt: when,
    },
  });
}

async function seedHistoryPr(sample: HistoryPr, index: number, today: dayjs.Dayjs) {
  await prisma.$transaction(async (tx) => {
    const requesterId = await userId(tx, sample.requester);
    const requester = await tx.user.findUniqueOrThrow({
      where: { id: requesterId },
      select: { divisionId: true, approvalLevel: true },
    });
    const warehouseId = await userId(tx, 'gudang');
    const procurementId = await userId(tx, 'pengadaan');

    const catalog = await tx.item.findMany({
      where: { code: { in: sample.items.map((i) => i.code) } },
      select: { id: true, code: true, unit: true, name: true },
    });
    const byCode = new Map(catalog.map((c) => [c.code, c]));
    const lines = sample.items.map((line, i) => ({
      ...line,
      item: byCode.get(line.code)!,
      sortOrder: i,
    }));
    const estimatedTotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);

    // ── PR, stock check, memo & approvals ─────────────────────────────────
    const submitted = at(sample.date, 0, 9);
    const number = await nextDocumentNumber(tx, DOCUMENT_PREFIX.PURCHASE_REQUEST, submitted);
    const pr = await tx.purchaseRequest.create({
      data: {
        number,
        title: sample.title,
        justification: sample.justification,
        priority: index % 4 === 0 ? 'HIGH' : 'MEDIUM',
        neededDate: dateOnly(at(sample.date, 30)),
        estimatedTotal,
        status: 'DRAFT',
        submittedAt: submitted,
        stockCheckedById: warehouseId,
        stockCheckedAt: at(sample.date, 1, 10),
        stockCheckNotes: 'Tidak tersedia di gudang',
        requesterId,
        createdById: requesterId,
        divisionId: requester.divisionId!,
        createdAt: at(sample.date, -1, 15),
        items: {
          create: lines.map((l) => ({
            itemId: l.item.id,
            unit: l.item.unit,
            qty: l.qty,
            estimatedUnitPrice: l.price,
            subtotal: l.price * l.qty,
            sortOrder: l.sortOrder,
          })),
        },
      },
      select: { id: true, items: { select: { id: true, itemId: true, qty: true } } },
    });
    await tx.auditLog.create({
      data: {
        userId: requesterId,
        action: 'CREATE',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        createdAt: at(sample.date, -1, 15),
      },
    });
    await logStatus(tx, pr.id, number, 'DRAFT', 'SUBMITTED', requesterId, submitted);
    await logStatus(
      tx,
      pr.id,
      number,
      'SUBMITTED',
      'STOCK_CHECK',
      warehouseId,
      at(sample.date, 1, 8),
    );
    await logStatus(
      tx,
      pr.id,
      number,
      'STOCK_CHECK',
      'PENDING_APPROVAL',
      warehouseId,
      at(sample.date, 1, 10),
      'Tidak tersedia di gudang',
    );

    const { rule, levels } = await resolveApprovalLevels(estimatedTotal, tx);
    const memoDate = at(sample.date, 1, 10);
    let decided = memoDate;
    const steps = [];
    for (const [i, level] of levels.entries()) {
      const self = requester.approvalLevel === level;
      decided = at(sample.date, 2 + i, 11 + i);
      steps.push({
        level,
        sequence: i + 1,
        status: self ? ('SKIPPED' as const) : ('APPROVED' as const),
        approverId: self ? null : await userId(tx, APPROVER_BY_LEVEL[level]!),
        comment: self ? 'Dilewati otomatis: pemohon adalah approver level ini' : 'Disetujui',
        pendingSince: at(sample.date, 1 + i, 10),
        actedAt: decided,
      });
    }
    await tx.internalMemo.create({
      data: {
        number: await nextDocumentNumber(tx, DOCUMENT_PREFIX.MEMO, memoDate),
        prId: pr.id,
        subject: `Permohonan Pengadaan: ${sample.title}`,
        body: `Dengan hormat,\n\nBersama ini kami mengajukan permohonan pengadaan "${sample.title}".\n\nJustifikasi:\n${sample.justification}`,
        status: 'APPROVED',
        totalAmount: estimatedTotal,
        approvalRuleId: rule.id,
        decidedAt: decided,
        createdById: warehouseId,
        createdAt: memoDate,
        steps: { create: steps },
      },
    });
    const approverId = steps.findLast((s) => s.approverId)?.approverId ?? procurementId;
    await logStatus(
      tx,
      pr.id,
      number,
      'PENDING_APPROVAL',
      'APPROVED',
      approverId,
      decided,
      'Disetujui melalui memo',
    );

    // ── Quotations & winner ───────────────────────────────────────────────
    const quoteDate = dayjs(decided).add(2, 'day');
    const vendors = await tx.vendor.findMany({
      where: { code: { in: sample.quotes.map(([code]) => code) } },
      select: { id: true, code: true, name: true, status: true },
    });
    const vendorByCode = new Map(vendors.map((v) => [v.code, v]));
    const created = [];
    for (const [code, factor] of sample.quotes) {
      const vendor = vendorByCode.get(code)!;
      const priced = pr.items.map((prItem, i) => {
        const unitPrice = round(lines[i]!.price * factor);
        return {
          prItemId: prItem.id,
          itemId: prItem.itemId,
          qty: prItem.qty,
          unitPrice,
          subtotal: unitPrice * prItem.qty,
        };
      });
      const total = priced.reduce((s, p) => s + p.subtotal, 0);
      const quotation = await tx.quotation.create({
        data: {
          prId: pr.id,
          vendorId: vendor.id,
          quoteNumber: `${code.replace('VND-', 'Q')}/${quoteDate.format('YYMM')}/${String(index + 1).padStart(3, '0')}`,
          quoteDate: dateOnly(quoteDate.toDate()),
          validUntil: dateOnly(quoteDate.add(30, 'day').toDate()),
          deliveryDays: 5 + (index % 3) * 2,
          paymentTerms: '30 hari setelah barang diterima',
          totalAmount: total,
          createdById: procurementId,
          createdAt: quoteDate.toDate(),
          items: {
            create: priced.map(({ itemId: _itemId, ...p }) => p),
          },
        },
        select: { id: true },
      });
      await tx.priceHistory.createMany({
        data: priced.map((p) => ({
          itemId: p.itemId!,
          vendorId: vendor.id,
          unitPrice: p.unitPrice,
          sourceType: 'QUOTATION' as const,
          sourceId: quotation.id,
          recordedAt: dateOnly(quoteDate.toDate()),
        })),
      });
      created.push({ ...quotation, vendor, total, priced });
    }
    if (created.length > 0) {
      await logStatus(
        tx,
        pr.id,
        number,
        'APPROVED',
        'QUOTATION',
        procurementId,
        quoteDate.toDate(),
        'Penawaran vendor mulai diinput',
      );
    }
    const winner = created
      .filter((q) => q.vendor.status === 'ACTIVE')
      .sort((a, b) => a.total - b.total)[0]!;
    const selectedAt = quoteDate.add(2, 'day');
    await tx.quotation.update({
      where: { id: winner.id },
      data: {
        isSelected: true,
        selectedAt: selectedAt.toDate(),
        selectedById: procurementId,
        selectionJustification: sample.justify ?? null,
      },
    });

    // ── Purchase order & receipt state ────────────────────────────────────
    const orderDate = selectedAt.add(1, 'day');
    const expected = orderDate.add(7, 'day');
    const daysAgo = today.diff(orderDate, 'day');
    const poStatus = daysAgo > 45 ? 'CLOSED' : daysAgo > 14 ? 'RECEIVED' : 'ISSUED';
    const prStatus: PrStatus =
      poStatus === 'CLOSED' ? 'COMPLETED' : poStatus === 'RECEIVED' ? 'RECEIVED' : 'PO_ISSUED';
    const received = poStatus !== 'ISSUED';

    const subtotal = new Prisma.Decimal(winner.total);
    const totals = purchaseOrders.computeTotals(subtotal, 11);
    const poNumber = await nextDocumentNumber(
      tx,
      DOCUMENT_PREFIX.PURCHASE_ORDER,
      orderDate.toDate(),
    );
    const po = await tx.purchaseOrder.create({
      data: {
        number: poNumber,
        prId: pr.id,
        vendorId: winner.vendor.id,
        quotationId: winner.id,
        orderDate: dateOnly(orderDate.toDate()),
        expectedDate: dateOnly(expected.toDate()),
        ...totals,
        status: poStatus,
        terms: 'Pembayaran 30 hari setelah barang diterima lengkap dan invoice diterima.',
        deliveryAddress: 'Gudang IT Utama',
        issuedAt: orderDate.hour(14).toDate(),
        issuedById: procurementId,
        createdById: procurementId,
        createdAt: orderDate.hour(10).toDate(),
        items: {
          create: winner.priced.map((p, i) => ({
            prItemId: p.prItemId,
            itemId: p.itemId,
            name: lines[i]!.item.name,
            unit: lines[i]!.item.unit,
            qty: p.qty,
            receivedQty: received ? p.qty : 0,
            unitPrice: p.unitPrice,
            subtotal: p.subtotal,
            sortOrder: i,
          })),
        },
      },
      select: { id: true },
    });
    await tx.priceHistory.createMany({
      data: winner.priced.map((p) => ({
        itemId: p.itemId!,
        vendorId: winner.vendor.id,
        unitPrice: p.unitPrice,
        sourceType: 'PO' as const,
        sourceId: po.id,
        recordedAt: dateOnly(orderDate.toDate()),
      })),
    });
    await logStatus(
      tx,
      pr.id,
      number,
      'QUOTATION',
      'PO_ISSUED',
      procurementId,
      orderDate.hour(14).toDate(),
      `${poNumber} diterbitkan ke ${winner.vendor.name}`,
    );
    if (received) {
      await logStatus(
        tx,
        pr.id,
        number,
        'PO_ISSUED',
        'RECEIVED',
        warehouseId,
        expected.add(1, 'day').toDate(),
        'Barang diterima lengkap',
      );
    }
    if (prStatus === 'COMPLETED') {
      await logStatus(
        tx,
        pr.id,
        number,
        'RECEIVED',
        'COMPLETED',
        warehouseId,
        expected.add(3, 'day').toDate(),
        'Diserahterimakan ke pemohon',
      );
    }
    await tx.purchaseRequest.update({ where: { id: pr.id }, data: { status: prStatus } });

    if (received) {
      const base = vendorRatings[winner.vendor.code] ?? [4, 4, 4, 4];
      const wobble = (n: number, i: number) =>
        Math.max(1, Math.min(5, n + (((index + i) % 3) - 1) * (i % 2)));
      await tx.vendorRating.create({
        data: {
          vendorId: winner.vendor.id,
          poId: po.id,
          onTime: wobble(base[0], 0),
          quality: wobble(base[1], 1),
          price: wobble(base[2], 2),
          service: wobble(base[3], 3),
          ratedById: procurementId,
          createdAt: expected.add(4, 'day').toDate(),
        },
      });
    }
  });
}

async function actor(key: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: `${key}@perusahaan.co.id` },
    select: { id: true, roles: { select: { role: { select: { code: true } } } } },
  });
  return { userId: user.id, roles: user.roles.map((r) => r.role.code), ip: null };
}

/** This month's approved PR goes through the real services: 3 quotations, winner, draft PO. */
export async function seedLiveQuotationRound(): Promise<boolean> {
  const pr = await prisma.purchaseRequest.findFirst({
    where: { status: 'APPROVED', quotations: { none: {} } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, items: { select: { id: true, estimatedUnitPrice: true } } },
  });
  if (!pr) return false;
  const procurement = await actor('pengadaan');
  const today = dayjs().tz().format('YYYY-MM-DD');
  const ids: string[] = [];
  for (const [code, factor] of [
    ['VND-004', 0.95],
    ['VND-006', 1.02],
    ['VND-001', 1.06],
  ] as const) {
    const vendor = await prisma.vendor.findUniqueOrThrow({ where: { code }, select: { id: true } });
    const q = await quotations.create(
      {
        prId: pr.id,
        vendorId: vendor.id,
        quoteNumber: `${code.replace('VND-', 'Q')}/${dayjs().tz().format('YYMM')}/LIVE`,
        quoteDate: today,
        validUntil: dayjs().tz().add(30, 'day').format('YYYY-MM-DD'),
        deliveryDays: 3,
        paymentTerms: '30 hari setelah barang diterima',
        notes: null,
        items: pr.items.map((i) => ({
          prItemId: i.id,
          unitPrice: round(Number(i.estimatedUnitPrice) * factor),
          notes: null,
        })),
      },
      procurement,
    );
    ids.push(q.id);
  }
  await quotations.select(ids[0]!, null, procurement);
  await purchaseOrders.create(
    {
      quotationId: ids[0]!,
      orderDate: today,
      expectedDate: dayjs().tz().add(3, 'day').format('YYYY-MM-DD'),
      taxPercent: 11,
      deliveryAddress: null,
      terms: null,
      notes: null,
    },
    procurement,
  );
  return true;
}

/** Back-dated history; only on a database without purchase orders. */
export async function seedProcurementHistory(): Promise<number> {
  if ((await prisma.purchaseOrder.count()) > 0) return 0;
  const today = dayjs().tz().startOf('day');
  let count = 0;
  for (const [index, sample] of history.entries()) {
    if (dayjs.tz(sample.date).isAfter(today.subtract(10, 'day'))) continue;
    await seedHistoryPr(sample, index, today);
    count++;
  }
  return count;
}
