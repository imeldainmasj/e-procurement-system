# SIPITA — Sistem Informasi Pengadaan IT & Aset

Monorepo (npm workspaces): `shared` · `server` (Express 5 + Prisma 7 + PostgreSQL 16) · `client` (React 18 + Vite + Tailwind v4 + DaisyUI v5).
Panduan lengkap ada di [CLAUDE.md](./CLAUDE.md).

## Menjalankan secara lokal

```bash
cp .env.example .env                 # port docker (ubah POSTGRES_PORT jika 5432 sudah dipakai)
cp server/.env.example server/.env   # sesuaikan DATABASE_URL dengan POSTGRES_PORT
cp client/.env.example client/.env

npm install
docker compose up -d                 # postgres + pgadmin (http://localhost:5050 — admin@sipita.co.id / admin)
npm run db:generate -w server
npm run db:migrate -w server
npm run db:seed -w server
npm run dev                          # API :4000, client :5173
```

Cek: `GET http://localhost:4000/api/v1/health/ready` → `{ "success": true, "data": { "database": "up" } }`.

## Akun contoh (seed)

Semua password: `Password123!`

| Email                           | Role                                   |
| ------------------------------- | -------------------------------------- |
| superadmin@perusahaan.co.id     | Super Admin                            |
| requester@perusahaan.co.id      | Requester                              |
| gudang@perusahaan.co.id         | Admin Gudang IT (+ Requester)          |
| pengadaan@perusahaan.co.id      | Staf Pengadaan (+ Requester)           |
| manajer.it@perusahaan.co.id     | Approver L1 — Manajer IT (+ Requester) |
| keuangan@perusahaan.co.id       | Approver L2 — Keuangan                 |
| direksi@perusahaan.co.id        | Approver L3 — Direksi                  |
| manajemen@perusahaan.co.id      | Manajemen (Viewer)                     |
| staf.keuangan@perusahaan.co.id  | Requester — Keuangan                   |
| staf.hrd@perusahaan.co.id       | Requester — HRD                        |
| staf.marketing@perusahaan.co.id | Requester — Marketing                  |

Pada database kosong, seed juga membuat riwayat pengadaan Jan–Okt (PR → memo → penawaran → PO,
sebagian sudah diterima & dinilai) untuk dashboard dan riwayat harga, ditambah satu putaran
penawaran bulan ini dengan draft PO. Untuk memuat ulang dari awal: `npx prisma migrate reset -w server` lalu `npm run db:seed -w server` (Prisma 7 tidak menjalankan seed otomatis setelah reset).

## Perintah lain

`npm run lint` · `npm run test` · `npm run typecheck` · `npm run build` · `npm run format`

## Catatan

- Test server memakai database terpisah `<nama_db>_test` (dibuat & dimigrasi otomatis), jadi Postgres harus jalan saat `npm run test`. Bisa diganti dengan `TEST_DATABASE_URL`.

- `@sipita/shared` dikonsumsi langsung dari source TypeScript saat dev (export condition `source`); untuk produksi `npm run build` mengompilasi `shared` ke `dist` terlebih dahulu.
- Prisma Client di-generate ke `server/src/generated/prisma` (gitignored) — jalankan `npm run db:generate -w server` setelah install atau mengubah schema.
