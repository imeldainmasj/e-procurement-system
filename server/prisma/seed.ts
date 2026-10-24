import type { PrStatus, Role } from '@sipita/shared';
import { ROLE_LABELS } from '@sipita/shared';
import type { Prisma } from '../src/generated/prisma/client.js';
import { dayjs } from '../src/lib/dayjs.js';
import { hashPassword } from '../src/lib/password.js';
import { createPdf, pdfToBuffer } from '../src/lib/pdf.js';
import { prisma } from '../src/lib/prisma.js';
import { saveFile } from '../src/lib/storage.js';
import {
  approveStep,
  rejectStep,
  startApproval,
} from '../src/modules/approvals/approval-workflow.js';
import type { Actor } from '../src/utils/actor.js';
import { seedLiveQuotationRound, seedProcurementHistory } from './seed-procurement.js';
import { DOCUMENT_PREFIX, nextDocumentNumber } from '../src/utils/numbering.js';

const DEFAULT_PASSWORD = 'Password123!';

const divisions = [
  { code: 'IT', name: 'Teknologi Informasi' },
  { code: 'FIN', name: 'Keuangan' },
  { code: 'HRD', name: 'Sumber Daya Manusia' },
  { code: 'OPS', name: 'Operasional' },
  { code: 'MKT', name: 'Marketing' },
];

interface SeedUser {
  name: string;
  email: string;
  nip: string;
  divisionCode: string;
  roles: Role[];
  approvalLevel?: number;
}

const users: SeedUser[] = [
  {
    name: 'Super Admin',
    email: 'superadmin@perusahaan.co.id',
    nip: '199001010001',
    divisionCode: 'IT',
    roles: ['SUPER_ADMIN'],
  },
  {
    name: 'Rina Wulandari',
    email: 'requester@perusahaan.co.id',
    nip: '199203150002',
    divisionCode: 'OPS',
    roles: ['REQUESTER'],
  },
  {
    name: 'Budi Santoso',
    email: 'gudang@perusahaan.co.id',
    nip: '198807200003',
    divisionCode: 'IT',
    roles: ['WAREHOUSE', 'REQUESTER'],
  },
  {
    name: 'Dewi Lestari',
    email: 'pengadaan@perusahaan.co.id',
    nip: '199105110004',
    divisionCode: 'IT',
    roles: ['PROCUREMENT', 'REQUESTER'],
  },
  {
    name: 'Andi Pratama',
    email: 'manajer.it@perusahaan.co.id',
    nip: '198502280005',
    divisionCode: 'IT',
    roles: ['APPROVER', 'REQUESTER'],
    approvalLevel: 1,
  },
  {
    name: 'Sari Kusuma',
    email: 'keuangan@perusahaan.co.id',
    nip: '198311090006',
    divisionCode: 'FIN',
    roles: ['APPROVER'],
    approvalLevel: 2,
  },
  {
    name: 'Hendra Wijaya',
    email: 'direksi@perusahaan.co.id',
    nip: '197806300007',
    divisionCode: 'OPS',
    roles: ['APPROVER'],
    approvalLevel: 3,
  },
  {
    name: 'Maya Anggraini',
    email: 'manajemen@perusahaan.co.id',
    nip: '198009170008',
    divisionCode: 'OPS',
    roles: ['VIEWER'],
  },
  // Extra requesters so sample purchases span every division (dashboard data).
  {
    name: 'Fajar Nugroho',
    email: 'staf.keuangan@perusahaan.co.id',
    nip: '199406120009',
    divisionCode: 'FIN',
    roles: ['REQUESTER'],
  },
  {
    name: 'Lina Marlina',
    email: 'staf.hrd@perusahaan.co.id',
    nip: '199508230010',
    divisionCode: 'HRD',
    roles: ['REQUESTER'],
  },
  {
    name: 'Yoga Saputra',
    email: 'staf.marketing@perusahaan.co.id',
    nip: '199611040011',
    divisionCode: 'MKT',
    roles: ['REQUESTER'],
  },
];

async function seedRoles(): Promise<Map<Role, string>> {
  const ids = new Map<Role, string>();
  for (const [code, name] of Object.entries(ROLE_LABELS) as [Role, string][]) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    ids.set(code, role.id);
  }
  return ids;
}

