import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  settingsInputSchema,
  type SettingsDto,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';

const ENTITY = 'AppSetting';

/** Saved values over the shared defaults; a stored value that no longer validates falls back too. */
export async function getSettings(db: TxClient = prisma): Promise<SettingsDto> {
  const rows = await db.appSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of rows) merged[row.key] = row.value;
  const parsed = settingsInputSchema.safeParse(merged);
  return parsed.success ? parsed.data : settingsInputSchema.parse(SETTING_DEFAULTS);
}

export async function updateSettings(input: SettingsDto, actor: Actor): Promise<SettingsDto> {
  const before = await getSettings();
  await prisma.$transaction(async (tx) => {
    for (const key of SETTING_KEYS) {
      const value = (input[key] ?? null) as Prisma.InputJsonValue;
      await tx.appSetting.upsert({
        where: { key },
        update: { value, updatedById: actor.userId },
        create: { key, value, updatedById: actor.userId },
      });
    }
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: 'global',
      before,
      after: input,
    });
  });
  return getSettings();
}
