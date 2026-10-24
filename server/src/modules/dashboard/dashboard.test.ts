import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoStatus, Role } from '@sipita/shared';
import { createApp } from '../../app.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();
const api = '/api/v1/dashboard';
const year = dayjs().tz().year();

let itDivision: string;
let opsDivision: string;
let requesterId: string;
let laptopId: string;
let vendorId: string;

async function headersFor(
  roles: Role[],
  divisionId = itDivision,
  approvalLevel: number | null = null,
) {
  const user = await createTestUser({ roles, divisionId, approvalLevel });
  return { id: user.id, headers: authHeader(user, roles) };
}

/**
 * A PR with one PO: `laptops` catalog laptops at Rp 10 jt + one free-text line of Rp 1 jt,
 * 11% PPN, ordered on `orderDate`.
 */
async function purchase(divisionId: string, orderDate: string, status: PoStatus, laptops = 1) {
  const pr = await prisma.purchaseRequest.create({
    data: {
      number: `PR-${crypto.randomUUID()}`,
      title: 'PR',
      justification: '-',
      neededDate: new Date(orderDate),
      status: status === 'CANCELLED' ? 'QUOTATION' : 'PO_ISSUED',
      submittedAt: dayjs.tz(orderDate).subtract(10, 'day').toDate(),
      requesterId,
      createdById: requesterId,
      divisionId,
    },
  });
  const quotation = await prisma.quotation.create({
    data: {
      prId: pr.id,
      vendorId,
      quoteNumber: 'Q',
      quoteDate: new Date(orderDate),
      totalAmount: 0,
      isSelected: true,
      createdById: requesterId,
    },
  });
  const subtotal = laptops * 10_000_000 + 1_000_000;
  await prisma.purchaseOrder.create({
    data: {
      number: `PO-${crypto.randomUUID()}`,
      prId: pr.id,
      vendorId,
      quotationId: quotation.id,
      orderDate: new Date(orderDate),
      subtotal,
      taxPercent: 11,
      taxAmount: subtotal * 0.11,
      total: subtotal * 1.11,
      status,
      issuedAt: dayjs.tz(orderDate).hour(12).toDate(),
      createdById: requesterId,
      items: {
        create: [
          {
            itemId: laptopId,
            name: 'Laptop',
            unit: 'unit',
            qty: laptops,
            unitPrice: 10_000_000,
            subtotal: laptops * 10_000_000,
          },
          {
            name: 'Jasa instalasi',
            unit: 'paket',
            qty: 1,
            unitPrice: 1_000_000,
            subtotal: 1_000_000,
          },
        ],
      },
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  itDivision = (await prisma.division.create({ data: { code: 'IT', name: 'IT' } })).id;
  opsDivision = (await prisma.division.create({ data: { code: 'OPS', name: 'Operasional' } })).id;
  requesterId = (await createTestUser({ roles: ['REQUESTER'], divisionId: opsDivision })).id;
  const category = await prisma.itemCategory.create({ data: { code: 'HW', name: 'Hardware' } });
  laptopId = (
    await prisma.item.create({
      data: { code: 'LPT', name: 'Laptop', unit: 'unit', categoryId: category.id },
    })
  ).id;
  vendorId = (
    await prisma.vendor.create({
      data: { code: 'V1', name: 'Vendor Satu', status: 'ACTIVE', createdById: requesterId },
    })
  ).id;
});
afterAll(() => prisma.$disconnect());

describe('dashboard', () => {
  it('groups committed spend (incl. PPN) by month, division and category, ignoring drafts and cancelled POs', async () => {
    await purchase(itDivision, `${year}-01-15`, 'CLOSED', 2); // 21 jt + PPN
    await purchase(opsDivision, `${year}-03-10`, 'ISSUED', 1); // 11 jt + PPN
    await purchase(opsDivision, `${year}-03-20`, 'DRAFT', 5);
    await purchase(opsDivision, `${year}-03-21`, 'CANCELLED', 5);
    const { headers } = await headersFor(['VIEWER']);

    const byMonth = (
      await request(app).get(`${api}/spending?groupBy=month&year=${year}`).set(headers)
    ).body.data;
    expect(byMonth.total).toBe('35520000.00');
    expect(byMonth.rows).toHaveLength(12);
    expect(byMonth.rows[0]).toMatchObject({
      label: 'Jan',
      amount: '23310000.00',
      purchaseOrders: 1,
    });
    expect(byMonth.rows[2]).toMatchObject({ label: 'Mar', amount: '12210000.00' });

    const byDivision = (
      await request(app).get(`${api}/spending?groupBy=division&year=${year}`).set(headers)
    ).body.data;
    expect(byDivision.rows.map((r: { label: string }) => r.label)).toEqual(['IT', 'Operasional']);

    const byCategory = (
      await request(app).get(`${api}/spending?groupBy=category&year=${year}`).set(headers)
    ).body.data;
    expect(byCategory.rows).toEqual([
      expect.objectContaining({ label: 'Hardware', amount: '33300000.00', purchaseOrders: 2 }),
      expect.objectContaining({ label: 'Lainnya (item manual)', amount: '2220000.00' }),
    ]);
  });

  it('reports lead time and vendor performance', async () => {
    await purchase(itDivision, `${year}-02-11`, 'RECEIVED');
    const { headers } = await headersFor(['PROCUREMENT']);
    const lead = (await request(app).get(`${api}/lead-time?year=${year}`).set(headers)).body.data;
    expect(lead.submitToPoDays).toBeCloseTo(10.1, 0);
    expect(lead.byMonth[1]).toMatchObject({ month: 'Feb', count: 1 });

    const vendors = (await request(app).get(`${api}/vendor-performance?year=${year}`).set(headers))
      .body.data;
    expect(vendors).toEqual([
      expect.objectContaining({
        vendor: expect.objectContaining({ code: 'V1' }),
        purchaseOrders: 1,
        rating: null,
      }),
    ]);
  });

  it('scopes the summary by role and keeps analytics from requesters', async () => {
    await purchase(opsDivision, dayjs().tz().format('YYYY-MM-DD'), 'ISSUED');
    const viewer = await headersFor(['VIEWER']);
    const summary = (await request(app).get(`${api}/summary`).set(viewer.headers)).body.data;
    expect(summary).toMatchObject({
      scope: 'all',
      activePrs: 1,
      openPurchaseOrders: 1,
      pendingMyApprovals: null,
    });
    expect(summary.spending.thisMonth).toBe('12210000.00');

    const requester = await headersFor(['REQUESTER']);
    const own = (await request(app).get(`${api}/summary`).set(requester.headers)).body.data;
    expect(own).toMatchObject({ scope: 'own', activePrs: 0, spending: null, recentPrs: [] });
    expect((await request(app).get(`${api}/spending`).set(requester.headers)).status).toBe(403);

    const approver = await headersFor(['APPROVER'], itDivision, 1);
    expect(
      (await request(app).get(`${api}/summary`).set(approver.headers)).body.data.pendingMyApprovals,
    ).toBe(0);
  });
});
