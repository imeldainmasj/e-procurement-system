# CLAUDE.md — SIPITA (Sistem Informasi Pengadaan IT & Aset)

File ini adalah panduan utama untuk Claude Code saat mengerjakan proyek ini.
Baca seluruh file ini sebelum menulis kode. Ikuti konvensi di sini secara konsisten.

---

## 1. Ringkasan Proyek

SIPITA adalah aplikasi web internal untuk mengelola **pengadaan IT** dan **gudang/aset IT**:

1. **Pengajuan (Purchase Request / PR)** oleh requester dari divisi mana pun
2. **Memo Internal & Approval berjenjang** berdasarkan nilai pengajuan
3. **Manajemen Vendor** (master data, dokumen legal, rating kinerja)
4. **Harga & Penawaran** (perbandingan min. 3 vendor, riwayat harga, Purchase Order)
5. **Kontrak** (pembelian, sewa, maintenance, lisensi) + reminder jatuh tempo
6. **Gudang / Aset IT** (stok, barang masuk/keluar, serial number, pemegang aset, garansi)
7. **Dashboard** (KPI pengadaan, belanja, stok, kontrak, kinerja vendor, anggaran)

Bahasa UI: **Bahasa Indonesia**. Kode, nama variabel, nama tabel, dan komentar teknis: **Bahasa Inggris**.
Mata uang: **IDR** (format `Rp 1.250.000`). Zona waktu: **Asia/Jakarta**.

---

## 2. Tech Stack

### Frontend (`/client`)
- **React 18 + Vite** (TypeScript)
- **TailwindCSS v4** via `@tailwindcss/vite`
- **DaisyUI v5** (`@plugin "daisyui";` di file CSS utama). Tema: `corporate` (light) & `business` (dark)
- **React Router v6** (data router: `createBrowserRouter`)
- **TanStack Query v5** untuk data fetching & cache
- **React Hook Form + Zod** untuk form & validasi
- **Axios** (instance terpusat dengan interceptor JWT + refresh token)
- **Recharts** untuk grafik dashboard
- **TanStack Table v8** untuk tabel data (sorting, filter, pagination server-side)
- **lucide-react** untuk ikon
- **dayjs** (locale `id`) untuk tanggal
- **Zustand** hanya untuk state global ringan (auth user, tema)

### Backend (`/server`)
- **Node.js 20+ + Express 5** (TypeScript, dijalankan dengan `tsx` saat dev)
- **PostgreSQL 16**
- **Prisma ORM** (schema, migration, seed)
- **Zod** untuk validasi request (shared schema bila memungkinkan)
- **JWT** (access token 15 menit + refresh token 7 hari di httpOnly cookie)
- **bcrypt** untuk hash password
- **multer** untuk upload file (lampiran memo, kontrak, dokumen vendor)
- **node-cron** untuk job terjadwal (reminder kontrak, stok minimum)
- **nodemailer** untuk notifikasi email
- **pino** untuk logging
- **helmet, cors, express-rate-limit** untuk keamanan
- **pdfkit** atau **puppeteer** untuk generate PDF (Memo, PO)

### Tooling
- Monorepo sederhana dengan **npm workspaces** (`client`, `server`, `shared`)
- **ESLint + Prettier**
- **Vitest** (unit test client & server), **Supertest** (API test)
- **Docker Compose** untuk PostgreSQL lokal

---

## 3. Struktur Folder

