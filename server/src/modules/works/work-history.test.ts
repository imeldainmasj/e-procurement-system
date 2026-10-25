import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestUser,
  resetDatabase,
  seedMilestoneTemplates,
} from '../../test/db.js';
import { diffSnapshots } from './work-history.js';

const app = createApp();
const M = 1_000_000;

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
});
afterAll(() => prisma.$disconnect());

const body = (picId: string, over: Record<string, unknown> = {}) => ({
  title: 'Renewal Entra ID P1',
  procurementType: 'RENEWAL_LICENSE',
  category: 'BAU',
  method: 'BIDDING',
  procurementYear: 2026,
  picId,
  amount: 100 * M,
  ...over,
});

interface HistoryItem {
  kind: 'UPDATE' | 'AUDIT';
  entity?: string;
  action?: string;
  subject?: string | null;
  user?: { name: string } | null;
  changes?: { field: string; label: string; before: string | null; after: string | null }[];
  update?: { note: string };
}

describe('GET /works/:id/history', () => {
  it('merges progress notes with audit entries of the work and its documents', async () => {
    const staff = await createTestUser({ name: 'Andi' });
    const other = await createTestUser({ name: 'Dewi' });
    const manager = await createTestUser({ name: 'Hendra', jobLevel: 'MANAGER_L1' });
    const headers = authHeader(staff);
    const api = (h: Record<string, string>) => ({
      post: (path: string, b: object) => request(app).post(`/api/v1${path}`).set(h).send(b),
      patch: (path: string, b: object) => request(app).patch(`/api/v1${path}`).set(h).send(b),
    });

    const created = await api(headers).post('/works', body(staff.id));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const work = created.body.data as { id: string; milestones: { id: string; type: string }[] };
    // Another work must not leak into this history.
    await api(headers).post('/works', body(staff.id, { title: 'Lain' }));

    const memoId = work.milestones.find((m) => m.type === 'MEMO')!.id;
    await api(headers).patch(`/works/${work.id}/milestones/${memoId}`, {
      status: 'IN_PROGRESS',
      note: 'Draft memo disusun',
    });
    const memo = await api(headers).post(`/works/${work.id}/memos`, {
      memoNo: 'MEMO/IT/2026/001',
      memoType: 'MEMO_PROCUREMENT',
      title: 'Memo pengajuan',
      memoDate: '2026-02-12',
      requesterName: 'Andi',
    });
    expect(memo.status, JSON.stringify(memo.body)).toBe(201);
    const edited = await api(headers).patch(`/works/${work.id}`, {
      ...body(staff.id, { title: 'Renewal Entra ID P1 2026', amount: 120 * M }),
      status: 'ACTIVE',
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    await api(authHeader(manager)).post(`/works/${work.id}/reassign`, {
      picId: other.id,
      note: 'Andi cuti',
    });

    const res = await request(app).get(`/api/v1/works/${work.id}/history`).set(headers);
    expect(res.status).toBe(200);
    const items = res.body.data as HistoryItem[];

    const reassign = items[0]!;
    expect(reassign).toMatchObject({ kind: 'AUDIT', action: 'REASSIGN', user: { name: 'Hendra' } });
    expect(reassign.changes).toEqual(
      expect.arrayContaining([{ field: 'pic', label: 'PIC', before: 'Andi', after: 'Dewi' }]),
    );

    const update = items.find((i) => i.entity === 'Work' && i.action === 'UPDATE')!;
    expect(update.changes).toEqual([
      {
        field: 'title',
        label: 'Judul',
        before: 'Renewal Entra ID P1',
        after: 'Renewal Entra ID P1 2026',
      },
      { field: 'amount', label: 'Nilai', before: '100.000.000', after: '120.000.000' },
      { field: 'amountIdr', label: 'Nilai (IDR)', before: '100.000.000', after: '120.000.000' },
    ]);

    expect(items.find((i) => i.entity === 'Memo')).toMatchObject({
      action: 'CREATE',
      subject: 'MEMO/IT/2026/001',
    });
    expect(items.find((i) => i.entity === 'WorkMilestone')).toMatchObject({
      action: 'STATUS_CHANGE',
      subject: 'Memo',
      changes: [{ field: 'status', label: 'Status', before: 'Belum Mulai', after: 'Berjalan' }],
    });
    expect(items.filter((i) => i.kind === 'UPDATE').map((i) => i.update!.note)).toContain(
      'Draft memo disusun',
    );
    expect(items.filter((i) => i.entity === 'Work' && i.action === 'CREATE')).toHaveLength(1);
    expect(res.body.meta.total).toBe(items.length);
  });

  it('returns 404 for an unknown work', async () => {
    const staff = await createTestUser();
    const res = await request(app)
      .get(`/api/v1/works/${crypto.randomUUID()}/history`)
      .set(authHeader(staff));
    expect(res.status).toBe(404);
  });
});

describe('diffSnapshots', () => {
  it('compares labelled fields across snapshot shapes', () => {
    // Import rows store Decimals as strings and ids; app DTOs store numbers and refs.
    expect(
      diffSnapshots(
        'Work',
        { amount: '100.00', status: 'ACTIVE', pic: { id: 'a', name: 'Andi' }, updatedAt: 'x' },
        { amount: 100, status: 'ON_HOLD', pic: { id: 'b', name: 'Dewi' }, updatedAt: 'y' },
      ),
    ).toEqual([
      { field: 'status', label: 'Status', before: 'Aktif', after: 'Ditunda' },
      { field: 'pic', label: 'PIC', before: 'Andi', after: 'Dewi' },
    ]);
  });

  it('only compares fields present in a partial snapshot and formats dates', () => {
    expect(
      diffSnapshots(
        'WorkMilestone',
        { status: 'IN_PROGRESS', notes: 'lama', completedAt: null },
        { status: 'DONE', completedAt: '2026-03-01T00:00:00.000Z' },
      ),
    ).toEqual([
      { field: 'status', label: 'Status', before: 'Berjalan', after: 'Selesai' },
      { field: 'completedAt', label: 'Selesai', before: null, after: '1 Mar 2026' },
    ]);
  });
});
