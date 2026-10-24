import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sipita/shared';
import { createApp } from '../../app.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createAdmin,
  createTestUser,
  resetDatabase,
  seedDefaultApprovalRules,
} from '../../test/db.js';

const app = createApp();
type Headers = Record<string, string>;
const today = () => dayjs().tz().format('YYYY-MM-DD');
const PDF_MAGIC = '%PDF';

let divisionId: string;
let laptopId: string;
let users: Record<
  'requester' | 'warehouse' | 'procurement' | 'l1' | 'viewer',
  { id: string; headers: Headers }
>;
let vendors: Record<'a' | 'b' | 'c' | 'review' | 'blacklisted', string>;

async function makeUser(roles: Role[], approvalLevel: number | null = null) {
  const user = await createTestUser({ roles, approvalLevel, divisionId });
  return { id: user.id, headers: authHeader(user, roles) };
}

async function makeVendor(code: string, status: 'ACTIVE' | 'UNDER_REVIEW' | 'BLACKLISTED') {
  const vendor = await prisma.vendor.create({
    data: { code, name: `Vendor ${code}`, status, createdById: users.procurement.id },
  });
  return vendor.id;
}

/**
 * An approved PR: 2 laptops (catalog) + 3 HDMI cables (free text), estimated Rp 8.300.000,
 * approved by level 1 only.
 */
async function approvedPr() {
  const created = await request(app)
    .post('/api/v1/purchase-requests')
    .set(users.requester.headers)
    .send({
      title: 'Laptop staf baru',
      justification: 'Staf baru',
      neededDate: dayjs().tz().add(10, 'day').format('YYYY-MM-DD'),
      items: [
        { itemId: laptopId, qty: 2, estimatedUnitPrice: 4_000_000 },
        { freeTextName: 'Kabel HDMI', unit: 'pcs', qty: 3, estimatedUnitPrice: 100_000 },
      ],
    })
    .expect(201);
  const id = created.body.data.id as string;
  const pr = (path: string, headers: Headers, body?: object) =>
    request(app)
      .post(`/api/v1/purchase-requests/${id}/${path}`)
      .set(headers)
      .send(body)
      .expect(200);
  await pr('submit', users.requester.headers);
  await pr('start-stock-check', users.warehouse.headers);
  const checked = await pr('stock-check', users.warehouse.headers, { available: false });
  const step = checked.body.data.memo.steps[0];
  await request(app)
    .post(`/api/v1/approvals/${step.id}/approve`)
    .set(users.l1.headers)
    .send({})
    .expect(200);
  const detail = await request(app)
    .get(`/api/v1/purchase-requests/${id}`)
    .set(users.requester.headers);
  expect(detail.body.data.status).toBe('APPROVED');
  const items = detail.body.data.items as { id: string }[];
  return { id, laptopItemId: items[0]!.id, cableItemId: items[1]!.id };
}

type Pr = Awaited<ReturnType<typeof approvedPr>>;

const quote = (pr: Pr, vendorId: string, laptop: number, cable: number, extra: object = {}) => ({
  prId: pr.id,
  vendorId,
  quoteNumber: `Q-${vendorId.slice(0, 4)}`,
  quoteDate: today(),
  validUntil: dayjs().tz().add(30, 'day').format('YYYY-MM-DD'),
  deliveryDays: 7,
  items: [
    { prItemId: pr.laptopItemId, unitPrice: laptop },
    { prItemId: pr.cableItemId, unitPrice: cable },
  ],
  ...extra,
});

const addQuote = async (body: object, headers = users.procurement.headers) =>
  request(app).post('/api/v1/quotations').set(headers).send(body);
const select = (id: string, justification?: string) =>
  request(app)
    .post(`/api/v1/quotations/${id}/select`)
    .set(users.procurement.headers)
    .send(justification ? { justification } : {});
const comparison = async (prId: string, headers = users.procurement.headers) =>
  (await request(app).get(`/api/v1/quotations/by-pr/${prId}`).set(headers)).body.data;
const prStatus = async (id: string) =>
  (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } })).status;