async function seedDivisions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const d of divisions) {
    const division = await prisma.division.upsert({
      where: { code: d.code },
      update: { name: d.name, deletedAt: null },
      create: d,
    });
    ids.set(d.code, division.id);
  }
  return ids;
}

async function seedUsers(
  roleIds: Map<Role, string>,
  divisionIds: Map<string, string>,
): Promise<void> {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  for (const u of users) {
    const data = {
      name: u.name,
      nip: u.nip,
      passwordHash,
      divisionId: divisionIds.get(u.divisionCode) ?? null,
      approvalLevel: u.approvalLevel ?? null,
      isActive: true,
      deletedAt: null,
    };
    const roleLinks = u.roles.map((code) => ({ roleId: roleIds.get(code)! }));

    await prisma.user.upsert({
      where: { email: u.email },
      update: { ...data, roles: { deleteMany: {}, create: roleLinks } },
      create: { ...data, email: u.email, roles: { create: roleLinks } },
    });
  }

  // Division heads
  const head = await prisma.user.findUniqueOrThrow({
    where: { email: 'manajer.it@perusahaan.co.id' },
  });
  await prisma.division.update({ where: { code: 'IT' }, data: { headUserId: head.id } });
}

const categories = [
  { code: 'HARDWARE', name: 'Komputer & Laptop', description: 'PC, laptop, workstation' },
  { code: 'PERIPHERAL', name: 'Periferal', description: 'Monitor, keyboard, mouse, webcam' },
  {
    code: 'NETWORK',
    name: 'Perangkat Jaringan',
    description: 'Switch, router, access point, kabel',
  },
  { code: 'SERVER', name: 'Server & Storage', description: 'Server, NAS, UPS rack' },
  { code: 'PRINTER', name: 'Printer & Scanner', description: null },
  { code: 'SOFTWARE', name: 'Perangkat Lunak', description: 'Aplikasi dengan pembelian putus' },
  { code: 'LICENSE', name: 'Lisensi & Langganan', description: 'Lisensi per user/tahun' },
  { code: 'SERVICE', name: 'Jasa & Layanan', description: 'Instalasi, maintenance, konsultasi' },
  { code: 'CONSUMABLE', name: 'Bahan Habis Pakai', description: 'Toner, tinta, kertas, baterai' },
  { code: 'ACCESSORY', name: 'Aksesoris', description: 'Adaptor, tas laptop, kabel' },
];

interface SeedItem {
  code: string;
  name: string;
  category: string;
  unit: string;
  isAsset: boolean;
  minStock?: number;
  specs?: Record<string, string>;
}

