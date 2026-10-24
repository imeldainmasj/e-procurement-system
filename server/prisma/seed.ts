import {
  DEFAULT_MILESTONE_TEMPLATES,
  FEATURES,
  PROCUREMENT_METHODS,
  SETTING_DEFAULTS,
  SETTING_DESCRIPTIONS,
  SETTING_KEYS,
  type Feature,
  type JobLevel,
  type PermissionFlags,
} from '@sipita/shared';
import type { Prisma } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { seedWorks } from './seed-works.js';

/**
 * Idempotent seed (CLAUDE.md §14): every record is upserted on its business key, so the
 * seed can be re-run on a populated database. Sample works are only added to an empty
 * works table (see seed-works.ts).
 */

const DEFAULT_PASSWORD = 'Password123!';

// ─── Organisation ────────────────────────────────────────────────────────────

const directorates = [
  { code: 'DIR-OPS', name: 'Direktorat Operasional & Teknologi' },
  { code: 'DIR-FIN', name: 'Direktorat Keuangan' },
  { code: 'DIR-BIS', name: 'Direktorat Bisnis' },
];

const divisions = [
  { code: 'DIV-IT', name: 'Divisi Teknologi Informasi', directorate: 'DIR-OPS' },
  { code: 'DIV-OPS', name: 'Divisi Operasional', directorate: 'DIR-OPS' },
  { code: 'DIV-FIN', name: 'Divisi Keuangan & Akuntansi', directorate: 'DIR-FIN' },
  { code: 'DIV-PROC', name: 'Divisi Procurement', directorate: 'DIR-FIN' },
  { code: 'DIV-MKT', name: 'Divisi Marketing', directorate: 'DIR-BIS' },
];

const departments = [
  { code: 'IT-SAPM', name: 'IT SAPM', division: 'DIV-IT' },
  { code: 'IT-INFRA', name: 'IT Infrastruktur', division: 'DIV-IT' },
  { code: 'IT-APP', name: 'IT Application Development', division: 'DIV-IT' },
  { code: 'OPS-SVC', name: 'Layanan Operasional', division: 'DIV-OPS' },
  { code: 'FIN-ACC', name: 'Akuntansi', division: 'DIV-FIN' },
  { code: 'PROC-SRC', name: 'Sourcing & Procurement', division: 'DIV-PROC' },
  { code: 'MKT-DIG', name: 'Digital Marketing', division: 'DIV-MKT' },
];

// ─── Users (all IT SAPM) ─────────────────────────────────────────────────────

interface SeedUser {
  employeeId: string;
  username: string;
  name: string;
  email: string;
  jobLevel: JobLevel;
  isAdmin?: boolean;
  /** Narrowed features; everything else gets full access. */
  restrict?: Partial<Record<Feature, Partial<PermissionFlags>>>;
}

const users: SeedUser[] = [
  {
    employeeId: '198801010001',
    username: 'admin',
    name: 'Admin SIPITA',
    email: 'admin@perusahaan.co.id',
    jobLevel: 'STAFF',
    isAdmin: true,
  },
  {
    employeeId: '197905120002',
    username: 'hendra.wijaya',
    name: 'Hendra Wijaya',
    email: 'hendra.wijaya@perusahaan.co.id',
    jobLevel: 'MANAGER_L2',
  },
  {
    employeeId: '198403220003',
    username: 'sari.kusuma',
    name: 'Sari Kusuma',
    email: 'sari.kusuma@perusahaan.co.id',
    jobLevel: 'MANAGER_L1',
  },
  {
    employeeId: '199002150004',
    username: 'andi.pratama',
    name: 'Andi Pratama',
    email: 'andi.pratama@perusahaan.co.id',
    jobLevel: 'STAFF',
  },
  {
    employeeId: '199107080005',
    username: 'dewi.lestari',
    name: 'Dewi Lestari',
    email: 'dewi.lestari@perusahaan.co.id',
    jobLevel: 'STAFF',
  },
  {
    employeeId: '199306300006',
    username: 'budi.santoso',
    name: 'Budi Santoso',
    email: 'budi.santoso@perusahaan.co.id',
    jobLevel: 'STAFF',
  },
  {
    employeeId: '199511190007',
    username: 'rina.wulandari',
    name: 'Rina Wulandari',
    email: 'rina.wulandari@perusahaan.co.id',
    jobLevel: 'STAFF',
    // Newest staff member: no import yet and cannot delete data.
    restrict: {
      IMPORT: { view: false, create: false, update: false, delete: false },
      WORK: { delete: false },
      VENDOR: { delete: false },
      AGREEMENT: { delete: false },
    },
  },
];

