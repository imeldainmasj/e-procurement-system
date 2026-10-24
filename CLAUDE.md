# CLAUDE.md — SIPITA (Sistem Informasi Pengadaan IT — IT SAPM)

File ini adalah panduan utama untuk Claude Code saat mengerjakan proyek ini.
Baca seluruh file ini sebelum menulis kode. Ikuti konvensi di sini secara konsisten.

---

## 1. Ringkasan Proyek

SIPITA adalah aplikasi web internal tim **IT SAPM** untuk **mencatat data pengadaan software/lisensi IT dan memantau pekerjaan staff**. Aplikasi ini menggantikan rekap Excel + dashboard Tableau.

**Prinsip utama: SIPITA adalah sistem pencatatan, bukan sistem workflow.**
Semua proses pengadaan (approval, tender, PVP, MoA, LoA, PO, kontrak) **terjadi di luar sistem**. SIPITA hanya:
1. Menyimpan **data pengadaan** (historis sejak 2015 dan yang berjalan) agar mudah dicari dan direkap.
2. Melacak **pekerjaan** setiap staff: posisi tahapan (milestone) + log update progres (pengganti update di Excel).
3. Menyajikan **dashboard & report** interaktif untuk staff dan manager.

Masalah yang diselesaikan:
- Sulit menjawab pertanyaan seperti "berapa total nilai pengadaan 2015 sampai sekarang?" karena data tersebar di banyak Excel.
- Manager tidak punya visibilitas langsung atas pekerjaan dan progres tiap staff.

**Di luar lingkup** (jangan dibuat): pengadaan hardware/laptop (ada sistem terpisah), approval di dalam sistem, perbandingan penawaran, generate PO/PDF dokumen pengadaan, penerimaan barang, gudang/aset fisik, anggaran.

Jenis pengadaan yang dicatat: **Renewal License**, **New License**, **New Application**.

Bahasa UI: **Bahasa Indonesia**. Kode, nama variabel, nama tabel, dan komentar teknis: **Bahasa Inggris**.
Mata uang default: **IDR** (format `Rp 1.250.000`). Data boleh dalam mata uang lain (lihat bagian 6 → Mata Uang). Zona waktu: **Asia/Jakarta**.

---

## 2. Tech Stack

### Frontend (`/client`)
- **React 18 + Vite** (TypeScript)
- **TailwindCSS v4** via `@tailwindcss/vite`
- **DaisyUI v5** (`@plugin "daisyui";` di file CSS utama). Tema custom: **`velzon`** (light, default) & **`velzon-dark`** (dark) — lihat bagian 9 → *Tema & Desain Visual*
- **React Router v6** (data router: `createBrowserRouter`)
- **TanStack Query v5** untuk data fetching & cache
- **React Hook Form + Zod** untuk form & validasi
- **Axios** (instance terpusat dengan interceptor JWT + refresh token)
- **Recharts** untuk grafik dashboard & report
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
- **multer** untuk upload file (file Excel import, lampiran update pekerjaan)
- **exceljs** untuk membaca file import dan membuat template + export report `.xlsx`
- **puppeteer** untuk export report ke PDF
- **node-cron** untuk job terjadwal (kontrak jatuh tempo, pekerjaan tidak di-update)
- **nodemailer** untuk notifikasi email (opsional, notifikasi in-app wajib)
- **pino** untuk logging
- **helmet, cors, express-rate-limit** untuk keamanan

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
├── docs/
│   ├── design/
│   │   ├── velzon-reference.png    # acuan visual (WAJIB dilihat sebelum membuat halaman baru)
│   │   └── velzon-preview.html     # contoh pola komponen tema velzon
│   └── import/
│       └── template-import.xlsx    # template resmi import (di-generate dari kode, lihat bagian 7)
├── docker-compose.yml          # postgres + pgadmin
├── package.json                # npm workspaces
├── shared/
│   └── src/
│       ├── schemas/            # zod schema: work.schema.ts, memo.schema.ts, ...
│       ├── enums.ts            # semua enum (bagian 6)
│       └── index.ts
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── uploads/                # file upload (gitignored)
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── config/             # env.ts (validasi env dengan zod)
│       ├── lib/                # prisma.ts, logger.ts, mailer.ts, excel.ts, pdf.ts
│       ├── middleware/         # auth.ts, permission.ts, validate.ts, errorHandler.ts, upload.ts
│       ├── modules/
│       │   ├── auth/
│       │   ├── users/              # + permission per fitur
│       │   ├── organization/       # directorate, division, department
│       │   ├── vendors/
│       │   ├── works/              # Pekerjaan + milestone + log update
│       │   ├── memos/              # Memo pengajuan & semua jenis MoA
│       │   ├── rfqs/               # RFQ + LoA
│       │   ├── pvp-forums/
│       │   ├── purchase-orders/    # + term of payment
│       │   ├── agreements/         # + addendum
│       │   ├── milestone-templates/
│       │   ├── settings/           # ambang & konfigurasi (AppSetting)
│       │   ├── imports/            # upload, preview, commit, rollback
│       │   ├── dashboard/
│       │   ├── reports/
│       │   ├── notifications/
│       │   ├── attachments/
│       │   └── audit-logs/
│       ├── jobs/               # contractExpiry.job.ts, staleWork.job.ts
│       └── utils/              # numbering.ts, pagination.ts, currency.ts, procurementRules.ts
└── client/
    └── src/
        ├── main.tsx
        ├── index.css           # entry CSS: tailwind + daisyui + tema velzon (bagian 9)
        ├── router.tsx
        ├── api/
        ├── hooks/              # useAuth, usePermission, query hooks per modul
        ├── stores/             # authStore.ts, themeStore.ts
        ├── components/
        │   ├── layout/         # AppLayout, Sidebar, Navbar, Breadcrumb
        │   ├── ui/             # DataTable, StatusBadge, ConfirmModal, FileUpload,
        │   │                   # CurrencyInput, EmptyState, PageHeader, StatCard,
        │   │                   # MilestoneTrack, DataIssueBadge
        │   └── charts/         # chartColors.ts + wrapper Recharts
        ├── features/
        │   ├── auth/
        │   ├── dashboard/
        │   ├── works/              # daftar, pekerjaan saya, detail, update progres
        │   ├── monitoring/         # monitoring tim (manager)
        │   ├── agreements/
        │   ├── vendors/
        │   ├── reports/
        │   ├── imports/
        │   └── settings/           # user & permission, organisasi, template milestone, ambang
        └── utils/              # formatCurrency, formatDate, cn