const items: SeedItem[] = [
  {
    code: 'LPT-STD',
    name: 'Laptop Standar Kantor 14"',
    category: 'HARDWARE',
    unit: 'unit',
    isAsset: true,
    minStock: 2,
    specs: { CPU: 'Intel Core i5 Gen 13', RAM: '16 GB', Storage: '512 GB SSD' },
  },
  {
    code: 'LPT-PRO',
    name: 'Laptop Performa Tinggi 16"',
    category: 'HARDWARE',
    unit: 'unit',
    isAsset: true,
    minStock: 1,
    specs: { CPU: 'Intel Core i7 Gen 13', RAM: '32 GB', Storage: '1 TB SSD', GPU: 'RTX 4060' },
  },
  {
    code: 'PC-DSK',
    name: 'PC Desktop Kantor',
    category: 'HARDWARE',
    unit: 'unit',
    isAsset: true,
    minStock: 1,
    specs: { CPU: 'Intel Core i5', RAM: '16 GB', Storage: '512 GB SSD' },
  },
  {
    code: 'MON-24',
    name: 'Monitor LED 24"',
    category: 'PERIPHERAL',
    unit: 'unit',
    isAsset: true,
    minStock: 3,
    specs: { Resolusi: '1920x1080', Panel: 'IPS' },
  },
  {
    code: 'MON-27',
    name: 'Monitor LED 27" QHD',
    category: 'PERIPHERAL',
    unit: 'unit',
    isAsset: true,
    minStock: 1,
    specs: { Resolusi: '2560x1440', Panel: 'IPS' },
  },
  {
    code: 'KBM-WL',
    name: 'Keyboard + Mouse Wireless',
    category: 'PERIPHERAL',
    unit: 'set',
    isAsset: false,
    minStock: 5,
  },
  {
    code: 'WEBCAM-HD',
    name: 'Webcam Full HD',
    category: 'PERIPHERAL',
    unit: 'unit',
    isAsset: false,
    minStock: 3,
  },
  {
    code: 'HEADSET',
    name: 'Headset USB dengan Mikrofon',
    category: 'PERIPHERAL',
    unit: 'unit',
    isAsset: false,
    minStock: 5,
  },
  {
    code: 'SW-24P',
    name: 'Switch Managed 24 Port Gigabit',
    category: 'NETWORK',
    unit: 'unit',
    isAsset: true,
    minStock: 1,
    specs: { Port: '24x GbE + 4x SFP', PoE: 'Ya' },
  },
  {
    code: 'SW-8P',
    name: 'Switch Unmanaged 8 Port',
    category: 'NETWORK',
    unit: 'unit',
    isAsset: true,
  },
  {
    code: 'AP-WIFI6',
    name: 'Access Point WiFi 6',
    category: 'NETWORK',
    unit: 'unit',
    isAsset: true,
    minStock: 2,
  },
  {
    code: 'RTR-EDGE',
    name: 'Router Edge / Firewall',
    category: 'NETWORK',
    unit: 'unit',
    isAsset: true,
  },
  {
    code: 'CBL-CAT6',
    name: 'Kabel UTP Cat6 (roll 305m)',
    category: 'NETWORK',
    unit: 'roll',
    isAsset: false,
    minStock: 2,
  },
  {
    code: 'RJ45',
    name: 'Konektor RJ45 Cat6',
    category: 'NETWORK',
    unit: 'box',
    isAsset: false,
    minStock: 3,
    specs: { Isi: '100 pcs' },
  },
  {
    code: 'SRV-RACK',
    name: 'Server Rack 2U',
    category: 'SERVER',
    unit: 'unit',
    isAsset: true,
    specs: { CPU: '2x Xeon Silver', RAM: '128 GB' },
  },
  { code: 'NAS-4BAY', name: 'NAS 4-Bay', category: 'SERVER', unit: 'unit', isAsset: true },
  { code: 'UPS-3K', name: 'UPS 3 kVA', category: 'SERVER', unit: 'unit', isAsset: true },
  { code: 'PRN-LSR', name: 'Printer Laser Mono', category: 'PRINTER', unit: 'unit', isAsset: true },
  {
    code: 'PRN-MFP',
    name: 'Printer Multifungsi Warna',
    category: 'PRINTER',
    unit: 'unit',
    isAsset: true,
  },
  {
    code: 'SCN-DOC',
    name: 'Scanner Dokumen ADF',
    category: 'PRINTER',
    unit: 'unit',
    isAsset: true,
  },
  {
    code: 'LIC-M365',
    name: 'Lisensi Microsoft 365 Business Standard',
    category: 'LICENSE',
    unit: 'user/tahun',
    isAsset: false,
  },
  {
    code: 'LIC-WIN-PRO',
    name: 'Lisensi Windows 11 Pro',
    category: 'LICENSE',
    unit: 'lisensi',
    isAsset: false,
  },
  {
    code: 'LIC-AV',
    name: 'Lisensi Antivirus Endpoint',
    category: 'LICENSE',
    unit: 'user/tahun',
    isAsset: false,
  },
  {
    code: 'LIC-ADOBE',
    name: 'Adobe Creative Cloud',
    category: 'LICENSE',
    unit: 'user/tahun',
    isAsset: false,
  },
  {
    code: 'SW-ERP-MOD',
    name: 'Modul Tambahan ERP',
    category: 'SOFTWARE',
    unit: 'paket',
    isAsset: false,
  },
  {
    code: 'SVC-INSTAL',
    name: 'Jasa Instalasi Jaringan',
    category: 'SERVICE',
    unit: 'titik',
    isAsset: false,
  },
  {
    code: 'SVC-MAINT',
    name: 'Jasa Maintenance Server (bulanan)',
    category: 'SERVICE',
    unit: 'bulan',
    isAsset: false,
  },
  {
    code: 'TNR-LSR',
    name: 'Toner Printer Laser',
    category: 'CONSUMABLE',
    unit: 'pcs',
    isAsset: false,
    minStock: 5,
  },
  {
    code: 'INK-CMYK',
    name: 'Tinta Printer Set CMYK',
    category: 'CONSUMABLE',
    unit: 'set',
    isAsset: false,
    minStock: 3,
  },
  {
    code: 'SSD-1TB',
    name: 'SSD 1 TB (sparepart)',
    category: 'ACCESSORY',
    unit: 'pcs',
    isAsset: false,
    minStock: 2,
  },
  {
    code: 'ADP-USBC',
    name: 'Adaptor USB-C Multiport',
    category: 'ACCESSORY',
    unit: 'pcs',
    isAsset: false,
    minStock: 3,
  },
  {
    code: 'BAG-LPT',
    name: 'Tas Laptop',
    category: 'ACCESSORY',
    unit: 'pcs',
    isAsset: false,
    minStock: 5,
  },
];