const poPayload = (quotationId: string, extra: object = {}) => ({
  quotationId,
  orderDate: today(),
  expectedDate: dayjs().tz().add(7, 'day').format('YYYY-MM-DD'),
  taxPercent: 11,
  ...extra,
});

/** Three quotations with A cheapest (Rp 7.950.000), selected; returns their ids. */
async function threeQuotesWithWinner(pr: Pr) {
  const a = (await addQuote(quote(pr, vendors.a, 3_900_000, 50_000))).body.data.id as string;
  const b = (await addQuote(quote(pr, vendors.b, 4_100_000, 60_000))).body.data.id as string;
  const c = (await addQuote(quote(pr, vendors.c, 4_000_000, 90_000))).body.data.id as string;
  await select(a).expect(200);
  return { a, b, c };
}

beforeEach(async () => {
  await resetDatabase();
  await seedDefaultApprovalRules();
  divisionId = (await prisma.division.create({ data: { code: 'IT', name: 'IT' } })).id;
  const category = await prisma.itemCategory.create({ data: { code: 'HW', name: 'Hardware' } });
  laptopId = (
    await prisma.item.create({
      data: { code: 'LPT', name: 'Laptop', unit: 'unit', isAsset: true, categoryId: category.id },
    })
  ).id;
  users = {
    requester: await makeUser(['REQUESTER']),
    warehouse: await makeUser(['WAREHOUSE']),
    procurement: await makeUser(['PROCUREMENT']),
    l1: await makeUser(['APPROVER'], 1),
    viewer: await makeUser(['VIEWER']),
  };
  vendors = {
    a: await makeVendor('A', 'ACTIVE'),
    b: await makeVendor('B', 'ACTIVE'),
    c: await makeVendor('C', 'ACTIVE'),
    review: await makeVendor('R', 'UNDER_REVIEW'),
    blacklisted: await makeVendor('X', 'BLACKLISTED'),
  };
});
afterAll(() => prisma.$disconnect());

