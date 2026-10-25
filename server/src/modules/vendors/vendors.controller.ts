import type { RequestHandler } from 'express';
import type { IdParam, VendorPayload, vendorListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { exportPage, sendXlsx } from '../../utils/export.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './vendors.service.js';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.params as IdParam).id;

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await service.list(
    req.query as unknown as z.output<typeof vendorListQuerySchema>,
  );
  sendSuccess(res, data, meta);
};

/** Excel export of the vendor list with the same search and sort. */
export const exportList: RequestHandler = async (req, res) => {
  const q = req.query as unknown as z.output<typeof vendorListQuerySchema>;
  const { data } = await service.list({ ...q, ...exportPage });
  await sendXlsx(res, 'vendor', {
    title: 'Daftar Vendor',
    filters: [],
    tables: [
      {
        columns: [
          { key: 'code', label: 'Kode', width: 12 },
          { key: 'name', label: 'Nama', width: 32 },
          { key: 'npwp', label: 'NPWP', width: 22 },
          { key: 'picName', label: 'PIC Vendor', width: 22 },
          { key: 'email', label: 'Email', width: 26 },
          { key: 'phone', label: 'Telepon', width: 16 },
          { key: 'address', label: 'Alamat', width: 40 },
          { key: 'workCount', label: 'Pekerjaan', kind: 'int', width: 10 },
          { key: 'agreementCount', label: 'Kontrak', kind: 'int', width: 10 },
        ],
        rows: data.map((v) => ({
          code: v.code,
          name: v.name,
          npwp: v.npwp,
          picName: v.picName,
          email: v.email,
          phone: v.phone,
          address: v.address,
          workCount: v.workCount,
          agreementCount: v.agreementCount,
        })),
      },
    ],
  });
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.get(idOf(req)));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.create(req.body as VendorPayload, getActor(req)), undefined, 201);
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.update(idOf(req), req.body as VendorPayload, getActor(req)));
};

export const remove: RequestHandler = async (req, res) => {
  await service.remove(idOf(req), getActor(req));
  sendSuccess(res, null);
};