```
sipita/
├── CLAUDE.md
├── docker-compose.yml          # postgres + pgadmin
├── package.json                # npm workspaces
├── shared/                     # tipe & zod schema yang dipakai client + server
│   └── src/
│       ├── schemas/            # pr.schema.ts, vendor.schema.ts, ...
│       ├── enums.ts            # status, role, kategori
│       └── index.ts
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── uploads/                # file upload (gitignored)
│   └── src/
│       ├── app.ts              # setup express, middleware
│       ├── server.ts           # entry point
│       ├── config/             # env.ts (validasi env dengan zod)
│       ├── lib/                # prisma.ts, logger.ts, mailer.ts, pdf.ts
│       ├── middleware/         # auth.ts, rbac.ts, validate.ts, errorHandler.ts, upload.ts
│       ├── modules/            # satu folder per fitur
│       │   ├── auth/
│       │   ├── users/
│       │   ├── divisions/
│       │   ├── purchase-requests/
│       │   ├── memos/
│       │   ├── approvals/
│       │   ├── vendors/
│       │   ├── items/
│       │   ├── quotations/
│       │   ├── purchase-orders/
│       │   ├── goods-receipts/
│       │   ├── assets/
│       │   ├── stock/
│       │   ├── contracts/
│       │   ├── budgets/
│       │   ├── notifications/
│       │   ├── attachments/
│       │   ├── dashboard/
│       │   └── audit-logs/
│       ├── jobs/               # contractReminder.job.ts, lowStock.job.ts
│       └── utils/              # numbering.ts, pagination.ts, currency.ts
└── client/
    └── src/
        ├── main.tsx
        ├── index.css           # @import "tailwindcss"; @plugin "daisyui";
        ├── router.tsx
        ├── api/                # axios instance + fungsi API per modul
        ├── hooks/              # useAuth, usePermission, query hooks per modul
        ├── stores/             # authStore.ts, themeStore.ts
        ├── components/
        │   ├── layout/         # AppLayout, Sidebar, Navbar, Breadcrumb
        │   ├── ui/             # DataTable, StatusBadge, ConfirmModal, FileUpload,
        │   │                   # CurrencyInput, EmptyState, PageHeader, StatCard
        │   └── charts/
        ├── features/           # satu folder per modul (pages + komponen spesifik)
        │   ├── auth/
        │   ├── dashboard/
        │   ├── purchase-requests/
        │   ├── memos/
        │   ├── approvals/
        │   ├── vendors/
        │   ├── quotations/
        │   ├── purchase-orders/
        │   ├── warehouse/
        │   ├── assets/
        │   ├── contracts/
        │   ├── budgets/
        │   └── settings/       # users, divisions, approval rules, items/katalog
        └── utils/              # formatCurrency, formatDate, cn
```

Setiap modul backend berisi: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (atau impor dari `shared`).
**Aturan:** controller tipis (parse request → panggil service → kirim response). Logika bisnis HANYA di service.

---

## 4. Role & Hak Akses (RBAC)

| Role | Kode | Hak Akses |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Semua, termasuk master data & pengaturan approval |
| Requester | `REQUESTER` | Buat/edit PR milik sendiri (selama Draft), lihat status PR sendiri, terima aset |
| Admin Gudang IT | `WAREHOUSE` | Kelola stok, penerimaan barang (GR), serah terima aset, cek stok untuk PR |
| Staf Pengadaan | `PROCUREMENT` | Kelola vendor, penawaran, PO, kontrak, harga |
| Approver | `APPROVER` | Approve/reject memo sesuai level (Manajer IT, Keuangan, Direksi) |
| Manajemen | `VIEWER` | Dashboard & laporan, read-only |

- User bisa punya **lebih dari satu role** (relasi many-to-many).
- Approver punya atribut `approvalLevel` (1 = Manajer IT, 2 = Keuangan, 3 = Direksi).
- Middleware `requireRole(...roles)` di backend; hook `usePermission()` + komponen `<Can role="...">` di frontend.
- Requester hanya boleh melihat data miliknya sendiri (filter di service, bukan di client).

---

## 5. Alur Bisnis Utama

```
[Requester] Buat PR (Draft)
      │ submit
      ▼
[Gudang] Cek stok ──► Stok tersedia? ──Ya──► Serah terima aset ──► PR: FULFILLED_FROM_STOCK
      │ Tidak
      ▼
Sistem generate Memo Internal otomatis (nomor + isi dari PR)
      │
      ▼
Approval berjenjang sesuai ApprovalRule (berdasarkan estimasi total nilai):
   < Rp10.000.000             → Level 1 (Manajer IT)
   Rp10.000.000 – 50.000.000  → Level 1 → Level 2 (Keuangan)
   > Rp50.000.000             → Level 1 → Level 2 → Level 3 (Direksi)
   (ambang batas disimpan di tabel approval_rules, BUKAN hardcode)
      │ semua approve                      │ ada yang reject
      ▼                                    ▼
PR: APPROVED                          PR: REJECTED (wajib alasan)
      │
      ▼
[Pengadaan] Input penawaran (min. 3 vendor, kecuali vendor tunggal + justifikasi)
      │ pilih pemenang
      ▼
Generate Purchase Order (PO) ──► PR: PO_ISSUED
      │ (opsional) buat Kontrak terkait PO
      ▼
[Gudang] Goods Receipt (penerimaan barang, bisa parsial)
      │ barang aset → buat record Asset (serial number, garansi)
      │ barang consumable → tambah stok
      ▼
PR: RECEIVED ──► Serah terima ke requester ──► PR: COMPLETED
```