describe('quotations', () => {
  it('moves the PR to QUOTATION, prices with PR quantities and records catalog prices', async () => {
    const pr = await approvedPr();
    const res = await addQuote(quote(pr, vendors.a, 3_900_000, 50_000));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totalAmount: '7950000.00', isSelected: false });
    expect(res.body.data.items.map((i: { qty: number }) => i.qty)).toEqual([2, 3]);
    expect(await prStatus(pr.id)).toBe('QUOTATION');

    // Only the catalog laptop has a price history row.
    const history = await prisma.priceHistory.findMany();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ itemId: laptopId, sourceType: 'QUOTATION' });

    const cmp = await comparison(pr.id, users.viewer.headers);
    expect(cmp).toMatchObject({ minQuotations: 3, approvedAmount: '8300000.00', editable: true });
    expect(cmp.quotations).toHaveLength(1);
  });

  it('validates vendor, duplicates, item coverage and roles', async () => {
    const pr = await approvedPr();
    expect((await addQuote(quote(pr, vendors.blacklisted, 1, 1))).status).toBe(400);
    expect((await addQuote(quote(pr, vendors.a, 1, 1))).status).toBe(201);
    expect((await addQuote(quote(pr, vendors.a, 2, 2))).status).toBe(409);
    const missing = quote(pr, vendors.b, 1, 1);
    missing.items = missing.items.slice(0, 1);
    expect((await addQuote(missing)).status).toBe(400);
    expect((await addQuote(quote(pr, vendors.b, 1, 1), users.viewer.headers)).status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/quotations/by-pr/${pr.id}`).set(users.requester.headers))
        .status,
    ).toBe(403);
  });

  it('rejects quotations for PRs that are not approved yet', async () => {
    const draft = await request(app)
      .post('/api/v1/purchase-requests')
      .set(users.requester.headers)
      .send({
        title: 'Draft',
        justification: 'x',
        neededDate: dayjs().tz().add(3, 'day').format('YYYY-MM-DD'),
        items: [{ freeTextName: 'Barang', unit: 'unit', qty: 1, estimatedUnitPrice: 1000 }],
      });
    const id = draft.body.data.id as string;
    await request(app).post(`/api/v1/purchase-requests/${id}/submit`).set(users.requester.headers);
    const items = (await prisma.purchaseRequestItem.findMany({ where: { prId: id } })).map((i) => ({
      prItemId: i.id,
      unitPrice: 1000,
    }));
    const res = await addQuote({
      ...quote({ id, laptopItemId: '', cableItemId: '' }, vendors.a, 0, 0),
      items,
    });
    expect(res.status).toBe(409);
  });
});

describe('selecting the winner', () => {
  it('requires a justification for too few quotations, a non-cheapest winner or going over budget', async () => {
    const pr = await approvedPr();
    const cheap = (await addQuote(quote(pr, vendors.a, 3_900_000, 50_000))).body.data.id;
    const pricey = (await addQuote(quote(pr, vendors.b, 4_200_000, 50_000))).body.data.id;

    const few = await select(cheap);
    expect(few.status).toBe(400);
    expect(few.body.error.details[0].path).toBe('justification');
    expect(few.body.error.message).toContain('kurang dari minimum');

    await addQuote(quote(pr, vendors.c, 4_000_000, 50_000));
    expect((await select(cheap)).status).toBe(200);

    const notCheapest = await select(pricey);
    expect(notCheapest.status).toBe(400);
    expect(notCheapest.body.error.message).toContain('bukan yang termurah');
    // Rp 8.550.000 is also above the approved Rp 8.300.000.
    expect(notCheapest.body.error.message).toContain('melebihi');

    const ok = await select(pricey, 'Garansi on-site 3 tahun');
    expect(ok.status).toBe(200);
    const cmp = await comparison(pr.id);
    const selected = cmp.quotations.filter((q: { isSelected: boolean }) => q.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: pricey,
      selectionJustification: 'Garansi on-site 3 tahun',
    });
  });

  it('lets vendors under review quote but not win, and locks the winner from edits', async () => {
    const pr = await approvedPr();
    const { a } = await threeQuotesWithWinner(pr);
    const review = (await addQuote(quote(pr, vendors.review, 1_000_000, 10_000))).body.data.id;
    expect((await select(review, 'Termurah')).body.error.code).toBe('VENDOR_NOT_ACTIVE');

    const edit = await request(app)
      .put(`/api/v1/quotations/${a}`)
      .set(users.procurement.headers)
      .send(quote(pr, vendors.a, 1, 1));
    expect(edit.status).toBe(409);
    expect(
      (await request(app).delete(`/api/v1/quotations/${a}`).set(users.procurement.headers)).status,
    ).toBe(409);

    await request(app)
      .post(`/api/v1/quotations/${a}/unselect`)
      .set(users.procurement.headers)
      .expect(200);
    await request(app).delete(`/api/v1/quotations/${a}`).set(users.procurement.headers).expect(200);
    expect(await prisma.priceHistory.count({ where: { sourceId: a } })).toBe(0);
  });

  it('refuses expired quotations', async () => {
    const pr = await approvedPr();
    const old = quote(pr, vendors.a, 3_900_000, 50_000, {
      quoteDate: dayjs().tz().subtract(60, 'day').format('YYYY-MM-DD'),
      validUntil: dayjs().tz().subtract(1, 'day').format('YYYY-MM-DD'),
    });
    const id = (await addQuote(old)).body.data.id;
    expect((await select(id, 'x')).body.error.code).toBe('QUOTATION_EXPIRED');
  });
});

describe('purchase orders', () => {
  it('creates a draft from the winner only, with PPN, and locks the quotations', async () => {
    const pr = await approvedPr();
    const { a, b } = await threeQuotesWithWinner(pr);

    const fromLoser = await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(b));
    expect(fromLoser.body.error.code).toBe('QUOTATION_NOT_SELECTED');

    const res = await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(a));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'DRAFT',
      subtotal: '7950000.00',
      taxPercent: '11.00',
      taxAmount: '874500.00',
      total: '8824500.00',
    });
    expect(res.body.data.number).toMatch(/^PO-IT\/\d{4}\/\d{2}\/0001$/);
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual([
      'Laptop',
      'Kabel HDMI',
    ]);
    expect(await prStatus(pr.id)).toBe('QUOTATION');

    const again = await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(a));
    expect(again.body.error.code).toBe('PO_EXISTS');
    expect((await select(b, 'ganti')).body.error.code).toBe('PO_EXISTS');
    expect((await comparison(pr.id)).editable).toBe(false);

    const updated = await request(app)
      .put(`/api/v1/purchase-orders/${res.body.data.id}`)
      .set(users.procurement.headers)
      .send({ orderDate: today(), taxPercent: 0 });
    expect(updated.body.data).toMatchObject({ taxAmount: '0.00', total: '7950000.00' });
  });

  it('issues the PO: PR → PO_ISSUED, PO prices recorded, requester and warehouse notified', async () => {
    const pr = await approvedPr();
    const { a } = await threeQuotesWithWinner(pr);
    const po = (
      await request(app)
        .post('/api/v1/purchase-orders')
        .set(users.procurement.headers)
        .send(poPayload(a))
    ).body.data;

    const issued = await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/issue`)
      .set(users.procurement.headers);
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('ISSUED');
    expect(await prStatus(pr.id)).toBe('PO_ISSUED');
    expect(await prisma.priceHistory.count({ where: { sourceType: 'PO' } })).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: users.requester.id, type: 'PR_PO_ISSUED' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: users.warehouse.id, type: 'PO_INCOMING' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { entity: 'PurchaseOrder', action: 'STATUS_CHANGE' } }),
    ).toBe(1);

    const prDetail = await request(app)
      .get(`/api/v1/purchase-requests/${pr.id}`)
      .set(users.requester.headers);
    expect(prDetail.body.data.purchaseOrder).toMatchObject({ number: po.number, status: 'ISSUED' });

    // Issued POs can no longer be edited, and warehouse can read them.
    const edit = await request(app)
      .put(`/api/v1/purchase-orders/${po.id}`)
      .set(users.procurement.headers)
      .send({ orderDate: today(), taxPercent: 11 });
    expect(edit.status).toBe(409);
    expect(
      (await request(app).get(`/api/v1/purchase-orders/${po.id}`).set(users.warehouse.headers))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/purchase-orders/${po.id}`).set(users.requester.headers))
        .status,
    ).toBe(403);

    const pdf = await request(app)
      .get(`/api/v1/purchase-orders/${po.id}/pdf`)
      .set(users.procurement.headers)
      .buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe(PDF_MAGIC);
  });

  it('cancelling an issued PO sends the PR back to QUOTATION so a new PO can be made', async () => {
    const pr = await approvedPr();
    const { a, b } = await threeQuotesWithWinner(pr);
    const po = (
      await request(app)
        .post('/api/v1/purchase-orders')
        .set(users.procurement.headers)
        .send(poPayload(a))
    ).body.data;
    await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/issue`)
      .set(users.procurement.headers)
      .expect(200);

    const noReason = await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/cancel`)
      .set(users.procurement.headers)
      .send({});
    expect(noReason.status).toBe(400);
    await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/cancel`)
      .set(users.procurement.headers)
      .send({ reason: 'Vendor tidak sanggup memenuhi jadwal' })
      .expect(200);
    expect(await prStatus(pr.id)).toBe('QUOTATION');
    expect(await prisma.priceHistory.count({ where: { sourceType: 'PO' } })).toBe(0);

    await select(b, 'Vendor A gagal memenuhi PO').expect(200);
    const second = await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(b));
    expect(second.status).toBe(201);
    expect(second.body.data.number).toMatch(/0002$/);
  });

  it('cancelling the PR cancels its draft PO', async () => {
    const pr = await approvedPr();
    const { a } = await threeQuotesWithWinner(pr);
    const po = (
      await request(app)
        .post('/api/v1/purchase-orders')
        .set(users.procurement.headers)
        .send(poPayload(a))
    ).body.data;
    await request(app)
      .post(`/api/v1/purchase-requests/${pr.id}/cancel`)
      .set(users.procurement.headers)
      .send({ reason: 'Anggaran dialihkan' })
      .expect(200);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe(
      'CANCELLED',
    );
  });

  it('rates the vendor once, after goods arrive', async () => {
    const pr = await approvedPr();
    const { a } = await threeQuotesWithWinner(pr);
    const po = (
      await request(app)
        .post('/api/v1/purchase-orders')
        .set(users.procurement.headers)
        .send(poPayload(a))
    ).body.data;
    await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/issue`)
      .set(users.procurement.headers)
      .expect(200);
    const rating = { onTime: 5, quality: 4, price: 4, service: 3, notes: 'Pengiriman cepat' };

    const early = await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/rating`)
      .set(users.procurement.headers)
      .send(rating);
    expect(early.status).toBe(409);

    // Goods receipts arrive in stage 8; simulate the received status here.
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED' } });
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${po.id}/rating`)
      .set(users.procurement.headers)
      .send(rating);
    expect(res.status).toBe(200);
    expect(res.body.data.rating).toMatchObject({ average: 4, notes: 'Pengiriman cepat' });
    expect(
      (
        await request(app)
          .post(`/api/v1/purchase-orders/${po.id}/rating`)
          .set(users.procurement.headers)
          .send(rating)
      ).status,
    ).toBe(409);

    const vendor = await request(app)
      .get(`/api/v1/vendors/${vendors.a}`)
      .set(users.procurement.headers);
    expect(vendor.body.data.ratingSummary).toMatchObject({ count: 1, overall: 4 });
  });

  it('blocks deleting a vendor with an open PO', async () => {
    const pr = await approvedPr();
    const { a } = await threeQuotesWithWinner(pr);
    await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(a))
      .expect(201);
    const res = await request(app)
      .delete(`/api/v1/vendors/${vendors.a}`)
      .set(users.procurement.headers);
    expect(res.status).toBe(409);
  });
});

describe('price history', () => {
  it('lists prices with source references and summarizes per vendor', async () => {
    const pr = await approvedPr();
    await threeQuotesWithWinner(pr);
    const list = await request(app)
      .get(`/api/v1/price-history?itemId=${laptopId}&sort=unitPrice:asc`)
      .set(users.viewer.headers);
    expect(list.body.meta.total).toBe(3);
    expect(list.body.data[0]).toMatchObject({
      unitPrice: '3900000.00',
      sourceNumber: 'Q-' + vendors.a.slice(0, 4),
      sourceLink: `/penawaran/${pr.id}`,
    });

    const summary = await request(app)
      .get(`/api/v1/price-history/items/${laptopId}/summary`)
      .set(users.viewer.headers);
    expect(summary.body.data.stats).toMatchObject({
      count: 3,
      min: '3900000.00',
      max: '4100000.00',
      avg: '4000000.00',
    });
    expect(
      summary.body.data.byVendor.map((v: { vendor: { code: string } }) => v.vendor.code),
    ).toEqual(['A', 'C', 'B']);
    expect(summary.body.data.points).toHaveLength(3);
  });
});

describe('settings', () => {
  it('uses saved values for the minimum quotations and PO defaults', async () => {
    const { headers } = await createAdmin();
    const current = (await request(app).get('/api/v1/settings').set(users.procurement.headers)).body
      .data;
    expect(current).toMatchObject({ PO_DEFAULT_TAX_PERCENT: 11, MIN_QUOTATIONS: 3 });

    expect(
      (await request(app).put('/api/v1/settings').set(users.procurement.headers).send(current))
        .status,
    ).toBe(403);
    const saved = await request(app)
      .put('/api/v1/settings')
      .set(headers)
      .send({ ...current, MIN_QUOTATIONS: 1, COMPANY_ADDRESS: 'Gedung A Lt. 5' });
    expect(saved.status).toBe(200);

    const pr = await approvedPr();
    const id = (await addQuote(quote(pr, vendors.a, 3_900_000, 50_000))).body.data.id;
    expect((await select(id)).status).toBe(200);
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set(users.procurement.headers)
      .send(poPayload(id));
    expect(po.body.data.deliveryAddress).toBe('Gedung A Lt. 5');
  });
});
