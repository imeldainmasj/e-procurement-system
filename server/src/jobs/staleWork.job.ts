import { dayjs } from '../lib/dayjs.js';
import { prisma } from '../lib/prisma.js';
import { findManagerIds, notifyUsers } from '../modules/notifications/notifications.service.js';
import { getSettings } from '../modules/settings/settings.service.js';
import { staleCutoff } from '../utils/procurementRules.js';

export interface StaleWorkResult {
  staleWorks: number;
  notifiedPics: number;
}

/** "WRK-2026-0001, WRK-2026-0002 dan 3 lainnya" */
function codeList(codes: string[], max = 5): string {
  if (codes.length <= max) return codes.join(', ');
  return `${codes.slice(0, max).join(', ')} dan ${codes.length - max} lainnya`;
}

/**
 * Working days (08:00): one notification per PIC listing their ACTIVE works not updated for
 * more than STALE_WORK_DAYS, and one summary per manager. Deduplicated per day, so a rerun
 * on the same day sends nothing.
 */
export async function runStaleWorkJob(now: Date = new Date()): Promise<StaleWorkResult> {
  const settings = await getSettings();
  const date = dayjs(now).tz().format('YYYY-MM-DD');
  const works = await prisma.work.findMany({
    where: { deletedAt: null, status: 'ACTIVE', lastUpdatedAt: { lt: staleCutoff(settings, now) } },
    select: { code: true, picId: true, pic: { select: { name: true } } },
    orderBy: { lastUpdatedAt: 'asc' },
  });
  if (works.length === 0) return { staleWorks: 0, notifiedPics: 0 };

  const byPic = new Map<string, { name: string; codes: string[] }>();
  for (const w of works) {
    const entry = byPic.get(w.picId) ?? { name: w.pic.name, codes: [] };
    entry.codes.push(w.code);
    byPic.set(w.picId, entry);
  }
  const days = settings.STALE_WORK_DAYS;

  const notifiedPics = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const [picId, { codes }] of byPic) {
      const { notified } = await notifyUsers(tx, [picId], {
        type: 'STALE_WORK',
        title: `${codes.length} pekerjaan belum di-update`,
        message: `Pekerjaan berikut belum di-update lebih dari ${days} hari: ${codeList(codes)}. Tulis update progres terbaru.`,
        link: '/pekerjaan/saya?stale=true',
        dedupeKey: `STALE_WORK:${date}`,
      });
      count += notified.length;
    }
    const perStaff = [...byPic.values()]
      .sort((a, b) => b.codes.length - a.codes.length)
      .map((p) => `${p.name} (${p.codes.length})`)
      .join(', ');
    await notifyUsers(tx, await findManagerIds(tx), {
      type: 'STALE_WORK_SUMMARY',
      title: `${works.length} pekerjaan tim belum di-update`,
      message: `Pekerjaan aktif yang belum di-update lebih dari ${days} hari: ${perStaff}.`,
      link: '/monitoring',
      dedupeKey: `STALE_WORK_SUMMARY:${date}`,
    });
    return count;
  });
  return { staleWorks: works.length, notifiedPics };
}