async function seedCatalog(): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const category = await prisma.itemCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, description: c.description, deletedAt: null },
      create: c,
    });
    categoryIds.set(c.code, category.id);
  }
  for (const { category, minStock = 0, specs = {}, ...item } of items) {
    const data = {
      ...item,
      minStock,
      specs,
      categoryId: categoryIds.get(category)!,
      deletedAt: null,
    };
    await prisma.item.upsert({ where: { code: item.code }, update: data, create: data });
  }
}

async function seedWarehouses(): Promise<void> {
  const data = {
    name: 'Gudang IT Utama',
    location: 'Kantor Pusat, Lantai 2',
    isActive: true,
    deletedAt: null,
  };
  await prisma.warehouse.upsert({
    where: { code: 'WH-UTAMA' },
    update: data,
    create: { code: 'WH-UTAMA', ...data },
  });
}

/** Default thresholds from CLAUDE.md §5; only seeded when no rule exists, so admin edits survive. */
async function seedApprovalRules(): Promise<void> {
  if ((await prisma.approvalRule.count()) > 0) return;
  await prisma.approvalRule.createMany({
    data: [
      {
        name: 'Di bawah Rp10 juta',
        minAmount: 0,
        minInclusive: true,
        maxAmount: 10_000_000,
        maxInclusive: false,
        levels: [1],
      },
      {
        name: 'Rp10 juta – Rp50 juta',
        minAmount: 10_000_000,
        minInclusive: true,
        maxAmount: 50_000_000,
        maxInclusive: true,
        levels: [1, 2],
      },
      {
        name: 'Di atas Rp50 juta',
        minAmount: 50_000_000,
        minInclusive: false,
        maxAmount: null,
        maxInclusive: false,
        levels: [1, 2, 3],
      },
    ],
  });
}

interface SeedPr {
  requester: string;
  title: string;
  justification: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  neededInDays: number;
  items: { code?: string; freeText?: { name: string; unit: string }; qty: number; price: number }[];
  /** Status path after DRAFT, applied in order with audit entries. */
  path: { status: PrStatus; by: string; note?: string }[];
  /** Approval decisions applied in order once the memo exists (PENDING_APPROVAL path only). */
  decisions?: { by: string; approve: boolean; comment: string }[];
}

