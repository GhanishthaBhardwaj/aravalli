// Email through Nodemailer. In development the "transport" prints the message to the server log (so links can be clicked from
// the terminal); with SMTP_URL set it sends for real. Tests read `outbox` instead of parsing a log.
import nodemailer from 'nodemailer';
import type { AuthConfig } from '../core/config';

export interface Mail { to: string; subject: string; text: string }

export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** The messages sent through this mailer (kept in memory, newest last; capped). */
  readonly outbox: Mail[];
}

export function createMailer(config: AuthConfig['mail']): Mailer {
  const outbox: Mail[] = [];
  const transport = config.mode === 'smtp' ? nodemailer.createTransport(config.smtpUrl!) : null;
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
      if (outbox.length > 200) outbox.shift();
      if (transport) {
        await transport.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text });
      } else if (process.env.NODE_ENV !== 'test') {
        console.log(`\n--- email (console transport) -------------------------\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n--------------------------------------------------------\n`);
      }
    },
  };
}
