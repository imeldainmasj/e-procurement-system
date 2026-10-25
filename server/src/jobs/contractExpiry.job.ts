import { sendMailInBackground } from '../lib/mailer.js';
import { dayjs } from '../lib/dayjs.js';
import { prisma } from '../lib/prisma.js';
import { effectiveEnd } from '../modules/agreements/agreements.dto.js';
import { findManagerIds, notifyUsers } from '../modules/notifications/notifications.service.js';
import { getSettings } from '../modules/settings/settings.service.js';
import { agreementStatus, daysUntil, dueContractReminder } from '../utils/procurementRules.js';

export interface ContractExpiryResult {
  statusChanged: number;
  reminders: number;
}

/**
 * Daily (07:00): moves agreements to EXPIRING_SOON / EXPIRED and reminds the agreement PIC
 * and all managers at H-90/60/30 (CONTRACT_REMINDER_DAYS). Idempotent: every reminder
 * threshold is sent once per agreement, so reruns on the same day send nothing.
 */
export async function runContractExpiryJob(now: Date = new Date()): Promise<ContractExpiryResult> {
  const today = dayjs(now).tz().format('YYYY-MM-DD');
  const { CONTRACT_REMINDER_DAYS } = await getSettings();
  // Status only moves forward in time; extensions by addendum refresh it when recorded.
  const agreements = await prisma.agreement.findMany({
    where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
    select: {
      id: true,
      agreementNo: true,
      title: true,
      status: true,
      periodEnd: true,
      picId: true,
      vendor: { select: { name: true } },
      addendums: { where: { deletedAt: null }, select: { newPeriodEnd: true } },
    },
  });
  const managerIds = agreements.length > 0 ? await findManagerIds(prisma) : [];

  let statusChanged = 0;
  let reminders = 0;
  for (const a of agreements) {
    const end = effectiveEnd(a);
    const status = agreementStatus(end, today, CONTRACT_REMINDER_DAYS, a.status);
    const reminder = dueContractReminder(daysUntil(end, today), CONTRACT_REMINDER_DAYS);
    if (status === a.status && reminder === null) continue;

    const emails = await prisma.$transaction(async (tx) => {
      if (status !== a.status) {
        await tx.agreement.update({ where: { id: a.id }, data: { status } });
        statusChanged++;
      }
      if (reminder === null) return [];
      const daysLeft = daysUntil(end, today);
      const { notified, emails } = await notifyUsers(tx, [a.picId, ...managerIds], {
        type: 'CONTRACT_EXPIRING',
        title: `Kontrak berakhir dalam ${daysLeft} hari`,
        message: `Agreement ${a.agreementNo} (${a.title}) dengan ${a.vendor.name} berakhir pada ${dayjs(end).format('D MMMM YYYY')}. Rencanakan renewal atau perpanjangan.`,
        link: `/kontrak/${a.id}`,
        email: true,
        dedupeKey: `CONTRACT_EXPIRING:${a.id}:H-${reminder}`,
      });
      if (notified.length > 0) reminders++;
      return emails;
    });
    sendMailInBackground(emails);
  }
  return { statusChanged, reminders };
}