const samplePrs: SeedPr[] = [
  {
    requester: 'requester',
    title: 'Laptop untuk 2 staf operasional baru',
    justification: 'Penambahan 2 staf admin operasional mulai bulan depan.',
    priority: 'HIGH',
    neededInDays: 14,
    items: [
      { code: 'LPT-STD', qty: 2, price: 14_500_000 },
      { code: 'KBM-WL', qty: 2, price: 350_000 },
    ],
    path: [],
  },
  {
    requester: 'requester',
    title: 'Monitor tambahan tim CS',
    justification: 'Tim customer service butuh dual monitor untuk menangani tiket.',
    priority: 'MEDIUM',
    neededInDays: 21,
    items: [{ code: 'MON-24', qty: 4, price: 2_100_000 }],
    path: [{ status: 'SUBMITTED', by: 'requester' }],
  },
  {
    requester: 'manajer.it',
    title: 'Peremajaan switch lantai 3',
    justification: 'Switch lama sering mati dan sudah melewati masa garansi.',
    priority: 'URGENT',
    neededInDays: 7,
    items: [
      { code: 'SW-24P', qty: 2, price: 18_000_000 },
      { code: 'CBL-CAT6', qty: 1, price: 2_750_000 },
      { freeText: { name: 'Patch panel 24 port', unit: 'unit' }, qty: 2, price: 850_000 },
    ],
    path: [
      { status: 'SUBMITTED', by: 'manajer.it' },
      { status: 'STOCK_CHECK', by: 'gudang' },
    ],
  },
  {
    requester: 'pengadaan',
    title: 'Toner printer lantai 2',
    justification: 'Stok toner printer lantai 2 habis.',
    priority: 'LOW',
    neededInDays: 5,
    items: [{ code: 'TNR-LSR', qty: 3, price: 650_000 }],
    path: [
      { status: 'SUBMITTED', by: 'pengadaan' },
      { status: 'STOCK_CHECK', by: 'gudang' },
      { status: 'FULFILLED_FROM_STOCK', by: 'gudang', note: 'Tersedia 10 pcs di Gudang IT Utama' },
    ],
  },
  {
    requester: 'manajer.it',
    title: 'Server rack untuk aplikasi ERP',
    justification: 'Kapasitas server ERP saat ini sudah 90%, perlu server tambahan.',
    priority: 'HIGH',
    neededInDays: 30,
    items: [
      { code: 'SRV-RACK', qty: 1, price: 95_000_000 },
      { code: 'UPS-3K', qty: 1, price: 12_500_000 },
    ],
    path: [
      { status: 'SUBMITTED', by: 'manajer.it' },
      { status: 'STOCK_CHECK', by: 'gudang' },
      { status: 'PENDING_APPROVAL', by: 'gudang', note: 'Tidak tersedia di gudang' },
    ],
  },
  {
    requester: 'requester',
    title: 'Lisensi Microsoft 365 untuk tim baru',
    justification: 'Lisensi untuk 5 staf baru.',
    priority: 'MEDIUM',
    neededInDays: 10,
    items: [{ code: 'LIC-M365', qty: 5, price: 2_300_000 }],
    path: [
      { status: 'SUBMITTED', by: 'requester' },
      {
        status: 'CANCELLED',
        by: 'requester',
        note: 'Lisensi dialokasikan dari kuota yang tidak terpakai',
      },
    ],
  },
  {
    requester: 'requester',
    title: 'Lisensi antivirus endpoint 25 user',
    justification: 'Perpanjangan lisensi antivirus yang berakhir bulan depan.',
    priority: 'HIGH',
    neededInDays: 20,
    items: [{ code: 'LIC-AV', qty: 25, price: 480_000 }],
    path: [
      { status: 'SUBMITTED', by: 'requester' },
      { status: 'STOCK_CHECK', by: 'gudang' },
      { status: 'PENDING_APPROVAL', by: 'gudang', note: 'Lisensi tidak disimpan di gudang' },
    ],
    decisions: [
      { by: 'manajer.it', approve: true, comment: 'Wajib untuk keamanan endpoint' },
      { by: 'keuangan', approve: true, comment: 'Sesuai anggaran IT' },
    ],
  },
  {
    requester: 'gudang',
    title: 'Kursi ergonomis ruang server',
    justification: 'Kursi untuk staf yang berjaga di ruang server.',
    priority: 'LOW',
    neededInDays: 30,
    items: [{ freeText: { name: 'Kursi ergonomis', unit: 'unit' }, qty: 4, price: 3_200_000 }],
    path: [
      { status: 'SUBMITTED', by: 'gudang' },
      { status: 'STOCK_CHECK', by: 'gudang' },
      { status: 'PENDING_APPROVAL', by: 'gudang', note: 'Bukan barang stok IT' },
    ],
    decisions: [
      { by: 'manajer.it', approve: false, comment: 'Bukan perangkat IT, ajukan melalui GA' },
    ],
  },
];

async function seedActor(key: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: `${key}@perusahaan.co.id` },
    select: { id: true, roles: { select: { role: { select: { code: true } } } } },
  });
  return { userId: user.id, roles: user.roles.map((r) => r.role.code), ip: null };
}

/** Applies approval decisions through the real workflow (also creates notifications). */
async function applyDecisions(
  prId: string,
  decisions: NonNullable<SeedPr['decisions']>,
): Promise<void> {
  for (const decision of decisions) {
    const step = await prisma.approvalStep.findFirstOrThrow({
      where: { memo: { prId }, status: 'PENDING' },
      select: { id: true },
    });
    const actor = await seedActor(decision.by);
    await prisma.$transaction((tx) =>
      decision.approve
        ? approveStep(tx, step.id, decision.comment, actor)
        : rejectStep(tx, step.id, decision.comment, actor),
    );
  }
}

