import { Router, type Request, type RequestHandler } from 'express';
import {
  docParamsSchema,
  idParamSchema,
  memoInputSchema,
  paymentTermInputSchema,
  poInputSchema,
  pvpApprovalInputSchema,
  pvpInputSchema,
  rfqInputSchema,
  termParamsSchema,
  type MemoPayload,
  type PaymentTermPayload,
  type PoPayload,
  type PvpApprovalPayload,
  type PvpPayload,
  type RfqPayload,
} from '@sipita/shared';
import type { z } from 'zod';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './documents.service.js';

/**
 * Procurement documents of one work (CLAUDE.md §8). Recording or changing a document is
 * an update of the work (WORK:update); removing one needs WORK:delete. Ownership and the
 * blocking rules are checked in the service.
 */
export const documentsRouter = Router();

const canView = requirePermission('WORK', 'view');
const canWrite = requirePermission('WORK', 'update');
const canDelete = requirePermission('WORK', 'delete');

type Params = { id: string; docId: string; termId: string };
const p = (req: Request) => req.params as Params;

/** Validates params + body and sends the service result (201 for POST). */
function write<B>(
  params: z.ZodType,
  body: z.ZodType<B> | null,
  run: (req: Request, input: B) => Promise<unknown>,
): RequestHandler[] {
  return [
    validate(body ? { params, body } : { params }),
    async (req, res) => {
      const data = await run(req, req.body as B);
      sendSuccess(res, data ?? null, undefined, req.method === 'POST' ? 201 : 200);
    },
  ];
}

documentsRouter.get(
  '/:id/documents',
  canView,
  validate({ params: idParamSchema }),
  async (req, res) => {
    sendSuccess(res, await service.getDocuments(p(req).id, getActor(req)));
  },
);

// Memo & MoA
documentsRouter.post(
  '/:id/memos',
  canWrite,
  ...write<MemoPayload>(idParamSchema, memoInputSchema, (req, input) =>
    service.createMemo(p(req).id, input, getActor(req)),
  ),
);
documentsRouter.put(
  '/:id/memos/:docId',
  canWrite,
  ...write<MemoPayload>(docParamsSchema, memoInputSchema, (req, input) =>
    service.updateMemo(p(req).id, p(req).docId, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/memos/:docId',
  canDelete,
  ...write(docParamsSchema, null, (req) =>
    service.deleteMemo(p(req).id, p(req).docId, getActor(req)),
  ),
);

// RFQ & LoA (one per work)
documentsRouter.put(
  '/:id/rfq',
  canWrite,
  ...write<RfqPayload>(idParamSchema, rfqInputSchema, (req, input) =>
    service.saveRfq(p(req).id, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/rfq',
  canDelete,
  ...write(idParamSchema, null, (req) => service.deleteRfq(p(req).id, getActor(req))),
);

// PVP Forum (one per work) + director approvals
documentsRouter.put(
  '/:id/pvp',
  canWrite,
  ...write<PvpPayload>(idParamSchema, pvpInputSchema, (req, input) =>
    service.savePvp(p(req).id, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/pvp',
  canDelete,
  ...write(idParamSchema, null, (req) => service.deletePvp(p(req).id, getActor(req))),
);
documentsRouter.post(
  '/:id/pvp/approvals',
  canWrite,
  ...write<PvpApprovalPayload>(idParamSchema, pvpApprovalInputSchema, (req, input) =>
    service.addPvpApproval(p(req).id, input, getActor(req)),
  ),
);
documentsRouter.put(
  '/:id/pvp/approvals/:docId',
  canWrite,
  ...write<PvpApprovalPayload>(docParamsSchema, pvpApprovalInputSchema, (req, input) =>
    service.updatePvpApproval(p(req).id, p(req).docId, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/pvp/approvals/:docId',
  canDelete,
  ...write(docParamsSchema, null, (req) =>
    service.deletePvpApproval(p(req).id, p(req).docId, getActor(req)),
  ),
);

// Purchase orders + term of payment
documentsRouter.post(
  '/:id/purchase-orders',
  canWrite,
  ...write<PoPayload>(idParamSchema, poInputSchema, (req, input) =>
    service.createPo(p(req).id, input, getActor(req)),
  ),
);
documentsRouter.put(
  '/:id/purchase-orders/:docId',
  canWrite,
  ...write<PoPayload>(docParamsSchema, poInputSchema, (req, input) =>
    service.updatePo(p(req).id, p(req).docId, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/purchase-orders/:docId',
  canDelete,
  ...write(docParamsSchema, null, (req) =>
    service.deletePo(p(req).id, p(req).docId, getActor(req)),
  ),
);
documentsRouter.post(
  '/:id/purchase-orders/:docId/payment-terms',
  canWrite,
  ...write<PaymentTermPayload>(docParamsSchema, paymentTermInputSchema, (req, input) =>
    service.addPaymentTerm(p(req).id, p(req).docId, input, getActor(req)),
  ),
);
documentsRouter.put(
  '/:id/purchase-orders/:docId/payment-terms/:termId',
  canWrite,
  ...write<PaymentTermPayload>(termParamsSchema, paymentTermInputSchema, (req, input) =>
    service.updatePaymentTerm(p(req).id, p(req).docId, p(req).termId, input, getActor(req)),
  ),
);
documentsRouter.delete(
  '/:id/purchase-orders/:docId/payment-terms/:termId',
  canDelete,
  ...write(termParamsSchema, null, (req) =>
    service.deletePaymentTerm(p(req).id, p(req).docId, p(req).termId, getActor(req)),
  ),
);
