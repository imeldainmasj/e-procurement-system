import type { AuditAction } from '@sipita/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../utils/actor.js';
import type { TxClient } from './prisma.js';

interface AuditEntry {
  actor: Actor;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Plain JSON copy (Dates → ISO strings, Decimals → strings). */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Call inside the same transaction as the change it records. */
export async function writeAuditLog(db: TxClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.actor.userId,
      ip: entry.actor.ip,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