// ─── Vendors (software & licences) ───────────────────────────────────────────

const vendors = [
  {
    code: 'V001',
    name: 'PT Solusi Lisensi Nusantara',
    address: 'Jl. Gatot Subroto Kav. 12, Jakarta Selatan',
    picName: 'Rina Kartika',
    npwp: '0012345678901001',
    email: 'rina@solusilisensi.co.id',
    phone: '021-5551001',
  },
  {
    code: 'V002',
    name: 'PT Mitra Cloud Indonesia',
    address: 'Jl. TB Simatupang No. 8, Jakarta Selatan',
    picName: 'Yoga Prasetyo',
    npwp: '0023456789012002',
    email: 'yoga@mitracloud.co.id',
    phone: '021-5551002',
  },
  {
    code: 'V003',
    name: 'PT Integrasi Data Prima',
    address: 'Jl. HR Rasuna Said Kav. C-5, Jakarta Selatan',
    picName: 'Maya Anggraini',
    npwp: '0034567890123003',
    email: 'maya@integrasidata.co.id',
    phone: '021-5551003',
  },
  {
    code: 'V004',
    name: 'PT Keamanan Siber Andalan',
    address: 'Jl. Pemuda No. 61, Surabaya',
    picName: 'Fajar Nugroho',
    npwp: '0045678901234004',
    email: 'fajar@siberandalan.co.id',
    phone: '031-5551004',
  },
  {
    code: 'V005',
    name: 'PT Aplikasi Bisnis Terpadu',
    address: 'Jl. Asia Afrika No. 120, Bandung',
    picName: 'Lukas Hartanto',
    npwp: '0056789012345005',
    email: 'lukas@abt.co.id',
    phone: '022-5551005',
  },
  {
    code: 'V006',
    name: 'PT Sinergi Infrastruktur Digital',
    address: 'Jl. MH Thamrin No. 28, Jakarta Pusat',
    picName: 'Nadia Putri',
    npwp: '0067890123456006',
    email: 'nadia@sinergidigital.co.id',
    phone: '021-5551006',
  },
  {
    code: 'V007',
    name: 'PT Data Analitika Global',
    address: 'Jl. Prof. Dr. Satrio Kav. 3, Jakarta Selatan',
    picName: 'Teguh Saputra',
    npwp: '0078901234567007',
    email: 'teguh@dataanalitika.co.id',
    phone: '021-5551007',
  },
  {
    code: 'V008',
    name: 'PT Backup Solusi Mandiri',
    address: 'Jl. Pandanaran No. 45, Semarang',
    picName: 'Indah Permatasari',
    npwp: '0089012345678008',
    email: 'indah@backupsolusi.co.id',
    phone: '024-5551008',
  },
  {
    code: 'V009',
    name: 'Global Software Licensing Pte. Ltd.',
    address: '1 Raffles Place #20-01, Singapore',
    picName: 'Daniel Tan',
    npwp: null,
    email: 'daniel.tan@gslicensing.sg',
    phone: '+65 6555 1009',
  },
  {
    code: 'V010',
    name: 'PT Otomasi Proses Cerdas',
    address: 'Jl. Diponegoro No. 77, Yogyakarta',
    picName: 'Galih Ramadhan',
    npwp: '0101234567890010',
    email: 'galih@otomasicerdas.co.id',
    phone: '0274-555101',
  },
];

// ─── Seeders ─────────────────────────────────────────────────────────────────

