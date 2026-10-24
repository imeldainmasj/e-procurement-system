import type { AgreementOptionDto } from '@sipita/shared';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Agreements that can be extended by a Perpanjangan Khusus: not terminated and still
 * running today. The exact "active on the Memo PK date" check happens on the memo.
 */
export async function options(search: string | undefined): Promise<AgreementOptionDto[]> {
  const today = new Date(dayjs().tz().format('YYYY-MM-DD'));
  const rows = await prisma.agreement.findMany({
    where: {
      deletedAt: null,
      status: { not: 'TERMINATED' },
      periodEnd: { gte: today },
      ...(search && {
        OR: [
          { agreementNo: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { vendor: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    },
    select: {
      id: true,
      agreementNo: true,
      title: true,
      periodEnd: true,
      vendor: { select: { name: true } },
    },
    orderBy: { periodEnd: 'asc' },
    take: 50,
  });
  return rows.map((a) => ({
    id: a.id,
    agreementNo: a.agreementNo,
    title: a.title,
    vendorName: a.vendor.name,
    periodEnd: dayjs(a.periodEnd).format('YYYY-MM-DD'),
  }));
}
