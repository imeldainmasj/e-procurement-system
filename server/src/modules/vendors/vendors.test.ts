import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sipita/shared';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();
const api = '/api/v1/vendors';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

let headers: Record<string, string>;
let hardwareId: string;
let networkId: string;

const as = async (roles: Role[]) => authHeader(await createTestUser({ roles }), roles);
const vendorPayload = (overrides: Record<string, unknown> = {}) => ({
  code: 'vnd-001',
  name: 'PT Sinar Komputer',
  npwp: '01.234.567.8-901.000',
  email: 'sales@sinar.co.id',
  phone: '021-5551234',
  city: 'Jakarta',
  picName: 'Budi',
  categoryIds: [hardwareId],
  ...overrides,
});
const createVendor = async (overrides: Record<string, unknown> = {}) =>
  (await request(app).post(api).set(headers).send(vendorPayload(overrides)).expect(201)).body
    .data as { id: string };

const upload = (
  vendorId: string,
  file: Buffer,
  name: string,
  mime: string,
  fields: Record<string, string> = {},
) => {
  const req = request(app).post(`${api}/${vendorId}/documents`).set(headers);
  for (const [k, v] of Object.entries({ type: 'SIUP', ...fields })) req.field(k, v);
  return req.attach('file', file, { filename: name, contentType: mime });
};

/** Minimal received PO (PR → quotation → PO) for rating fixtures. */
async function receivedPo(vendorId: string, userId: string): Promise<string> {
  const division = await prisma.division.upsert({
    where: { code: 'IT' },
    update: {},
    create: { code: 'IT', name: 'IT' },
  });
  const pr = await prisma.purchaseRequest.create({
    data: {
      title: 'PR rating',
      justification: '-',
      neededDate: new Date(),
      status: 'RECEIVED',
      requesterId: userId,
      createdById: userId,
      divisionId: division.id,
    },
  });
  const quotation = await prisma.quotation.create({
    data: {
      prId: pr.id,
      vendorId,
      quoteNumber: 'Q',
      quoteDate: new Date(),
      totalAmount: 0,
      isSelected: true,
      createdById: userId,
    },
  });
  const po = await prisma.purchaseOrder.create({
    data: {
      number: `PO-${crypto.randomUUID()}`,
      prId: pr.id,
      vendorId,
      quotationId: quotation.id,
      orderDate: new Date(),
      subtotal: 0,
      taxPercent: 0,
      taxAmount: 0,
      total: 0,
      status: 'RECEIVED',
      createdById: userId,
    },
  });
  return po.id;
}

beforeEach(async () => {
  await resetDatabase();
  headers = await as(['PROCUREMENT']);
  hardwareId = (await prisma.itemCategory.create({ data: { code: 'HW', name: 'Hardware' } })).id;
  networkId = (await prisma.itemCategory.create({ data: { code: 'NET', name: 'Jaringan' } })).id;
});
afterAll(() => prisma.$disconnect());