```

Setiap modul backend berisi: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (atau impor dari `shared`).
**Aturan:** controller tipis (parse request → panggil service → kirim response). Logika bisnis HANYA di service.

---

## 4. Pengguna, Jabatan & Hak Akses

Semua pengguna adalah anggota tim **IT SAPM**. **Seluruh input data dilakukan oleh staff IT SAPM**, termasuk data dokumen yang diproses tim lain (mis. nomor LoA).

| Jabatan (`jobLevel`) | Lihat data | Ubah data |
|---|---|---|
| `STAFF` | Semua data pengadaan & report | Hanya pekerjaan yang PIC-nya dirinya (buat, ubah, hapus, milestone, dokumen, log update) |
| `MANAGER_L1` | Semua, termasuk Monitoring Tim | Semua pekerjaan; bisa mengganti PIC |
| `MANAGER_L2` | Semua, termasuk Monitoring Tim | Semua pekerjaan; bisa mengganti PIC |

- Flag `isAdmin` (terpisah dari jabatan): kelola user, permission, organisasi, template milestone, pengaturan ambang, rollback import.
- Hak akses per fitur di `UserPermission` (userId + feature → `canView`, `canCreate`, `canUpdate`, `canDelete`). Permission **mempersempit** aturan jabatan di atas, tidak memperluas.
- Backend: `requireAuth` → `requirePermission(feature, action)` → cek kepemilikan di service (staff hanya boleh mengubah pekerjaan miliknya). `isAdmin` melewati cek permission.
- Frontend: `usePermission()` + komponen `<Can feature="..." action="...">` untuk menyembunyikan tombol. Tetap wajib dicek di backend.
- Perbedaan `MANAGER_L1` dan `MANAGER_L2` saat ini hanya label jabatan. Jangan buat aturan berbeda tanpa ditanyakan.
- Struktur organisasi: `Directorate` → `Division` → `Department` → `User`.

---

## 5. Aturan Bisnis Pengadaan

### 5.1 Konsep Pekerjaan

**Satu pengadaan = satu Pekerjaan (`Work`).** Semua dokumen (Memo, MoA, RFQ, PVP, PO, Agreement, Addendum) menempel ke pekerjaan. Setiap pekerjaan:
- punya **satu PIC staff**,
- punya **milestone** yang dibentuk otomatis dari template sesuai metodenya,
- punya **log update** (`WorkUpdate`) yang ditulis staff setiap ada progres.

### 5.2 Metode Pengadaan

| Metode | Kode | Kapan dipakai |
|---|---|---|
| Tender | `TENDER` | Nilai **> Rp1.000.000.000** |
| Bidding | `BIDDING` | Nilai **≤ Rp1.000.000.000** |
| Perpanjangan Khusus (PK) | `SPECIAL_EXTENSION` | Pekerjaan **existing** dari kontrak yang **masih aktif** |
| Penunjukan Langsung (PL) | `DIRECT_APPOINTMENT` | Pekerjaan baru tanpa perbandingan (jarang; pengadaan diwajibkan tender/bidding) |

- Metode diinput staff sesuai keputusan di luar sistem. Untuk Tender/Bidding, sistem **menyarankan** metode dari nilai dan menampilkan peringatan jika tidak cocok, tetapi tidak memblokir.
- Ambang disimpan di `AppSetting`, **tidak boleh di-hardcode** (bagian 5.6).

### 5.3 Aturan PVP Forum

- **PVP wajib** jika:
  - nilai (dalam IDR) **> `PVP_MIN_AMOUNT`** (500.000.000) **DAN** kenaikan dari tahun sebelumnya **> `PVP_MIN_INCREASE_PERCENT`** (5%), **atau**
  - pengadaan baru tanpa data pembelian tahun sebelumnya dan nilai **> `PVP_MIN_AMOUNT`**.
- `increasePercent = (amount − previousPurchaseAmount) / previousPurchaseAmount × 100`, dihitung otomatis jika `previousPurchaseAmount` diisi.
- `Work.pvpRequired` dihitung oleh service, bukan input user. Jika PVP tidak wajib, milestone PVP berstatus `NOT_APPLICABLE`.
- Jika PVP wajib, **semua milestone setelah PVP harus menunggu PVP berstatus `DONE`**.
- PVP dianggap selesai bila **minimal 2 Direktur** tercatat menyetujui (`PvpApproval.decision = APPROVED`). Approval dilakukan di luar sistem. Nama direktur diinput sebagai teks karena direktur bukan pengguna SIPITA. Jumlah minimum disimpan di `AppSetting` (`PVP_MIN_DIRECTOR_APPROVALS = 2`).

### 5.4 Template Milestone per Metode

PVP* = hanya berlaku jika PVP wajib (5.3). Milestone dalam satu kurung siku `[ ... ]` boleh berjalan bersamaan.

**Tender / Bidding**
```
Memo → RFQ → PVP* → MoA Hasil Tender → LoA → MoA Biaya → PO → Agreement
                                     (LoA diproses tim di luar IT, diinput staff IT)
```

**Penunjukan Langsung (PL)**
```
Memo PL → PVP* → Approval Pejabat ─┬─ MoA PL ────┐
                                   └─ MoA Biaya ─┴─→ PO → Agreement baru
```

**Perpanjangan Khusus (PK)**
```
Memo PK (pilih kontrak aktif) → PVP* → Approval Pejabat ─┬─ MoA PK ────┐
                                                         └─ MoA Biaya ─┴─→ PO → Addendum / Agreement baru