/** Creates memos for PRs that reached PENDING_APPROVAL before memos existed (stage 4 data). */
async function backfillMemos(): Promise<number> {
  const orphans = await prisma.purchaseRequest.findMany({
    where: { status: 'PENDING_APPROVAL', memo: null },
    select: { id: true, stockCheckedById: true },
  });
  for (const pr of orphans) {
    const checker = pr.stockCheckedById
      ? await prisma.user.findUniqueOrThrow({
          where: { id: pr.stockCheckedById },
          select: { email: true },
        })
      : null;
    const actor = await seedActor(checker ? checker.email.split('@')[0]! : 'gudang');
    await prisma.$transaction((tx) => startApproval(tx, pr.id, actor));
  }
  return orphans.length;
}

/** Sample PRs in several statuses; only seeded on an empty table so real data is never touched. */
async function seedPurchaseRequests(isFresh: boolean): Promise<number> {
  if (!isFresh) return 0;

  const userByKey = async (key: string) =>
    prisma.user.findUniqueOrThrow({
      where: { email: `${key}@perusahaan.co.id` },
      select: { id: true, divisionId: true },
    });
  const today = dayjs().tz().startOf('day');

  for (const sample of samplePrs) {
    const requester = await userByKey(sample.requester);
    const items = await Promise.all(
      sample.items.map(async (line, index) => {
        const catalog = line.code
          ? await prisma.item.findUniqueOrThrow({
              where: { code: line.code },
              select: { id: true, unit: true },
            })
          : null;
        return {
          itemId: catalog?.id ?? null,
          freeTextName: line.freeText?.name ?? null,
          unit: catalog?.unit ?? line.freeText!.unit,
          qty: line.qty,
          estimatedUnitPrice: line.price,
          subtotal: line.price * line.qty,
          sortOrder: index,
        };
      }),
    );

    await prisma
      .$transaction(async (tx) => {
        const pr = await tx.purchaseRequest.create({
          data: {
            title: sample.title,
            justification: sample.justification,
            priority: sample.priority,
            neededDate: new Date(today.add(sample.neededInDays, 'day').format('YYYY-MM-DD')),
            estimatedTotal: items.reduce((sum, i) => sum + i.subtotal, 0),
            requesterId: requester.id,
            createdById: requester.id,
            divisionId: requester.divisionId!,
            items: { create: items },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: requester.id,
            action: 'CREATE',
            entity: 'PurchaseRequest',
            entityId: pr.id,
          },
        });

        let current: PrStatus = 'DRAFT';
        for (const step of sample.path) {
          const actor = await userByKey(step.by);
          const now = new Date();
          const data: Prisma.PurchaseRequestUncheckedUpdateInput = { status: step.status };
          if (step.status === 'SUBMITTED') {
            data.number = await nextDocumentNumber(tx, DOCUMENT_PREFIX.PURCHASE_REQUEST, now);
            data.submittedAt = now;
          }
          if (step.status === 'FULFILLED_FROM_STOCK' || step.status === 'PENDING_APPROVAL') {
            Object.assign(data, {
              stockCheckedById: actor.id,
              stockCheckedAt: now,
              stockCheckNotes: step.note ?? null,
            });
          }
          if (step.status === 'CANCELLED')
            Object.assign(data, { cancelReason: step.note, cancelledAt: now });

          const updated = await tx.purchaseRequest.update({ where: { id: pr.id }, data });
          await tx.auditLog.create({
            data: {
              userId: actor.id,
              action: 'STATUS_CHANGE',
              entity: 'PurchaseRequest',
              entityId: pr.id,
              before: { status: current },
              after: { status: step.status, number: updated.number, note: step.note ?? null },
            },
          });
          current = step.status;
        }
        if (current === 'PENDING_APPROVAL') {
          await startApproval(tx, pr.id, await seedActor(sample.path.at(-1)!.by));
        }
        return pr.id;
      })
      .then((prId) => (sample.decisions ? applyDecisions(prId, sample.decisions) : undefined));
  }
  return samplePrs.length;
}

interface SeedVendor {
  code: string;
  name: string;
  npwp: string | null;
  city: string;
  address: string;
  picName: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  status: 'ACTIVE' | 'UNDER_REVIEW' | 'BLACKLISTED' | 'INACTIVE';
  statusReason?: string;
  categories: string[];
  /** Legal documents; expiry in days from today (negative = already expired). */
  documents?: {
    type: 'SIUP' | 'NIB' | 'NPWP' | 'AKTA';
    number: string;
    expiresInDays: number | null;
  }[];
}

