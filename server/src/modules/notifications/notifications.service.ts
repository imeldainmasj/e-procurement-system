import {
  MANAGER_LEVELS,
  type NotificationDto,
  type notificationListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import type { Email } from '../../lib/mailer.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  /** Client route, e.g. /pekerjaan/:id */
  link?: string;
  /** Also email the recipients (delivered after the transaction commits). */
  email?: boolean;
  /**
   * Makes the call idempotent (scheduled jobs): stored per recipient as `<dedupeKey>:<userId>`,
   * and recipients who already have it get neither a notification nor an email.
   */
  dedupeKey?: string;
}

const activeUser = { deletedAt: null, isActive: true } as const;

/**
 * Creates in-app notifications inside `tx`. Returns the users actually notified and the emails
 * to send once the transaction has committed (see `sendMailInBackground`).
 */
export async function notifyUsers(
  tx: TxClient,
  userIds: string[],
  payload: NotificationPayload,
): Promise<{ notified: string[]; emails: Email[] }> {
  let ids = [...new Set(userIds)];
  const keyOf = (userId: string) => (payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : null);
  if (payload.dedupeKey && ids.length > 0) {
    const sent = await tx.notification.findMany({
      where: { dedupeKey: { in: ids.map((id) => keyOf(id)!) } },
      select: { userId: true },
    });
    const done = new Set(sent.map((n) => n.userId));
    ids = ids.filter((id) => !done.has(id));
  }
  if (ids.length === 0) return { notified: [], emails: [] };

  await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link ?? null,
      dedupeKey: keyOf(userId),
    })),
    skipDuplicates: true,
  });

  if (!payload.email) return { notified: ids, emails: [] };
  const users = await tx.user.findMany({
    where: { id: { in: ids }, ...activeUser },
    select: { email: true },
  });
  const url = payload.link ? `\n\nBuka: ${env.CLIENT_URL}${payload.link}` : '';
  return {
    notified: ids,
    emails: users.map((u) => ({
      to: u.email,
      subject: `[SIPITA] ${payload.title}`,
      text: `${payload.message}${url}`,
    })),
  };
}

/** Active managers (MANAGER_L1 / MANAGER_L2), e.g. for contract and stale-work summaries. */
export async function findManagerIds(tx: TxClient): Promise<string[]> {
  const users = await tx.user.findMany({
    where: { ...activeUser, jobLevel: { in: [...MANAGER_LEVELS] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ─── Inbox API ───────────────────────────────────────────────────────────────

type ListQuery = z.output<typeof notificationListQuerySchema>;

function toDto(n: {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}): NotificationDto {
  return { ...n, createdAt: iso(n.createdAt) };
}

export async function list(userId: string, q: ListQuery) {
  const where = { userId, ...(q.unreadOnly && { isRead: false }) };
  const [rows, total] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.notification.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (count === 0) throw AppError.notFound('Notifikasi tidak ditemukan');
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return count;
}
