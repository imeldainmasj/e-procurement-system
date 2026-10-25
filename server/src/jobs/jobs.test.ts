import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { createTestUser, resetDatabase } from '../test/db.js';
import { runContractExpiryJob } from './contractExpiry.job.js';
import { runStaleWorkJob } from './staleWork.job.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const NOW = new Date('2026-10-25T01:00:00Z'); // 08:00 Asia/Jakarta
const day = (offset: number) => new Date(Date.UTC(2026, 9, 25 + offset));

let seq = 0;
async function work(
  picId: string,
  data: { status?: 'ACTIVE' | 'COMPLETED'; lastUpdatedAt?: Date } = {},
) {
  seq++;
  return prisma.work.create({
    data: {
      code: `WRK-2026-${String(seq).padStart(4, '0')}`,
      title: `Pekerjaan ${seq}`,
      procurementType: 'RENEWAL_LICENSE',
      category: 'BAU',
      method: 'BIDDING',
      procurementYear: 2026,
      picId,
      amount: 100,
      amountIdr: 100,
      status: data.status ?? 'ACTIVE',
      lastUpdatedAt: data.lastUpdatedAt ?? NOW,
    },
  });
}

async function agreement(
  picId: string,
  periodEnd: Date,
  status: 'ACTIVE' | 'EXPIRING_SOON' = 'ACTIVE',
) {
  const w = await work(picId, { status: 'COMPLETED' });
  const vendor = await prisma.vendor.create({ data: { code: `V${seq}`, name: `Vendor ${seq}` } });
  const po = await prisma.purchaseOrder.create({
    data: {
      workId: w.id,
      poNo: `PO-${seq}`,
      poType: 'RENEWAL',
      poName: 'PO',
      poDate: day(-300),
      amount: 100,
      amountIdr: 100,
      requesterName: 'Peminta',
    },
  });
  return prisma.agreement.create({
    data: {
      agreementNo: `AGR-${seq}`,
      agreementType: 'RENEWAL',
      title: `Lisensi ${seq}`,
      vendorId: vendor.id,
      poId: po.id,
      workId: w.id,
      picId,
      periodStart: day(-300),
      periodEnd,
      amount: 100,
      amountIdr: 100,
      status,
    },
  });
}

describe('contract expiry job', () => {
  it('updates status and reminds the PIC and managers once per threshold', async () => {
    const pic = await createTestUser();
    const manager = await createTestUser({ jobLevel: 'MANAGER_L1' });
    const other = await createTestUser();
    const soon = await agreement(pic.id, day(30));
    const far = await agreement(pic.id, day(200));
    const ended = await agreement(pic.id, day(-1), 'EXPIRING_SOON');

    expect(await runContractExpiryJob(NOW)).toEqual({ statusChanged: 2, reminders: 1 });
    const statuses = await prisma.agreement.findMany({ select: { id: true, status: true } });
    const statusOf = (id: string) => statuses.find((s) => s.id === id)?.status;
    expect(statusOf(soon.id)).toBe('EXPIRING_SOON');
    expect(statusOf(far.id)).toBe('ACTIVE');
    expect(statusOf(ended.id)).toBe('EXPIRED');

    const notes = await prisma.notification.findMany({ where: { type: 'CONTRACT_EXPIRING' } });
    expect(notes.map((n) => n.userId).sort()).toEqual([pic.id, manager.id].sort());
    expect(notes[0]!.link).toBe(`/kontrak/${soon.id}`);
    expect(notes.every((n) => n.userId !== other.id)).toBe(true);

    // Same day again: nothing new.
    expect(await runContractExpiryJob(NOW)).toEqual({ statusChanged: 0, reminders: 0 });
    expect(await prisma.notification.count()).toBe(2);
  });

  it('sends a missed threshold once and the next one when it is reached', async () => {
    const pic = await createTestUser();
    await agreement(pic.id, day(75)); // H-90 passed while the server was down
    await runContractExpiryJob(NOW);
    await runContractExpiryJob(new Date(NOW.getTime() + 86_400_000)); // H-74: still H-90
    expect(await prisma.notification.count()).toBe(1);
    await runContractExpiryJob(new Date(NOW.getTime() + 15 * 86_400_000)); // H-60
    expect(await prisma.notification.count()).toBe(2);
  });

  it('uses the end date extended by an addendum', async () => {
    const pic = await createTestUser();
    const a = await agreement(pic.id, day(10));
    await prisma.addendum.create({
      data: {
        agreementId: a.id,
        workId: a.workId,
        addendumNo: 'ADD-1',
        title: 'Perpanjangan',
        addendumDate: day(-5),
        newPeriodEnd: day(365),
      },
    });
    await runContractExpiryJob(NOW);
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('stale work job', () => {
  it('notifies each PIC once a day and sends managers one summary', async () => {
    const andi = await createTestUser({ name: 'Andi' });
    const budi = await createTestUser({ name: 'Budi' });
    const manager = await createTestUser({ jobLevel: 'MANAGER_L2' });
    const old = day(-10);
    await work(andi.id, { lastUpdatedAt: old });
    await work(andi.id, { lastUpdatedAt: old });
    await work(andi.id); // fresh
    await work(budi.id, { lastUpdatedAt: old, status: 'COMPLETED' }); // not active

    expect(await runStaleWorkJob(NOW)).toEqual({ staleWorks: 2, notifiedPics: 1 });
    const notes = await prisma.notification.findMany({ orderBy: { type: 'asc' } });
    expect(notes.map((n) => [n.type, n.userId])).toEqual([
      ['STALE_WORK', andi.id],
      ['STALE_WORK_SUMMARY', manager.id],
    ]);
    expect(notes[0]!.title).toBe('2 pekerjaan belum di-update');
    expect(notes[1]!.message).toContain('Andi (2)');

    expect(await runStaleWorkJob(NOW)).toEqual({ staleWorks: 2, notifiedPics: 0 });
    expect(await prisma.notification.count()).toBe(2);
    // Next working day: reminded again.
    await runStaleWorkJob(new Date(NOW.getTime() + 86_400_000));
    expect(await prisma.notification.count()).toBe(4);
  });
});