describe('vendors API', () => {
  it('creates a vendor UNDER_REVIEW with normalized fields and categories', async () => {
    const res = await request(app)
      .post(api)
      .set(headers)
      .send(vendorPayload({ categoryIds: [hardwareId, networkId] }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      code: 'VND-001',
      npwp: '012345678901000',
      status: 'UNDER_REVIEW',
      rating: { overall: null, count: 0 },
      documents: [],
    });
    expect(res.body.data.categories.map((c: { name: string }) => c.name)).toEqual([
      'Hardware',
      'Jaringan',
    ]);
  });

  it('enforces roles: viewers read, only procurement writes, requesters are denied', async () => {
    await createVendor();
    const viewer = await as(['VIEWER']);
    expect((await request(app).get(api).set(viewer)).status).toBe(200);
    expect(
      (
        await request(app)
          .post(api)
          .set(viewer)
          .send(vendorPayload({ code: 'X' }))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(api)
          .set(await as(['REQUESTER']))
      ).status,
    ).toBe(403);
  });

  it('rejects duplicate code and NPWP', async () => {
    await createVendor();
    expect(
      (
        await request(app)
          .post(api)
          .set(headers)
          .send(vendorPayload({ npwp: null }))
      ).status,
    ).toBe(409);
    const dupNpwp = await request(app)
      .post(api)
      .set(headers)
      .send(vendorPayload({ code: 'VND-002' }));
    expect(dupNpwp.status).toBe(409);
    expect(dupNpwp.body.error.message).toContain('NPWP');
  });

  it('filters by status, category and search', async () => {
    await createVendor();
    await createVendor({
      code: 'VND-002',
      name: 'CV Jaringan Prima',
      npwp: null,
      categoryIds: [networkId],
    });

    const byCategory = await request(app).get(`${api}?categoryId=${networkId}`).set(headers);
    expect(byCategory.body.data.map((v: { code: string }) => v.code)).toEqual(['VND-002']);
    expect((await request(app).get(`${api}?search=sinar`).set(headers)).body.meta.total).toBe(1);
    expect((await request(app).get(`${api}?status=ACTIVE`).set(headers)).body.meta.total).toBe(0);
  });

  it('changes status with a mandatory blacklist reason and audits it', async () => {
    const v = await createVendor();
    const noReason = await request(app)
      .post(`${api}/${v.id}/status`)
      .set(headers)
      .send({ status: 'BLACKLISTED' });
    expect(noReason.status).toBe(400);

    const res = await request(app)
      .post(`${api}/${v.id}/status`)
      .set(headers)
      .send({ status: 'BLACKLISTED', reason: 'Barang tidak sesuai spesifikasi' });
    expect(res.body.data).toMatchObject({
      status: 'BLACKLISTED',
      statusReason: 'Barang tidak sesuai spesifikasi',
    });

    const same = await request(app)
      .post(`${api}/${v.id}/status`)
      .set(headers)
      .send({ status: 'BLACKLISTED', reason: 'x' });
    expect(same.status).toBe(400);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: v.id, action: 'STATUS_CHANGE' },
    });
    expect(audit?.after).toMatchObject({ status: 'BLACKLISTED' });
  });

  it('soft-deletes vendors', async () => {
    const v = await createVendor();
    await request(app).delete(`${api}/${v.id}`).set(headers).expect(200);
    expect((await request(app).get(`${api}/${v.id}`).set(headers)).status).toBe(404);
    expect(await prisma.vendor.count()).toBe(1);
  });

  it('summarizes ratings per aspect', async () => {
    const v = await createVendor();
    const rater = await createTestUser({ roles: ['PROCUREMENT'] });
    const [po1, po2] = [await receivedPo(v.id, rater.id), await receivedPo(v.id, rater.id)];
    await prisma.vendorRating.createMany({
      data: [
        {
          vendorId: v.id,
          poId: po1,
          onTime: 5,
          quality: 4,
          price: 3,
          service: 4,
          ratedById: rater.id,
        },
        {
          vendorId: v.id,
          poId: po2,
          onTime: 3,
          quality: 4,
          price: 5,
          service: 4,
          ratedById: rater.id,
        },
      ],
    });
    const res = await request(app).get(`${api}/${v.id}`).set(headers);
    expect(res.body.data.ratingSummary).toEqual({
      count: 2,
      overall: 4,
      onTime: 4,
      quality: 4,
      price: 4,
      service: 4,
    });
    const ratings = await request(app).get(`${api}/${v.id}/ratings`).set(headers);
    expect(ratings.body.data).toHaveLength(2);
    expect(ratings.body.data[0].average).toBe(4);
  });
});

describe('vendor documents', () => {
  it('uploads a PDF, flags expiry, downloads it with auth and deletes it with the file', async () => {
    const v = await createVendor();
    const soon = dayjs().tz().add(10, 'day').format('YYYY-MM-DD');
    const res = await upload(v.id, PDF, 'SIUP Sinar.pdf', 'application/pdf', {
      number: '503/123',
      expiresAt: soon,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'SIUP',
      number: '503/123',
      expiresAt: soon,
      expiryState: 'expiring',
      attachment: { fileName: 'SIUP Sinar.pdf', mimeType: 'application/pdf', size: PDF.length },
    });

    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: res.body.data.attachment.id },
    });
    expect(stored.path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    const absolute = path.join(path.resolve(env.UPLOAD_DIR), stored.path);
    expect(existsSync(absolute)).toBe(true);

    const list = await request(app).get(api).set(headers);
    expect(list.body.data[0].documentAlerts).toEqual({ expired: 0, expiring: 1 });

    const download = await request(app)
      .get(`/api/v1/attachments/${stored.id}/download`)
      .set(headers);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''SIUP%20Sinar.pdf");
    expect(
      Buffer.from(download.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    const requester = await as(['REQUESTER']);
    expect(
      (await request(app).get(`/api/v1/attachments/${stored.id}/download`).set(requester)).status,
    ).toBe(404);

    await request(app)
      .delete(`${api}/${v.id}/documents/${res.body.data.id}`)
      .set(headers)
      .expect(200);
    expect(existsSync(absolute)).toBe(false);
    expect(await prisma.attachment.count()).toBe(0);
  });

  it('rejects disallowed types, spoofed content, oversized files and missing files', async () => {
    const v = await createVendor();
    const exe = await upload(v.id, Buffer.from('MZ...'), 'setup.exe', 'application/x-msdownload');
    expect(exe.body.error.code).toBe('INVALID_FILE_TYPE');

    const spoofed = await upload(
      v.id,
      Buffer.from('MZ not really a pdf'),
      'siup.pdf',
      'application/pdf',
    );
    expect(spoofed.body.error.code).toBe('INVALID_FILE_CONTENT');

    const big = Buffer.concat([PDF, Buffer.alloc(env.MAX_UPLOAD_MB * 1024 * 1024)]);
    const tooLarge = await upload(v.id, big, 'besar.pdf', 'application/pdf');
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe('FILE_TOO_LARGE');

    const noFile = await request(app)
      .post(`${api}/${v.id}/documents`)
      .set(headers)
      .field('type', 'NIB');
    expect(noFile.status).toBe(400);

    const badType = await upload(v.id, PDF, 'x.pdf', 'application/pdf', { type: 'KTP' });
    expect(badType.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.attachment.count()).toBe(0);
  });
});
