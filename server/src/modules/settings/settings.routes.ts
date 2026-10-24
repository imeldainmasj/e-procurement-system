import { Router } from 'express';
import { settingsInputSchema, type SettingsDto } from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import { getSettings, updateSettings } from './settings.service.js';

export const settingsRouter = Router();

// Readable by every signed-in user (e.g. the default PPN on the PO form); only Super Admin edits.
settingsRouter.get('/', async (_req, res) => {
  sendSuccess(res, await getSettings());
});

settingsRouter.put(
  '/',
  requireRole('SUPER_ADMIN'),
  validate({ body: settingsInputSchema }),
  async (req, res) => {
    sendSuccess(res, await updateSettings(req.body as SettingsDto, getActor(req)));
  },
);