const vendors: SeedVendor[] = [
  {
    code: 'VND-001',
    name: 'PT Sinar Komputindo',
    npwp: '012345678901000',
    city: 'Jakarta Pusat',
    address: 'Jl. Gajah Mada No. 12',
    picName: 'Hendro Saputra',
    email: 'sales@sinarkomputindo.co.id',
    phone: '021-6331234',
    bankName: 'BCA',
    bankAccount: '1234567890',
    status: 'ACTIVE',
    categories: ['HARDWARE', 'PERIPHERAL', 'ACCESSORY'],
    documents: [
      { type: 'NIB', number: '9120001234567', expiresInDays: null },
      { type: 'SIUP', number: '503/1234/SIUP/2023', expiresInDays: 400 },
      { type: 'NPWP', number: '01.234.567.8-901.000', expiresInDays: null },
    ],
  },
  {
    code: 'VND-002',
    name: 'PT Mitra Jaringan Nusantara',
    npwp: '023456789012000',
    city: 'Jakarta Selatan',
    address: 'Jl. TB Simatupang Kav. 8',
    picName: 'Ratna Dewi',
    email: 'ratna@mitrajaringan.co.id',
    phone: '021-7801122',
    bankName: 'Mandiri',
    bankAccount: '1230009876543',
    status: 'ACTIVE',
    categories: ['NETWORK', 'SERVICE'],
    documents: [
      { type: 'NIB', number: '9120007654321', expiresInDays: null },
      { type: 'SIUP', number: '503/5678/SIUP/2021', expiresInDays: 20 },
    ],
  },
  {
    code: 'VND-003',
    name: 'PT Data Server Indonesia',
    npwp: '034567890123000',
    city: 'Tangerang',
    address: 'Jl. MH Thamrin, Lippo Karawaci',
    picName: 'Yusuf Hakim',
    email: 'yusuf@dataserver.id',
    phone: '021-5469988',
    bankName: 'BNI',
    bankAccount: '0987654321',
    status: 'ACTIVE',
    categories: ['SERVER', 'NETWORK', 'SERVICE'],
    documents: [{ type: 'SIUP', number: '503/2222/SIUP/2019', expiresInDays: -15 }],
  },
  {
    code: 'VND-004',
    name: 'CV Lisensi Solusi Digital',
    npwp: '045678901234000',
    city: 'Bandung',
    address: 'Jl. Asia Afrika No. 88',
    picName: 'Melati Putri',
    email: 'melati@lisensidigital.com',
    phone: '022-4201010',
    bankName: 'BCA',
    bankAccount: '7771234567',
    status: 'ACTIVE',
    categories: ['LICENSE', 'SOFTWARE'],
  },
  {
    code: 'VND-005',
    name: 'PT Printindo Prima',
    npwp: '056789012345000',
    city: 'Jakarta Barat',
    address: 'Jl. Daan Mogot Km. 11',
    picName: 'Agus Salim',
    email: 'agus@printindo.co.id',
    phone: '021-5442211',
    bankName: 'BRI',
    bankAccount: '034501000123307',
    status: 'ACTIVE',
    categories: ['PRINTER', 'CONSUMABLE'],
  },
  {
    code: 'VND-006',
    name: 'PT Teknologi Andalan Sejahtera',
    npwp: '067890123456000',
    city: 'Surabaya',
    address: 'Jl. Basuki Rahmat No. 5',
    picName: 'Fajar Nugroho',
    email: 'fajar@tas.co.id',
    phone: '031-5312233',
    bankName: 'Mandiri',
    bankAccount: '1410012345678',
    status: 'ACTIVE',
    categories: ['HARDWARE', 'SERVER', 'PERIPHERAL'],
  },
  {
    code: 'VND-007',
    name: 'CV Kabel Mandiri',
    npwp: null,
    city: 'Bekasi',
    address: 'Jl. Ahmad Yani No. 21',
    picName: 'Doni Kurniawan',
    email: 'doni.kabel@gmail.com',
    phone: '0812-8888-1234',
    bankName: 'BCA',
    bankAccount: '5550001111',
    status: 'UNDER_REVIEW',
    categories: ['NETWORK', 'ACCESSORY'],
  },
  {
    code: 'VND-008',
    name: 'PT Global Gadget Murah',
    npwp: '078901234567000',
    city: 'Jakarta Utara',
    address: 'Jl. Pluit Raya No. 3',
    picName: 'Stefanus',
    email: 'sales@globalgadget.co.id',
    phone: '021-6698877',
    bankName: 'CIMB Niaga',
    bankAccount: '800123456700',
    status: 'BLACKLISTED',
    statusReason: 'Mengirim barang rekondisi sebagai barang baru (PO 2025)',
    categories: ['HARDWARE', 'PERIPHERAL'],
  },
];