### Status Enum
- **PR:** `DRAFT, SUBMITTED, STOCK_CHECK, FULFILLED_FROM_STOCK, PENDING_APPROVAL, APPROVED, REJECTED, QUOTATION, PO_ISSUED, PARTIALLY_RECEIVED, RECEIVED, COMPLETED, CANCELLED`
- **Memo:** `DRAFT, PENDING, APPROVED, REJECTED`
- **Approval step:** `WAITING, PENDING, APPROVED, REJECTED, SKIPPED`
- **PO:** `DRAFT, ISSUED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED`
- **Kontrak:** `DRAFT, ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED, RENEWED`
- **Aset:** `AVAILABLE, IN_USE, IN_REPAIR, BROKEN, DISPOSED, LOST`
- **Vendor:** `ACTIVE, UNDER_REVIEW, BLACKLISTED, INACTIVE`

Transisi status harus divalidasi di service (buat helper `assertTransition(current, next)`). Jangan izinkan lompat status sembarangan.

### Penomoran Otomatis
Format: `{PREFIX}/{YYYY}/{MM}/{NNNN}` — reset counter per tahun. Gunakan tabel `document_sequences` dengan transaksi + `SELECT ... FOR UPDATE` agar aman dari race condition.

| Dokumen | Prefix | Contoh |
|---|---|---|
| Purchase Request | `PR-IT` | `PR-IT/2026/10/0001` |
| Memo Internal | `MEMO-IT` | `MEMO-IT/2026/10/0001` |
| Purchase Order | `PO-IT` | `PO-IT/2026/10/0001` |
| Goods Receipt | `GR-IT` | `GR-IT/2026/10/0001` |
| Kontrak | `KTR-IT` | `KTR-IT/2026/10/0001` |
| Aset | `AST-IT` | `AST-IT-000123` (tanpa reset) |

---

## 6. Skema Database (Prisma — garis besar)

Semua tabel memakai: `id` (UUID), `createdAt`, `updatedAt`. Tabel transaksi utama juga punya `createdById`.
Nama model PascalCase, nama tabel snake_case via `@@map`. Uang disimpan sebagai `Decimal(18,2)`.
Gunakan **soft delete** (`deletedAt`) untuk master data (vendor, item, user).

**Master & Auth**
- `User` (name, email unik, passwordHash, nip, phone, divisionId, approvalLevel?, isActive)
- `Role`, `UserRole` (many-to-many)
- `Division` (code, name, headUserId?)
- `RefreshToken` (userId, tokenHash, expiresAt, revokedAt)

**Katalog**
- `ItemCategory` (HARDWARE, SOFTWARE, LICENSE, NETWORK, SERVICE, CONSUMABLE, dll.)
- `Item` (code, name, categoryId, unit, isAsset: boolean, minStock, specs JSON)

**Pengajuan & Approval**
- `PurchaseRequest` (number, requesterId, divisionId, title, justification, priority [LOW/MEDIUM/HIGH/URGENT], neededDate, estimatedTotal, status)
- `PurchaseRequestItem` (prId, itemId? atau freeTextName, qty, estimatedUnitPrice, notes)
- `InternalMemo` (number, prId, subject, body, status, pdfPath)
- `ApprovalRule` (minAmount, maxAmount?, levels Int[], isActive)
- `ApprovalStep` (memoId, level, approverId?, status, comment, actedAt, sequence)

