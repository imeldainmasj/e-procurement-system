import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    })
  : null;

/** Sends one email; without SMTP configuration the email is only logged (development). */
export async function sendMail(email: Email): Promise<void> {
  if (!transporter) {
    logger.info(
      { to: email.to, subject: email.subject },
      'Email tidak dikirim (SMTP belum dikonfigurasi)',
    );
    return;
  }
  await transporter.sendMail({ from: env.MAIL_FROM, ...email });
}

/** Fire-and-forget delivery after a transaction commits; failures are logged, never thrown. */
export function sendMailInBackground(emails: Email[]): void {
  for (const email of emails) {
    sendMail(email).catch((err: unknown) =>
      logger.error({ err, to: email.to }, 'Gagal mengirim email'),
    );
  }
}