```

Definisi template (disimpan di `MilestoneTemplate`, bisa diubah admin dari menu Pengaturan; seed sesuai tabel ini):

| Metode | Urutan | Milestone (`MilestoneType`) | Pelaksana (`Executor`) | Prasyarat | Kondisional |
|---|---|---|---|---|---|
| TENDER/BIDDING | 1 | `MEMO` | `IT` | – | |
| | 2 | `RFQ` | `IT` | MEMO | |
| | 3 | `PVP` | `DIRECTORS` | RFQ | PVP* |
| | 4 | `MOA_METHOD` (MoA Hasil Tender) | `IT` | PVP | |
| | 5 | `LOA` | `OTHER_TEAM` | MOA_METHOD | |
| | 6 | `MOA_COST` (MoA Biaya) | `IT` | LOA | |
| | 7 | `PO` | `IT` | MOA_METHOD, MOA_COST | |
| | 8 | `AGREEMENT` | `IT` | PO | |
| PL | 1 | `MEMO` (Memo PL) | `IT` | – | |
| | 2 | `PVP` | `DIRECTORS` | MEMO | PVP* |
| | 3 | `OFFICIAL_APPROVAL` | `OFFICIAL` | PVP | |
| | 4 | `MOA_METHOD` (MoA PL) | `IT` | OFFICIAL_APPROVAL | |
| | 4 | `MOA_COST` | `IT` | OFFICIAL_APPROVAL | |
| | 5 | `PO` | `IT` | MOA_METHOD, MOA_COST | |
| | 6 | `AGREEMENT` | `IT` | PO | |
| PK | 1 | `MEMO` (Memo PK) | `IT` | – | |
| | 2 | `PVP` | `DIRECTORS` | MEMO | PVP* |
| | 3 | `OFFICIAL_APPROVAL` | `OFFICIAL` | PVP | |
| | 4 | `MOA_METHOD` (MoA PK) | `IT` | OFFICIAL_APPROVAL | |
| | 4 | `MOA_COST` | `IT` | OFFICIAL_APPROVAL | |
| | 5 | `PO` | `IT` | MOA_METHOD, MOA_COST | |
| | 6 | `AGREEMENT_OR_ADDENDUM` | `IT` | PO | |

- Prasyarat dianggap terpenuhi bila milestone prasyarat berstatus `DONE` **atau** `NOT_APPLICABLE`.
- Perubahan template **tidak** mengubah milestone pekerjaan yang sudah ada (hanya untuk pekerjaan baru).
- LoA pelaksananya `OTHER_TEAM` (tim di luar IT), tetapi tetap bagian dari pekerjaan IT dan diinput staff IT. Pada Tender/Bidding, LoA terbit setelah MoA Hasil Tender dan menjadi prasyarat MoA Biaya (keputusan user 2026-10-25; urutan Tender/Bidding sepenuhnya berurutan, tanpa cabang paralel).

### 5.5 Validasi yang Memblokir vs Peringatan

**Memblokir** — berlaku untuk input & update **melalui aplikasi**:
1. Milestone tidak boleh `IN_PROGRESS`/`DONE` sebelum semua prasyaratnya terpenuhi.
2. **PO tidak boleh dicatat** sebelum MoA sesuai metode **dan** MoA Biaya berstatus `DONE` (berlaku di semua metode).
3. PVP tidak boleh `DONE` jika approval direktur yang tercatat < `PVP_MIN_DIRECTOR_APPROVALS`.
4. PK wajib merujuk `sourceAgreementId` yang **aktif** pada tanggal Memo PK.
5. Milestone akhir PK tidak boleh `DONE` sebelum staff memilih hasilnya: `ADDENDUM` (pada kontrak lama) atau `NEW_AGREEMENT`. Pilihan mengikuti keputusan di luar sistem, sistem tidak menentukan.
6. Nomor dokumen (memo, RFQ, LoA, PO, agreement, addendum) harus unik.
7. Dokumen **ditolak** jika prasyarat milestone yang terkait belum terpenuhi (berlaku untuk semua dokumen, bukan hanya PO).
8. Milestone berbasis dokumen hanya bisa `DONE` dengan mencatat dokumennya; status manual hanya `NOT_STARTED` / `IN_PROGRESS`. Pengecualian: `OFFICIAL_APPROVAL` (tanpa tabel dokumen) boleh `DONE` manual.

**Peringatan** (data tetap tersimpan, ditandai di daftar, detail, dan report Kelengkapan Data):
- Data hasil **import** yang melanggar aturan 1–5 (mis. data 2015 tanpa MoA Biaya) → **tetap masuk** dan ditandai "belum lengkap".
- Metode tidak cocok dengan ambang nilai.
- Pekerjaan tidak di-update lebih dari `STALE_WORK_DAYS` hari.

Buat helper murni di `server/src/utils/procurementRules.ts` (mudah di-test): `suggestMethod(amountIdr, settings)`, `isPvpRequired(amountIdr, increasePercent | null, settings)`, `canStartMilestone(milestone, allMilestones)`, `canRecordPo(work)`, `getDataIssues(work)`.

### 5.6 Pengaturan (`AppSetting`, bukan hardcode)

| Key | Default | Keterangan |
|---|---|---|
| `TENDER_MIN_AMOUNT` | 1000000000 | Di atas ini → Tender |
| `PVP_MIN_AMOUNT` | 500000000 | Ambang nilai PVP |
| `PVP_MIN_INCREASE_PERCENT` | 5 | Ambang kenaikan YoY PVP |
| `PVP_MIN_DIRECTOR_APPROVALS` | 2 | Minimal direktur yang menyetujui |
| `STALE_WORK_DAYS` | 7 | Pekerjaan dianggap tidak di-update |
| `CONTRACT_REMINDER_DAYS` | [90, 60, 30] | Pengingat kontrak jatuh tempo |

### 5.7 Status

- **Pekerjaan (`WorkStatus`):** `ACTIVE, ON_HOLD, COMPLETED, CANCELLED`. `COMPLETED` hanya bisa diset jika milestone terakhir `DONE` (untuk input aplikasi).
- **Milestone (`MilestoneStatus`):** `NOT_STARTED, IN_PROGRESS, DONE, NOT_APPLICABLE`.
- **Tahapan saat ini** pekerjaan **dihitung** (bukan disimpan): milestone wajib yang belum `DONE` dan prasyaratnya sudah terpenuhi. Bisa lebih dari satu (paralel).
- **Agreement:** `ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED`, dihitung dari `periodEnd` + `CONTRACT_REMINDER_DAYS` oleh job harian.

### 5.8 Penomoran

Nomor dokumen (memo, RFQ, LoA, PO, agreement, addendum) **berasal dari dokumen asli dan diinput manual**. Sistem tidak men-generate nomor dokumen.
Satu-satunya nomor otomatis adalah kode pekerjaan: `WRK-{YYYY}-{NNNN}` (YYYY = tahun pengadaan, counter per tahun). Gunakan tabel `DocumentSequence` + transaksi `SELECT ... FOR UPDATE`.

---

## 6. Skema Database (Prisma — garis besar)

Semua tabel memakai: `id` (UUID), `createdAt`, `updatedAt`. Tabel data pengadaan juga punya `createdById`, `updatedById`, dan `importBatchId?` (asal import, untuk rollback).
Nama model PascalCase, nama tabel snake_case via `@@map`. Uang disimpan sebagai `Decimal(18,2)`.
**Soft delete** (`deletedAt`) untuk semua data pengadaan & master data.

### Mata Uang
Setiap tabel bernilai uang menyimpan `amount`, `currency` (ISO 3 huruf, default `IDR`), `exchangeRate` (ke IDR, default 1), dan `amountIdr` (dihitung = amount × exchangeRate). Semua rekap, ambang, dan grafik memakai `amountIdr`. Tampilan detail menunjukkan nilai asli + nilai IDR.

### Master & Auth
- `User` (employeeId unik, username unik, name, email unik, passwordHash, jobLevel [JobLevel], departmentId, isAdmin, isActive)
- `UserPermission` (userId, feature [Feature], canView, canCreate, canUpdate, canDelete) — unik per (userId, feature)
- `Directorate` (code, name) · `Division` (code, name, directorateId) · `Department` (code, name, divisionId)
- `RefreshToken` (userId, tokenHash, expiresAt, revokedAt)
- `Vendor` (code unik, name, address, picName, npwp unik, email?, phone?)

### Pekerjaan & Progres
- `Work` (code unik `WRK-YYYY-NNNN`, title, procurementType [ProcurementType], category [BAU/PROJECT], method [ProcurementMethod], procurementYear, picId → User, requesterDirectorateId?, vendorId?, amount, currency, exchangeRate, amountIdr, previousPurchaseAmount?, increasePercent? Decimal(7,2), pvpRequired, periodStart?, periodEnd?, sourceAgreementId? (wajib untuk PK), pkResult? [ADDENDUM/NEW_AGREEMENT], status [WorkStatus], lastUpdatedAt, notes)
- `WorkMilestone` (workId, type [MilestoneType], sequence, executor [Executor], status [MilestoneStatus], isConditional, prerequisites MilestoneType[], startedAt?, completedAt?, referenceNo?, notes) — unik per (workId, type)
- `WorkUpdate` (workId, milestoneId?, authorId, note, statusFrom?, statusTo?, attachmentId?, createdAt) — **log progres; tidak bisa diedit/dihapus**, koreksi ditulis sebagai update baru
- `MilestoneTemplate` (method, type, sequence, executor, prerequisites MilestoneType[], isConditional, isActive)

### Dokumen Pengadaan
- `Memo` (workId, memoNo unik, memoType [MemoType], title, memoDate, requesterName, amount?, currency?, exchangeRate?, amountIdr?, notes) — mencakup memo pengajuan dan semua jenis MoA
- `Rfq` (workId unik, rfqNo unik, method [TENDER/BIDDING], periodStart, periodEnd, amount, currency, exchangeRate, amountIdr, termOfPayment, loaNo? unik, loaDate?, loaProcessedBy? (nama tim di luar IT))
- `PvpForum` (workId unik, pvpDate, status [PENDING/APPROVED/REJECTED], notes)
- `PvpApproval` (pvpForumId, directorName, decision [APPROVED/REJECTED], approvalDate, notes)
- `PurchaseOrder` (workId, poNo unik, poType [NEW/RENEWAL], poName, poDate, amount, currency, exchangeRate, amountIdr, requesterName, previousPoId?, previousPoNo?, previousPoAmount?, previousPoCurrency?)
- `PoPaymentTerm` (poId, sequence, description, percentage?, amount, dueDate?, isPaid) — unik per (poId, sequence)
- `Agreement` (agreementNo unik, agreementType [NEW/RENEWAL], title, vendorId, poId unik, workId, picId, periodStart, periodEnd, amount, currency, exchangeRate, amountIdr, status)
- `Addendum` (agreementId, workId, addendumNo unik, title, addendumDate, newPeriodEnd?, valueChange?, currency?, poId?, notes)

### Import & Sistem
- `ImportBatch` (fileName, uploadedById, uploadedAt, status [PREVIEW/COMMITTED/ROLLED_BACK/FAILED], totalRows, validRows, warningRows, errorRows, committedAt?, rolledBackAt?)
- `ImportRowIssue` (batchId, sheet, rowNumber, level [ERROR/WARNING], field?, message)
- `AppSetting` (key unik, value JSON, description)
- `Attachment` (fileName, mimeType, size, path, uploadedById, refType, refId)
- `Notification` (userId, type, title, message, link, isRead, dedupeKey)
- `AuditLog` (userId, action, entity, entityId, before JSON, after JSON, source [APP/IMPORT], ip)
- `DocumentSequence` (prefix, year, lastNumber)

**Setiap create/update/delete data pengadaan wajib menulis `AuditLog`** (termasuk yang berasal dari import), supaya riwayat perubahan bisa ditelusuri dari halaman detail.

### Enum (di `shared/src/enums.ts` dan Prisma)
- `ProcurementType`: `RENEWAL_LICENSE, NEW_LICENSE, NEW_APPLICATION`
- `ProjectCategory`: `BAU, PROJECT`
- `ProcurementMethod`: `TENDER, BIDDING, SPECIAL_EXTENSION, DIRECT_APPOINTMENT`
- `MemoType`: `MEMO_PROCUREMENT, MEMO_PL, MEMO_PK, MOA_TENDER_RESULT, MOA_PL, MOA_PK, MOA_COST`
- `MilestoneType`: `MEMO, RFQ, PVP, OFFICIAL_APPROVAL, MOA_METHOD, MOA_COST, LOA, PO, AGREEMENT, AGREEMENT_OR_ADDENDUM`
- `Executor`: `IT, OTHER_TEAM, DIRECTORS, OFFICIAL`
- `MilestoneStatus`: `NOT_STARTED, IN_PROGRESS, DONE, NOT_APPLICABLE`
- `WorkStatus`: `ACTIVE, ON_HOLD, COMPLETED, CANCELLED`
- `PkResult`: `ADDENDUM, NEW_AGREEMENT`
- `PoType` / `AgreementType`: `NEW, RENEWAL`
- `JobLevel`: `STAFF, MANAGER_L1, MANAGER_L2`
- `Feature`: `DASHBOARD, WORK, MONITORING, AGREEMENT, VENDOR, REPORT, IMPORT, SETTINGS`

### Sinkronisasi Dokumen ↔ Milestone
Saat dokumen dicatat, milestone terkait otomatis menjadi `DONE` (jika prasyarat terpenuhi untuk input aplikasi). `completedAt` diambil dari tanggal dokumen:

| Dokumen | Milestone |
|---|---|
| Memo `MEMO_PROCUREMENT` / `MEMO_PL` / `MEMO_PK` | `MEMO` |
| `Rfq` (selesai saat No. RFQ dicatat; tanggal = tanggal input) | `RFQ` |
| `PvpForum` berstatus APPROVED | `PVP` |
| Memo `MOA_TENDER_RESULT` / `MOA_PL` / `MOA_PK` (sesuai metode) | `MOA_METHOD` |
| Memo `MOA_COST` | `MOA_COST` |
| `Rfq.loaNo` + `loaDate` terisi | `LOA` |
| `PurchaseOrder` | `PO` |
| `Agreement` | `AGREEMENT` / `AGREEMENT_OR_ADDENDUM` (pkResult = NEW_AGREEMENT) |
| `Addendum` | `AGREEMENT_OR_ADDENDUM` (pkResult = ADDENDUM) |

`OFFICIAL_APPROVAL` tidak punya tabel dokumen; diisi lewat milestone (`referenceNo`, `completedAt`, `notes` berisi nama/jabatan pejabat).

### ERD

```mermaid
erDiagram
    Directorate ||--o{ Division : "membawahi"
    Division ||--o{ Department : "membawahi"
    Department ||--o{ User : "anggota"
    User ||--o{ UserPermission : "punya"

    User ||--o{ Work : "PIC"
    User ||--o{ WorkUpdate : "menulis"
    Vendor |o--o{ Work : "vendor"
    Agreement |o--o{ Work : "kontrak sumber (PK)"

    Work ||--o{ WorkMilestone : "milestone"
    Work ||--o{ WorkUpdate : "log progres"
    WorkMilestone |o--o{ WorkUpdate : "terkait"
    MilestoneTemplate }o--o{ WorkMilestone : "membentuk"

    Work ||--o{ Memo : "memo & MoA"
    Work ||--o| Rfq : "1 pekerjaan 1 RFQ (+LoA)"
    Work ||--o| PvpForum : "1 pekerjaan 1 PVP"
    PvpForum ||--o{ PvpApproval : "approval direktur"
    Work ||--o{ PurchaseOrder : "PO"
    PurchaseOrder ||--o{ PoPaymentTerm : "1 PO banyak TOP"
    PurchaseOrder |o--o{ PurchaseOrder : "renewal dari"
    PurchaseOrder ||--o| Agreement : "1 agreement 1 PO"
    Work |o--o{ Agreement : "menghasilkan"
    Agreement ||--o{ Addendum : "1 agreement banyak addendum"
    Work |o--o{ Addendum : "menghasilkan (PK)"

    Vendor ||--o{ Agreement : "pihak kontrak"
    User ||--o{ Agreement : "PIC"

    ImportBatch ||--o{ ImportRowIssue : "masalah baris"
    ImportBatch |o--o{ Work : "asal data"
```

**Kardinalitas yang wajib dijaga (constraint `@unique` / FK):**
- 1 Pekerjaan → 1 RFQ, 1 PVP Forum, banyak Memo/MoA, banyak PO, banyak milestone & log update
- 1 PO → banyak Term of Payment; 1 Agreement → 1 PO (`Agreement.poId` unik); 1 Agreement → banyak Addendum
- 1 Vendor → banyak Pekerjaan dan Agreement
- 1 User → banyak Pekerjaan (sebagai PIC) dan log update

---

## 7. Import Excel

Data pengadaan masuk **hanya lewat import Excel** (historis 2015–sekarang dan data massal). Form di aplikasi dipakai untuk **update progres, koreksi data, dan melengkapi dokumen**. Pekerjaan baru juga boleh dibuat lewat form aplikasi: staff untuk dirinya sendiri, manager untuk siapa pun.

- **Acuan format: `docs/import/template-import.xlsx`** (contoh dari user, berisi data contoh). Template resmi di-generate dari kode (`GET /imports/template`) dengan struktur yang **sama persis** (nama sheet, header, urutan kolom, dropdown) tetapi tanpa data contoh. Sheet: `Petunjuk`, `Vendor`, `Pekerjaan`, `Memo`, `RFQ`, `PVP`, `PVP_Approval`, `Approval_Pejabat`, `PO`, `PO_TOP`, `Agreement`, `Addendum`, dan sheet tersembunyi `Daftar` (sumber dropdown).
- Header berbahasa Indonesia; tanda `*` di header = wajib (abaikan `*` saat mencocokkan header). Kolom enum berisi **label Bahasa Indonesia** (mis. `Perpanjangan Khusus`, `MoA Biaya`); importer memetakan label → kode enum sesuai tabel di sheet `Petunjuk`.
- Kolom berlabel `(otomatis)` berisi rumus Excel. Importer **mengabaikan** kolom ini dan menghitung ulang di server.
- Sheet `Approval_Pejabat` mengisi milestone `OFFICIAL_APPROVAL` (nama pejabat, jabatan, no. referensi, tanggal). Tanggal kosong = milestone `IN_PROGRESS`.
- Baris antar-sheet dihubungkan dengan **kunci bisnis**, bukan UUID: `Kode Pekerjaan` (boleh kosong untuk pekerjaan baru, maka di-generate dan dihubungkan lewat kolom `Ref Baris`), `No. PO`, `No. Agreement`, `Kode Vendor`.
- **Alur import:** upload → parse & validasi → status `PREVIEW` (tampilkan ringkasan + daftar `ImportRowIssue`) → user klik **Simpan** → `COMMITTED` dalam satu `prisma.$transaction`.
  - `ERROR` (baris ditolak): kolom wajib kosong, format tanggal/angka salah, enum tidak dikenal, nomor dokumen duplikat dengan data lain, referensi tidak ditemukan.
  - `WARNING` (baris tetap masuk, ditandai belum lengkap): pelanggaran aturan bisnis 5.5 (mis. PO tanpa MoA Biaya, PVP wajib tapi tidak ada data PVP).
  - User bisa memilih **simpan baris valid saja** atau batalkan.
- **Upsert berdasarkan nomor dokumen**: jika nomor sudah ada, data di-update (tercatat di `AuditLog` dengan `source = IMPORT`), bukan duplikat.
- **Rollback**: admin dapat membatalkan batch `COMMITTED` → soft delete data yang dibuat batch itu dan kembalikan data yang di-update ke nilai `before` di `AuditLog`. Rollback ditolak jika data dari batch itu sudah diubah lewat aplikasi setelahnya (tampilkan daftar konfliknya).
- Milestone untuk data import dibentuk dari template, lalu statusnya diisi dari dokumen yang ada (bagian 6 → Sinkronisasi), **tanpa** validasi blokir.
- Proses import file besar (> 2.000 baris) tidak boleh memblokir request: proses bertahap dan tampilkan progres.

---

## 8. Konvensi API

- Base URL: `/api/v1`. Resource jamak & kebab-case.
- List endpoint mendukung `page`, `limit` (default 20, max 100), `search`, `sort` (`field:asc|desc`), dan filter (`year`, `yearFrom`, `yearTo`, `method`, `procurementType`, `category`, `vendorId`, `picId`, `status`, `hasIssues`).
- Format response sukses: `{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 134 } }`
- Format response error (ditangani `errorHandler` terpusat): `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Pesan dalam Bahasa Indonesia", "details": [] } }`
- Kode error aturan bisnis: `MILESTONE_PREREQUISITE_NOT_MET`, `PO_REQUIRES_MOA`, `PVP_INSUFFICIENT_APPROVALS`, `PK_SOURCE_AGREEMENT_INACTIVE`, `PK_RESULT_REQUIRED`, `DUPLICATE_DOCUMENT_NUMBER`, `NOT_WORK_OWNER`.
- Class `AppError(statusCode, code, message)`; jangan `throw` string mentah. Semua input divalidasi Zod via `validate({ body, query, params })`.
- Operasi multi-tabel (catat dokumen + update milestone + tulis log + audit) **wajib** memakai `prisma.$transaction`.

Endpoint utama:
- `GET/POST /works`, `GET/PATCH/DELETE /works/:id`, `GET /works/mine`
- `PATCH /works/:id/milestones/:milestoneId` (status, tanggal, referensi) — divalidasi aturan 5.5
- `GET/POST /works/:id/updates` (log progres)
- `POST /works/:id/reassign` (manager: ganti PIC)
- Dokumen: `/works/:id/memos`, `/works/:id/rfq`, `/works/:id/pvp` (+ `/approvals`), `/works/:id/purchase-orders` (+ `/:poId/payment-terms`), `/agreements`, `/agreements/:id/addendums`
- `GET /works/:id/history` (gabungan log update + audit log, urut waktu)
- `GET /procurement-rules/evaluate?amountIdr=&previousPurchaseAmount=` → saran metode + apakah PVP wajib (preview di form)
- Import: `GET /imports/template`, `POST /imports` (upload → preview), `GET /imports/:id`, `POST /imports/:id/commit`, `POST /imports/:id/rollback`
- Dashboard & report: lihat bagian 10. Semua endpoint report menerima `format=json|xlsx|pdf`.

---

## 9. Konvensi Frontend

- Layout: **sidebar** (DaisyUI `drawer` + `menu`) + **navbar** (notifikasi bell, toggle tema, profil). Responsif — sidebar jadi drawer di mobile.
- Komponen DaisyUI sebagai dasar: `btn`, `card`, `table`, `badge`, `modal`, `input`, `select`, `textarea`, `steps`, `stats`, `tabs`, `alert`, `toast`, `loading`, `drawer`, `menu`, `dropdown`, `timeline`.
- `StatusBadge` (varian `badge-soft`): Not started/Draft → `badge-ghost`, In progress/On hold → `badge-warning`, Done/Active/Completed → `badge-success`, Expired/Cancelled/Rejected → `badge-error`, N/A → `badge-ghost` + teks redup, Expiring soon → `badge-warning`.
- `DataIssueBadge`: tanda peringatan kecil (`badge badge-soft badge-warning` + ikon) di baris/detail yang punya masalah kelengkapan data; tooltip berisi daftar masalahnya.
- **`MilestoneTrack`**: visualisasi milestone di detail pekerjaan dengan cabang paralel (lihat bagian 5.4). Tiap node menampilkan status, pelaksana (IT / Tim di luar IT / Direksi / Pejabat), dan tanggal selesai. Node yang belum bisa dimulai tampak terkunci dengan alasan prasyaratnya.
- Form uang memakai `CurrencyInput` + pilihan mata uang + kurs (kurs disembunyikan bila IDR).
- Semua tabel list: pencarian, filter, sorting, pagination **server-side**, export Excel.
- **Klik data di grafik** (bar/segmen) membuka daftar data yang membentuk angka tersebut (drill-down) dengan filter yang sama.
- Loading: skeleton DaisyUI; error: `alert alert-error`; kosong: `EmptyState`.
- Aksi penting (hapus, ubah PIC, commit/rollback import) memakai `ConfirmModal`.
- Query key TanStack Query: `['works', params]`, `['works', id]`, `['works', id, 'updates']` — invalidate setelah mutasi.
- Semua teks UI dalam Bahasa Indonesia.

### Tema & Desain Visual (Velzon)

Seluruh UI mengikuti tampilan template admin **Velzon**: flat, bersih, kartu putih di atas latar off-white hangat, radius kecil, aksen indigo.
**Sebelum membuat halaman/komponen baru, lihat `docs/design/velzon-reference.png`** dan contoh pola di `docs/design/velzon-preview.html`.

**Setup tema** — `client/src/index.css` adalah satu-satunya entry CSS dan berisi:

```css
@import "tailwindcss";
@plugin "daisyui";

@plugin "daisyui/theme" {
  name: "velzon";
  default: true;
  prefersdark: false;
  color-scheme: light;
  --color-base-100: #ffffff;   /* card, sidebar, navbar */
  --color-base-200: #f9f6f3;   /* latar halaman */
  --color-base-300: #e9ebec;   /* border, divider */
  --color-base-content: #212529;
  --color-primary: #687cfe;    --color-primary-content: #ffffff;
  --color-secondary: #ff7f5d;  --color-secondary-content: #ffffff;
  --color-accent: #0ac7fb;     --color-accent-content: #ffffff;
  --color-neutral: #343a40;    --color-neutral-content: #f8f9fa;
  --color-info: #0ac7fb;       --color-info-content: #ffffff;
  --color-success: #3cd188;    --color-success-content: #ffffff;
  --color-warning: #efae4e;    --color-warning-content: #ffffff;
  --color-error: #f7666e;      --color-error-content: #ffffff;
  --radius-selector: 0.25rem; --radius-field: 0.25rem; --radius-box: 0.25rem;
  --size-selector: 0.25rem;   --size-field: 0.25rem;
  --border: 1px; --depth: 0; --noise: 0;
}

@plugin "daisyui/theme" {
  name: "velzon-dark";
  default: false;
  prefersdark: true;
  color-scheme: dark;
  --color-base-100: #212529;
  --color-base-200: #1a1d21;
  --color-base-300: #32383e;
  --color-base-content: #ced4da;
  --color-primary: #7a8cff;    --color-primary-content: #ffffff;
  --color-secondary: #ff8f71;  --color-secondary-content: #ffffff;
  --color-accent: #2fd0fc;     --color-accent-content: #0b1a20;
  --color-neutral: #2a2f34;    --color-neutral-content: #ced4da;
  --color-info: #2fd0fc;       --color-info-content: #0b1a20;
  --color-success: #3cd188;    --color-success-content: #0b1f15;
  --color-warning: #efae4e;    --color-warning-content: #231806;
  --color-error: #f7666e;      --color-error-content: #ffffff;
  --radius-selector: 0.25rem; --radius-field: 0.25rem; --radius-box: 0.25rem;
  --size-selector: 0.25rem;   --size-field: 0.25rem;
  --border: 1px; --depth: 0; --noise: 0;
}

@theme {
  --font-sans: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  --shadow-velzon: 0 1px 2px rgba(56, 65, 74, 0.15);
}

@layer components {
  .card { @apply bg-base-100 shadow-velzon; }
  .card-header { @apply flex items-center justify-between px-4 py-3 border-b border-base-300; }
  .card-header .card-title { @apply text-base font-semibold; }
  .stat-label { @apply text-sm font-medium uppercase tracking-wide text-base-content/60; }
  .icon-soft {
    @apply inline-flex items-center justify-center size-12 rounded;
    background: color-mix(in oklab, currentColor 15%, transparent);
  }
  .menu-velzon .menu-title { @apply text-xs font-semibold uppercase tracking-wider text-base-content/50; }
  .menu-velzon li > a { @apply text-base-content/70; }
  .menu-velzon li > a:hover { @apply bg-transparent text-primary; }
  .menu-velzon li > a.active { @apply bg-transparent text-primary font-medium; }
}
```

- Font **Hanken Grotesk** dimuat via `<link>` Google Fonts di `client/index.html` (bukan `@import url()` di CSS, karena `@import` harus di paling atas).
- `<html data-theme="velzon">` di `client/index.html`. `themeStore` (Zustand, persist ke `localStorage`) hanya men-toggle `velzon` ↔ `velzon-dark` dengan mengubah `document.documentElement.dataset.theme`. Default mengikuti `prefers-color-scheme`.
- **Jangan** memakai tema bawaan DaisyUI lain (`corporate`, `business`, dll.).

**Peran warna**

| Token | Dipakai untuk |
|---|---|
| `primary` (indigo) | link, menu aktif, tombol aksi utama, seri grafik utama |
| `secondary` (coral) | aksi "Tambah …"/"Import …", chip filter periode |
| `accent` (cyan) | badge jumlah notifikasi, tombol floating |
| `success` / `error` | kenaikan / penurunan %, status selesai / bermasalah |
| `warning` | peringatan kelengkapan data, kontrak mendekati jatuh tempo, pekerjaan tidak di-update |
| `base-200` | latar halaman; `base-100` = card/sidebar/navbar; `base-300` = border |

**Aturan styling (wajib)**
- Hanya pakai token tema (`bg-base-100`, `text-primary`, `btn-secondary`, `border-base-300`, …). **Dilarang** hardcode hex atau palet Tailwind (`blue-500`, `gray-100`, `#687cfe`) di komponen.
- Radius tetap kecil (dari tema). Hindari `rounded-xl`/`rounded-2xl`, shadow tebal (`shadow-lg` hanya untuk dropdown/modal/FAB), dan gradient.
- Tombol: aksi utama `btn btn-primary`; aksi sekunder varian soft (`btn btn-soft btn-secondary`, `btn btn-sm btn-soft btn-primary`); aksi berbahaya `btn btn-error` / `btn-soft btn-error`.
- Tidak menambah UI library lain (shadcn, MUI, Bootstrap) dan tidak mengubah token tema tanpa diminta.

**Pola komponen**
- **AppLayout:** `drawer lg:drawer-open`. Sidebar `bg-base-100 w-60 border-r border-base-300`, logo "SIPITA" di atas (tinggi sama dengan navbar), `menu menu-velzon` dengan `menu-title` per grup (Menu, Pengadaan, Report, Pengaturan), ikon lucide 18px. Navbar `navbar bg-base-100 border-b border-base-300 sticky top-0`: tombol hamburger, search `input input-sm bg-base-200 border-0` (cari kode pekerjaan / nomor dokumen / vendor), lalu di kanan: toggle tema, bell notifikasi (`indicator` + `badge badge-error badge-xs`), blok profil (avatar + nama + jabatan) dengan latar `bg-base-200`. Konten: `p-6 space-y-6` di atas `bg-base-200`.
- **PageHeader:** judul `text-lg font-semibold` + subjudul `text-sm text-base-content/60` di kiri; filter & tombol aksi di kanan.
- **StatCard:** `card p-4`. Baris atas: `.stat-label` + persentase perubahan (`text-success` + `TrendingUp` / `text-error` + `TrendingDown`). Nilai `text-2xl font-semibold`, link `link link-primary text-sm`, dan `.icon-soft text-{warna}` di kanan bawah. Grid `grid gap-6 sm:grid-cols-2 xl:grid-cols-4`.
- **Card dengan header:** `card` → `.card-header` (judul + tombol `btn-xs btn-soft`) → isi. Strip ringkasan: `grid divide-x divide-dashed divide-base-300 bg-base-200/60 text-center`.
- **DataTable:** dibungkus `card`; toolbar (search + filter + export) di `.card-header`; header `text-xs uppercase text-base-content/60 bg-base-200/60`; baris hover `hover:bg-base-200/40`; pagination `join` di footer.
- **Form:** di dalam `card`, `fieldset` + `label` DaisyUI, tombol simpan di kanan bawah.
- **Grafik (Recharts):** warna dari CSS variable lewat `components/charts/chartColors.ts`, urutan seri: primary → success → warning → secondary → info. Bar ramping (`barSize` ±16), grid dashed `var(--color-base-300)`, teks sumbu `text-base-content/60`. Re-render saat tema berganti.

---

## 10. Menu, Dashboard & Report

### Halaman
| Path | Halaman | Akses |
|---|---|---|
| `/login` | Login (layout terpisah, card di tengah di atas `bg-base-200`) | publik |
| `/` | Dashboard (berbeda untuk staff & manager) | semua |
| `/pekerjaan/saya` | Pekerjaan Saya + tombol "Update progres" | semua |
| `/pekerjaan` | Semua pekerjaan & data pengadaan (filter lengkap) | semua |
| `/pekerjaan/:id` | Detail: ringkasan, `MilestoneTrack`, tab dokumen (Memo & MoA, RFQ & LoA, PVP, PO & TOP, Agreement/Addendum), log update, riwayat perubahan | semua (ubah sesuai bagian 4) |
| `/monitoring` | Monitoring Tim | MANAGER_L1, MANAGER_L2 |
| `/kontrak`, `/kontrak/:id` | Agreement + addendum + countdown jatuh tempo | semua |
| `/vendor`, `/vendor/:id` | Vendor + riwayat pengadaan | semua |
| `/report/*` | Report (lihat di bawah) | semua |
| `/import`, `/import/:batchId` | Import Excel: upload, preview, riwayat batch | permission `IMPORT` |
| `/pengaturan/*` | User & permission, organisasi, template milestone, ambang & pengaturan | admin |

### Dashboard
- **Staff:** pekerjaan aktif saya, pekerjaan saya yang belum di-update > `STALE_WORK_DAYS`, milestone yang sedang menunggu tim lain/direksi/pejabat, kontrak saya yang akan habis.
- **Manager:** KPI tim (pekerjaan aktif, selesai tahun ini, total nilai pengadaan tahun ini, kontrak ≤ 90 hari), beban kerja per staff, pekerjaan tidak di-update, sebaran pekerjaan per tahapan, grafik nilai pengadaan per tahun.

### Monitoring Tim (manager)
- Tabel per staff: jumlah pekerjaan aktif / on hold / selesai, pekerjaan terlama tanpa update, tanggal update terakhir.
- Klik staff → daftar pekerjaannya + tahapan saat ini + log update terbaru.
- Tampilan papan (kolom per tahapan) untuk melihat posisi semua pekerjaan.
- Penanda pekerjaan yang **menunggu pihak di luar IT** (LoA, direksi, pejabat) vs yang tertahan di IT.

### Report (semua bisa difilter, drill-down, export Excel/PDF)
| Path | Report |
|---|---|
| `/report/rekap-tahunan` | **Rekap nilai pengadaan per tahun (2015–sekarang)**, bisa dipecah per metode, jenis, BAU/Project, vendor, direktorat peminta |
| `/report/tren` | Tren kenaikan year-to-year per lisensi/aplikasi/vendor |
| `/report/jatuh-tempo` | Kalender & daftar agreement yang habis dalam 30/60/90 hari (perencanaan renewal) |
| `/report/vendor` | Riwayat & total pengadaan per vendor |
| `/report/kepatuhan` | Kepatuhan PVP (wajib tapi belum tercatat), PO tanpa MoA Biaya/MoA metode, dokumen belum lengkap — sumber utama pembersihan data historis |
| `/report/kinerja-tim` | Pekerjaan per staff (aktif/selesai/terlambat), rata-rata durasi per tahapan, porsi waktu di IT vs di luar IT |

Endpoint: `GET /dashboard/staff`, `GET /dashboard/manager`, `GET /reports/annual-summary`, `/reports/yoy-trend`, `/reports/expiring-agreements`, `/reports/vendor-history`, `/reports/compliance`, `/reports/team-performance`. Agregasi dilakukan di database (Prisma `groupBy` / query ber-parameter), bukan di JavaScript atas seluruh data.

---

## 11. Job Terjadwal (node-cron, zona Asia/Jakarta)

- **07:00 setiap hari** — update status Agreement (`EXPIRING_SOON` / `EXPIRED`) berdasarkan `CONTRACT_REMINDER_DAYS`; notifikasi ke PIC agreement + semua manager pada hari H-90/60/30.
- **08:00 setiap hari kerja** — pekerjaan `ACTIVE` yang `lastUpdatedAt` > `STALE_WORK_DAYS` → notifikasi ke PIC; ringkasannya ke manager.

Job harus idempoten (pakai `Notification.dedupeKey`, jangan kirim notifikasi ganda di hari yang sama).

---

## 12. Keamanan

- Password di-hash bcrypt (cost 12). Jangan pernah mengembalikan `passwordHash` di response.
- Access token di header `Authorization: Bearer`, refresh token di httpOnly + secure + sameSite cookie. Rate limit pada `/auth/login`.
- Upload: whitelist mime (xlsx untuk import; pdf, jpg, png, xlsx, docx untuk lampiran), maks 10 MB (import maks 20 MB), nama file di-generate ulang (UUID). File hanya bisa diunduh lewat endpoint ber-auth.
- Parsing Excel: abaikan formula & macro (baca nilai saja), batasi jumlah baris per sheet, tolak file yang bukan `.xlsx` asli.
- Semua query lewat Prisma (tidak ada raw SQL dari input user tanpa parameter).
- Cek kepemilikan pekerjaan (staff hanya miliknya) dilakukan di service.

---

## 13. Environment Variables

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
MAX_IMPORT_MB=20
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

## 14. Perintah

```bash
docker compose up -d                      # jalankan postgres + pgadmin

npm install                               # install semua workspace
npm run dev                               # client + server bersamaan
npm run lint
npm run test

npm run dev -w server
npm run db:migrate -w server              # prisma migrate dev
npm run db:seed -w server                 # prisma db seed
npm run db:studio -w server               # prisma studio
npm run build -w server

npm run dev -w client                     # vite (port 5173)
npm run build -w client
```

### Seed Data (wajib ada)
- Organisasi: 3 direktorat, divisi & departemen termasuk departemen IT SAPM
- User IT SAPM (password: `Password123!`): 1 admin, 1 `MANAGER_L2`, 1 `MANAGER_L1`, 4 `STAFF`, lengkap dengan `UserPermission`
- `AppSetting` sesuai bagian 5.6; `MilestoneTemplate` sesuai tabel bagian 5.4
- 10 vendor software/lisensi contoh
- ±40 pekerjaan tersebar 2015–2026 di semua metode & jenis (Renewal License Office 365, Entra ID P1, aplikasi baru, dll.), sebagian USD, termasuk:
  - pekerjaan aktif di berbagai tahapan (ada yang menunggu LoA, menunggu PVP, menunggu pejabat)
  - pekerjaan yang tidak di-update > 7 hari
  - Tender dengan PVP (2 approval direktur), Bidding tanpa PVP, 1 PL, 1 PK berakhir Addendum, 1 PK berakhir Agreement baru
  - data "hasil import" tanpa MoA Biaya (untuk report kepatuhan)
  - agreement yang habis < 30 hari
- Log update untuk pekerjaan aktif

---

## 15. Tahapan Pengerjaan (kerjakan berurutan)

0. **Penyesuaian kode lama** — proyek sudah punya kode dari rancangan sebelumnya (PR, approval, penawaran, gudang, aset, anggaran). Audit kode yang ada, buat daftar modul/halaman/tabel yang **tidak lagi dipakai** dan yang **bisa dipakai ulang** (auth, layout Velzon, komponen UI), lalu **tanyakan dulu sebelum menghapus**. Jangan menghapus migration lama; buat migration baru.
1. **Fondasi** — skema Prisma baru (bagian 6), migration, enum di `shared`, `AppSetting`, `MilestoneTemplate`, seed
2. **Auth & akses** — login, refresh token, jabatan + `isAdmin`, `requirePermission`, cek kepemilikan, menu sidebar per akses
3. **Master data & Pengaturan** — organisasi, user & permission, vendor, template milestone, ambang
4. **Pekerjaan** — CRUD, pembentukan milestone dari template, `procurementRules.ts` + unit test, log update, Pekerjaan Saya, detail + `MilestoneTrack`
5. **Dokumen** — Memo/MoA, RFQ/LoA, PVP + approval, PO + TOP, Agreement + Addendum, sinkronisasi dokumen ↔ milestone, validasi blokir (5.5)
6. **Import Excel** — template, upload, preview + issue, commit, upsert, rollback
7. **Dashboard & Monitoring Tim**
8. **Report** — keenam report + drill-down + export Excel/PDF
9. **Job terjadwal & notifikasi**
10. **Riwayat perubahan (audit) di detail, polish UI, test**

Selesaikan & uji satu tahap sebelum lanjut. Setelah tiap tahap, jalankan lint + test dan pastikan aplikasi bisa dijalankan.

---

## 16. Aturan untuk Claude Code

- Selalu gunakan **TypeScript strict**; hindari `any`.
- Jangan menambah library baru di luar stack di atas tanpa alasan jelas — sebutkan alasannya jika perlu.
- Setiap perubahan skema Prisma → buat migration dengan nama deskriptif (`prisma migrate dev --name add_work_milestones`).
- Tulis test untuk logika bisnis penting: `suggestMethod`, `isPvpRequired` (termasuk nilai tepat di ambang dan pengadaan baru tanpa data tahun lalu), prasyarat milestone & cabang paralel, blokir PO tanpa kedua MoA, minimal approval direktur PVP, validasi PK (kontrak aktif & pilihan hasil), konversi mata uang, validasi & upsert import, rollback import, hak ubah staff vs manager.
- Ambang, jumlah approval, hari pengingat, dan template milestone disimpan di database — **jangan hardcode**.
- Ingat prinsip bagian 1: **jangan membuat fitur workflow/approval di dalam sistem**. Sistem hanya mencatat hasil proses di luar.
- Pesan error & validasi untuk user dalam Bahasa Indonesia.
- Jangan commit file `.env` atau folder `uploads/`.
- **UI wajib mengikuti bagian 9 → Tema & Desain Visual (Velzon).** Sebelum membuat halaman baru, lihat `docs/design/velzon-reference.png`.
- Jika ada ambiguitas pada aturan bisnis, tanyakan dulu sebelum mengimplementasikan.

### Hal yang belum diputuskan (tanyakan ke user sebelum mengerjakan bagian terkait)
- **Format Excel lama** (2015–sekarang): template import di bagian 7 adalah format baru. Pemetaan dari file lama menunggu contoh file dari user.
- **Kurs mata uang asing**: saat ini kurs diinput per dokumen (`exchangeRate`). Belum diputuskan apakah perlu tabel kurs per tanggal/tahun.
- **Stok lisensi BAU** (Office 365, Entra ID P1): apakah jumlah seat (total/terpakai) perlu dicatat dan ditampilkan di dashboard.
- **Nama tim pelaksana LoA** (tim di luar IT): untuk label "Menunggu …" di sistem.