/** One-page placeholder PDF standing in for a scanned legal document. */
async function samplePdf(title: string, lines: string[]): Promise<Buffer> {
  const doc = createPdf(title);
  doc.font('Helvetica-Bold').fontSize(18).text(title, { align: 'center' });
  doc.moveDown().font('Helvetica').fontSize(11);
  for (const line of lines) doc.text(line);
  doc
    .moveDown()
    .fontSize(9)
    .fillColor('#868e96')
    .text('Dokumen contoh hasil seed SIPITA — bukan dokumen resmi.');
  return pdfToBuffer(doc);
}

/** Sample vendors; documents are only added to vendors that have none, so reruns are safe. */
async function seedVendors(): Promise<number> {
  const creator = await prisma.user.findUniqueOrThrow({
    where: { email: 'pengadaan@perusahaan.co.id' },
  });
  const today = dayjs().tz().startOf('day');

  for (const { categories: codes, documents = [], ...v } of vendors) {
    const categoryRows = await prisma.itemCategory.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    const categories = { deleteMany: {}, create: categoryRows.map((c) => ({ categoryId: c.id })) };
    const data = { ...v, statusReason: v.statusReason ?? null, deletedAt: null };
    const vendor = await prisma.vendor.upsert({
      where: { code: v.code },
      update: { ...data, categories },
      create: { ...data, createdById: creator.id, categories: { create: categories.create } },
    });

    if (
      documents.length === 0 ||
      (await prisma.vendorDocument.count({ where: { vendorId: vendor.id } })) > 0
    )
      continue;
    for (const d of documents) {
      const expiresAt =
        d.expiresInDays === null ? null : today.add(d.expiresInDays, 'day').format('YYYY-MM-DD');
      const fileName = `${d.type}-${v.code}.pdf`;
      const buffer = await samplePdf(`${d.type} — ${v.name}`, [
        `Nomor: ${d.number}`,
        `Berlaku sampai: ${expiresAt ?? 'tidak ada batas'}`,
      ]);
      const filePath = await saveFile(buffer, fileName);
      const documentId = crypto.randomUUID();
      await prisma.vendorDocument.create({
        data: {
          id: documentId,
          type: d.type,
          number: d.number,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          vendor: { connect: { id: vendor.id } },
          uploadedBy: { connect: { id: creator.id } },
          attachment: {
            create: {
              fileName,
              path: filePath,
              mimeType: 'application/pdf',
              size: buffer.length,
              refType: 'VendorDocument',
              refId: documentId,
              uploadedById: creator.id,
            },
          },
        },
      });
    }
  }
  return vendors.length;
}

async function main(): Promise<void> {
  const roleIds = await seedRoles();
  const divisionIds = await seedDivisions();
  await seedUsers(roleIds, divisionIds);
  await seedCatalog();
  await seedWarehouses();
  await seedApprovalRules();
  const vendorCount = await seedVendors();
  // History first, so document numbers stay chronological on a fresh database.
  const isFresh = (await prisma.purchaseRequest.count()) === 0;
  const historyCount = isFresh ? await seedProcurementHistory() : 0;
  const prCount = await seedPurchaseRequests(isFresh);
  const backfilled = await backfillMemos();
  const live = await seedLiveQuotationRound();
  console.log(
    `Seed selesai: ${roleIds.size} role, ${divisionIds.size} divisi, ${users.length} user, ` +
      `${categories.length} kategori, ${items.length} item, 1 gudang, aturan approval, ${vendorCount} vendor, ` +
      `${historyCount} riwayat pengadaan, ${prCount} PR contoh, ${backfilled} memo susulan` +
      `${live ? ', 1 putaran penawaran + draft PO' : ''}.`,
  );
  console.log(`Password semua user contoh: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