async function seedOrganisation(): Promise<Map<string, string>> {
  const directorateIds = new Map<string, string>();
  for (const d of directorates) {
    const row = await prisma.directorate.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: d,
    });
    directorateIds.set(d.code, row.id);
  }

  const divisionIds = new Map<string, string>();
  for (const d of divisions) {
    const data = { name: d.name, directorateId: directorateIds.get(d.directorate)! };
    const row = await prisma.division.upsert({
      where: { code: d.code },
      update: data,
      create: { code: d.code, ...data },
    });
    divisionIds.set(d.code, row.id);
  }

  const departmentIds = new Map<string, string>();
  for (const d of departments) {
    const data = { name: d.name, divisionId: divisionIds.get(d.division)! };
    const row = await prisma.department.upsert({
      where: { code: d.code },
      update: data,
      create: { code: d.code, ...data },
    });
    departmentIds.set(d.code, row.id);
  }
  return departmentIds;
}

function permissionRows(user: SeedUser): Omit<Prisma.UserPermissionCreateManyInput, 'userId'>[] {
  return FEATURES.map((feature) => {
    const r = user.restrict?.[feature] ?? {};
    // Settings are admin-only regardless of flags; keep them off for everyone else.
    const base = feature === 'SETTINGS' ? Boolean(user.isAdmin) : true;
    return {
      feature,
      canView: r.view ?? base,
      canCreate: r.create ?? base,
      canUpdate: r.update ?? base,
      canDelete: r.delete ?? base,
    };
  });
}

async function seedUsers(sapmDepartmentId: string): Promise<void> {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  for (const u of users) {
    const data = {
      employeeId: u.employeeId,
      name: u.name,
      email: u.email,
      jobLevel: u.jobLevel,
      isAdmin: u.isAdmin ?? false,
      departmentId: sapmDepartmentId,
    };
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: data,
      create: { ...data, username: u.username, passwordHash },
    });
    for (const p of permissionRows(u)) {
      await prisma.userPermission.upsert({
        where: { userId_feature: { userId: user.id, feature: p.feature } },
        update: p,
        create: { ...p, userId: user.id },
      });
    }
  }
}

/** Only missing keys are added, so values an admin already changed are kept. */
async function seedSettings(): Promise<void> {
  for (const key of SETTING_KEYS) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { description: SETTING_DESCRIPTIONS[key] },
      create: { key, value: SETTING_DEFAULTS[key], description: SETTING_DESCRIPTIONS[key] },
    });
  }
}

/** Only missing template rows are added, so admin edits survive a re-seed. */
async function seedMilestoneTemplates(): Promise<number> {
  let created = 0;
  for (const method of PROCUREMENT_METHODS) {
    for (const t of DEFAULT_MILESTONE_TEMPLATES[method]) {
      const exists = await prisma.milestoneTemplate.findUnique({
        where: { method_type: { method, type: t.type } },
      });
      if (exists) continue;
      await prisma.milestoneTemplate.create({ data: { method, ...t } });
      created++;
    }
  }
  return created;
}

async function seedVendors(): Promise<void> {
  for (const v of vendors) {
    const { code, ...data } = v;
    await prisma.vendor.upsert({ where: { code }, update: data, create: v });
  }
}

async function main(): Promise<void> {
  const departmentIds = await seedOrganisation();
  await seedUsers(departmentIds.get('IT-SAPM')!);
  await seedSettings();
  const templates = await seedMilestoneTemplates();
  await seedVendors();
  const works = await seedWorks();

  console.log(
    `✅ Seed selesai: ${directorates.length} direktorat, ${divisions.length} divisi, ` +
      `${departments.length} departemen, ${users.length} user, ${SETTING_KEYS.length} pengaturan, ` +
      `${templates} template milestone baru, ${vendors.length} vendor, ` +
      (works > 0 ? `${works} pekerjaan contoh.` : 'pekerjaan contoh dilewati (data sudah ada).'),
  );
  console.log(`   Login: username (mis. admin, hendra.wijaya, andi.pratama) / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