**Vendor & Harga**
- `Vendor` (code, name, npwp, address, picName, email, phone, bankName, bankAccount, category, status)
- `VendorDocument` (vendorId, type [SIUP/NIB/NPWP/AKTA/LAINNYA], fileId, expiresAt?)
- `VendorRating` (vendorId, poId, onTime 1–5, quality 1–5, price 1–5, service 1–5, notes)
- `Quotation` (prId, vendorId, quoteNumber, quoteDate, validUntil, totalAmount, isSelected, notes, fileId?)
- `QuotationItem` (quotationId, prItemId, unitPrice, qty, subtotal)
- `PriceHistory` (itemId, vendorId, unitPrice, sourceType [QUOTATION/PO], sourceId, recordedAt)

**PO, Penerimaan, Gudang**
- `PurchaseOrder` (number, prId, vendorId, quotationId, orderDate, expectedDate, subtotal, taxPercent, taxAmount, total, status, terms, pdfPath)
- `PurchaseOrderItem` (poId, itemId, qty, receivedQty, unitPrice, subtotal)
- `GoodsReceipt` (number, poId, receivedById, receivedAt, notes, deliveryNoteFileId?)
- `GoodsReceiptItem` (grId, poItemId, qty, condition [GOOD/DAMAGED])
- `Warehouse` (code, name, location)
- `StockBalance` (itemId, warehouseId, qty) — unik per (itemId, warehouseId)
- `StockMovement` (itemId, warehouseId, type [IN/OUT/ADJUSTMENT/TRANSFER], qty, refType, refId, notes, createdById)
- `Asset` (assetTag, itemId, serialNumber, poId?, grId?, purchaseDate, purchasePrice, warrantyUntil, status, currentHolderId?, warehouseId?, location, notes)
- `AssetAssignment` (assetId, userId, assignedAt, returnedAt?, handoverFileId?, notes)

**Kontrak & Anggaran**
- `Contract` (number, title, vendorId, poId?, type [PURCHASE/RENTAL/MAINTENANCE/LICENSE/SERVICE], startDate, endDate, value, sla, autoRenew, status, reminderDays Int[] default [90,60,30], fileId?)
- `Budget` (divisionId, year, category?, amount)
- Realisasi anggaran dihitung dari total PO berstatus ISSUED ke atas (jangan disimpan terpisah, hitung via query).

**Sistem**
- `Attachment` (fileName, mimeType, size, path, uploadedById, refType, refId)
- `Notification` (userId, title, message, link, isRead)
- `AuditLog` (userId, action, entity, entityId, before JSON, after JSON, ip)
- `DocumentSequence` (prefix, year, lastNumber)

Setiap perubahan status PR/Memo/PO/Kontrak/Aset **wajib** menulis `AuditLog`.

---

## 7. Konvensi API

