import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
    logger.fatal(
      inUse
        ? `Port ${env.PORT} sudah dipakai proses lain. Hentikan server lama (mis. npm run dev yang masih jalan) lalu coba lagi.`
        : `Server gagal dijalankan: ${error.message}`,
    );
    process.exit(1);
  }
  logger.info(`SIPITA API berjalan di http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} diterima, menutup server...`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Force exit if connections do not close in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
