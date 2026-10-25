import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { runContractExpiryJob } from './contractExpiry.job.js';
import { runStaleWorkJob } from './staleWork.job.js';

const JOBS = [
  // 07:00 every day: agreement status + H-90/60/30 reminders.
  { name: 'contract-expiry', cron: '0 7 * * *', run: runContractExpiryJob, onStartup: true },
  // 08:00 Monday–Friday: works not updated for STALE_WORK_DAYS.
  { name: 'stale-work', cron: '0 8 * * 1-5', run: runStaleWorkJob, onStartup: false },
] as const;

const tasks: ScheduledTask[] = [];

async function execute(name: string, run: () => Promise<object>): Promise<void> {
  const started = Date.now();
  try {
    const result = await run();
    logger.info({ job: name, ms: Date.now() - started, ...result }, `Job ${name} selesai`);
  } catch (err) {
    logger.error({ err, job: name }, `Job ${name} gagal`);
  }
}

/**
 * Schedules the daily jobs (CLAUDE.md §11) in Asia/Jakarta. The contract job also runs once at
 * startup so statuses are current after downtime; it is idempotent, so this sends nothing twice.
 */
export function startJobs(): void {
  for (const job of JOBS) {
    tasks.push(
      cron.schedule(job.cron, () => execute(job.name, () => job.run()), {
        name: job.name,
        timezone: env.TZ,
        noOverlap: true,
      }),
    );
    if (job.onStartup) void execute(job.name, () => job.run());
  }
  logger.info(`Job terjadwal aktif: ${JOBS.map((j) => `${j.name} (${j.cron})`).join(', ')}`);
}

export async function stopJobs(): Promise<void> {
  await Promise.all(tasks.splice(0).map((t) => t.stop()));
}