- Base URL: `/api/v1`
- RESTful, nama resource jamak & kebab-case: `/purchase-requests`, `/goods-receipts`
- Aksi bisnis memakai sub-resource POST: `POST /purchase-requests/:id/submit`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject`, `POST /quotations/:id/select`, `POST /purchase-orders/:id/issue`, `POST /assets/:id/assign`, `POST /assets/:id/return`
- List endpoint mendukung query: `page`, `limit` (default 20, max 100), `search`, `sort` (`field:asc|desc`), dan filter spesifik (`status`, `divisionId`, `dateFrom`, `dateTo`)
- Format response sukses:
  ```json
  { "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 134 } }
  ```
- Format response error (ditangani `errorHandler` terpusat):
  ```json
  { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Pesan dalam Bahasa Indonesia", "details": [] } }
  ```
- Buat class `AppError(statusCode, code, message)`; jangan `throw` string mentah.
- Semua input divalidasi Zod via middleware `validate({ body, query, params })`.
- Operasi multi-tabel (approve terakhir → update PR, GR → update stok + aset) **wajib** memakai `prisma.$transaction`.

### Endpoint Dashboard
- `GET /dashboard/summary` → kartu KPI (PR per status, total belanja bulan ini, kontrak ≤90 hari, item stok minimum, approval menunggu saya)
- `GET /dashboard/spending?groupBy=month|vendor|category|division&year=2026`
- `GET /dashboard/lead-time` → rata-rata hari dari SUBMITTED → RECEIVED
- `GET /dashboard/vendor-performance`
- `GET /dashboard/budget-absorption?year=2026`
- Dashboard menyesuaikan role: Requester hanya melihat ringkasan PR miliknya.

---

## 8. Konvensi Frontend

- Layout: **sidebar** (DaisyUI `drawer` + `menu`) + **navbar** (notifikasi bell, toggle tema, profil). Responsif — sidebar jadi drawer di mobile.
- Gunakan komponen DaisyUI sebagai dasar: `btn`, `card`, `table`, `badge`, `modal`, `input`, `select`, `textarea`, `steps`, `stats`, `tabs`, `alert`, `toast`, `loading`, `drawer`, `menu`, `dropdown`, `timeline`.
- Warna badge status konsisten via satu komponen `StatusBadge` + map:
  - Draft → `badge-ghost`, Pending/Submitted → `badge-warning`, Approved/Active/Available → `badge-success`, Rejected/Expired/Broken → `badge-error`, PO Issued/In Use → `badge-info`, Completed → `badge-primary`
- Halaman detail PR menampilkan **timeline** (DaisyUI `timeline` / `steps`) dari alur status & riwayat approval.
- Form uang memakai `CurrencyInput` (tampilan `Rp 1.250.000`, value number).
- Semua tabel list: pencarian, filter, sorting, pagination **server-side**, dan tombol export CSV.
- Loading state: skeleton DaisyUI; error state: `alert alert-error`; data kosong: `EmptyState`.
- Konfirmasi aksi penting (submit, approve, reject, cancel, issue PO) memakai `ConfirmModal`. Reject wajib isi alasan.
- Query key TanStack Query: `['purchase-requests', params]`, `['purchase-requests', id]` — invalidate setelah mutasi.
- Semua teks UI dalam Bahasa Indonesia.

### Halaman
| Path | Halaman | Role |
|---|---|---|
| `/login` | Login | publik |
| `/` | Dashboard | semua |
| `/pengajuan`, `/pengajuan/baru`, `/pengajuan/:id` | Purchase Request | semua (data dibatasi) |
| `/persetujuan` | Inbox approval saya | APPROVER |
| `/memo`, `/memo/:id` | Memo internal + preview/download PDF | PROCUREMENT, APPROVER |
| `/vendor`, `/vendor/:id` | Vendor + dokumen + rating | PROCUREMENT |
| `/penawaran/:prId` | Perbandingan penawaran (side-by-side) | PROCUREMENT |
| `/purchase-order`, `/purchase-order/:id` | PO + PDF | PROCUREMENT |
| `/kontrak`, `/kontrak/:id` | Kontrak + countdown jatuh tempo | PROCUREMENT |
| `/gudang/stok`, `/gudang/penerimaan`, `/gudang/mutasi` | Gudang | WAREHOUSE |
| `/aset`, `/aset/:id` | Aset IT + riwayat pemegang | WAREHOUSE |
| `/harga` | Riwayat & tren harga item | PROCUREMENT, VIEWER |
| `/anggaran` | Anggaran vs realisasi | PROCUREMENT, VIEWER |
| `/pengaturan/*` | User, divisi, katalog item, aturan approval, gudang | SUPER_ADMIN |

---

## 9. Job Terjadwal (node-cron, zona Asia/Jakarta)

- **07:00 setiap hari** — cek kontrak yang `endDate` tepat 90/60/30/7 hari lagi → notifikasi + email ke PROCUREMENT; update status `EXPIRING_SOON` / `EXPIRED`.
- **07:15 setiap hari** — cek `StockBalance.qty <= Item.minStock` → notifikasi WAREHOUSE.
- **07:30 setiap hari** — cek garansi aset yang habis ≤30 hari → notifikasi WAREHOUSE.
- **Setiap jam** — approval yang PENDING > 3 hari → reminder ke approver.

Job harus idempoten (jangan kirim notifikasi ganda di hari yang sama).

---

## 10. Keamanan

- Password di-hash bcrypt (cost 12). Jangan pernah mengembalikan `passwordHash` di response (gunakan Prisma `select`/`omit`).
- Access token di header `Authorization: Bearer`, refresh token di httpOnly + secure + sameSite cookie.
- Rate limit pada `/auth/login`.
- Validasi upload: whitelist mime (pdf, jpg, png, xlsx, docx), maks 10 MB, nama file di-generate ulang (UUID). File hanya bisa diunduh lewat endpoint ber-auth, bukan static public.
- Semua query lewat Prisma (tidak ada raw SQL dari input user tanpa parameter).
- Pemeriksaan kepemilikan data (requester hanya PR sendiri) dilakukan di service.

---

## 11. Environment Variables

`server/.env.example`
```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://sipita:sipita@localhost:5432/sipita?schema=public
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CLIENT_URL=http://localhost:5173
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="SIPITA <no-reply@perusahaan.co.id>"
TZ=Asia/Jakarta
```

`client/.env.example`
```
VITE_API_URL=http://localhost:4000/api/v1
VITE_APP_NAME=SIPITA
```

Validasi env saat startup di `server/src/config/env.ts` dengan Zod — gagal cepat jika ada yang kurang.

---

## 12. Perintah

```bash
# Database
docker compose up -d                      # jalankan postgres + pgadmin

# Root
npm install                               # install semua workspace
npm run dev                               # jalankan client + server bersamaan (concurrently)
npm run lint
npm run test

# Server
npm run dev -w server                     # node --watch + tsx loader
npm run db:migrate -w server              # prisma migrate dev
npm run db:seed -w server                 # prisma db seed
npm run db:studio -w server               # prisma studio
npm run build -w server

# Client
npm run dev -w client                     # vite (port 5173)
npm run build -w client
```

### Seed Data (wajib ada)
- 6 user contoh, satu per role (password: `Password123!`), termasuk 3 approver level 1–3
- 5 divisi (IT, Keuangan, HRD, Operasional, Marketing)
- 3 aturan approval sesuai ambang di bagian 5
- 10 kategori + ±30 item katalog IT (laptop, monitor, switch, lisensi Microsoft 365, dll.)
- 8 vendor IT contoh, 1 gudang utama
- Beberapa PR di berbagai status, 3 kontrak (salah satu akan berakhir <30 hari), aset & stok contoh
- Anggaran tahun berjalan per divisi

---

## 13. Tahapan Pengerjaan (kerjakan berurutan)

1. **Setup** — monorepo, Docker Postgres, Vite + Tailwind v4 + DaisyUI v5, Express + Prisma, ESLint/Prettier, `shared` package
2. **Auth & RBAC** — login, refresh token, logout, middleware role, layout + sidebar dinamis per role
3. **Master data** — divisi, user, kategori, item, gudang, aturan approval (halaman Pengaturan)
4. **Purchase Request** — CRUD, submit, cek stok, penomoran otomatis
5. **Memo & Approval** — generate memo, approval berjenjang, inbox approver, notifikasi, PDF memo
6. **Vendor** — CRUD, dokumen, rating
7. **Penawaran & PO** — input penawaran, perbandingan, pilih pemenang, generate PO + PDF, riwayat harga
8. **Gudang & Aset** — goods receipt (parsial), stok, mutasi, aset, serah terima/pengembalian
9. **Kontrak** — CRUD, upload dokumen, reminder jatuh tempo
10. **Anggaran** — input anggaran, realisasi
11. **Dashboard** — KPI cards, grafik, widget per role
12. **Job terjadwal & email**
13. **Audit log viewer, export CSV, polish UI, test**

Selesaikan & uji satu tahap sebelum lanjut. Setelah tiap tahap, jalankan lint + test dan pastikan aplikasi bisa dijalankan.

---

## 14. Aturan untuk Claude Code

- Selalu gunakan **TypeScript strict**; hindari `any`.
- Jangan menambah library baru di luar stack di atas tanpa alasan jelas — sebutkan alasannya jika perlu.
- Setiap perubahan skema Prisma → buat migration dengan nama deskriptif (`prisma migrate dev --name add_contract_table`).
- Tulis test untuk logika bisnis penting: penentuan level approval, transisi status, penomoran dokumen, update stok saat GR, perhitungan realisasi anggaran.
- Ambang approval, reminder days, dan pengaturan lain disimpan di database/konfigurasi — **jangan hardcode**.
- Pesan error & validasi untuk user dalam Bahasa Indonesia.
- Jangan commit file `.env` atau folder `uploads/`.
- Jika ada ambiguitas pada aturan bisnis, tanyakan dulu sebelum mengimplementasikan.