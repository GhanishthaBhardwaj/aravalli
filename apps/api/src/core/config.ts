// Everything the server reads from the environment, in one place. Nothing else touches process.env.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbConfig, type DbConfig } from '../db/config';

export interface AuthConfig {
  /** Signs the short-lived access tokens. Required in production; in development a random one is made per start. */
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  /** The refresh cookie carries the Secure flag unless this is switched off (never in production). */
  cookieSecure: boolean;
  /** Where links in emails point (the web app). */
  appUrl: string;
  /** Demo login buttons: only on when DEMO_LOGINS=true. */
  demoLogins: boolean;
  /** 'console' prints emails to the server log; 'smtp' sends them through SMTP_URL. */
  mail: { mode: 'console' | 'smtp'; smtpUrl: string | null; from: string };
  /** Attempts per window per address for login and for password-reset endpoints. */
  rateLimit: { windowMs: number; loginMax: number; resetMax: number };
  invitationTtlDays: number;
}

export interface AppConfig {
  port: number;
  db: DbConfig;
  nodeEnv: string;
  auth: AuthConfig;
}

/** Loads the repository's .env if there is one. Variables already in the environment win. */
export function loadEnvFile(): void {
  const file = join(fileURLToPath(new URL('../../../../', import.meta.url)), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const int = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive whole number, got "${raw}".`);
  return n;
};

export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const secret = env.JWT_SECRET;
  if (production && (!secret || secret.length < 32)) throw new Error('JWT_SECRET (at least 32 characters) is required in production.');
  if (secret !== undefined && secret !== '' && secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  const mode = env.MAIL_MODE ?? (env.SMTP_URL ? 'smtp' : 'console');
  if (mode !== 'console' && mode !== 'smtp') throw new Error('MAIL_MODE must be "console" or "smtp".');
  if (mode === 'smtp' && !env.SMTP_URL) throw new Error('MAIL_MODE=smtp needs SMTP_URL.');
  if (production && env.DEMO_LOGINS === 'true') console.warn('WARNING: DEMO_LOGINS=true in production lets anyone sign in as a demo user.');
  return {
    jwtSecret: secret || randomBytes(32).toString('hex'),
    accessTtlSeconds: int(env.ACCESS_TOKEN_SECONDS, 900, 'ACCESS_TOKEN_SECONDS'),
    refreshTtlDays: int(env.REFRESH_TOKEN_DAYS, 30, 'REFRESH_TOKEN_DAYS'),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE !== 'false' : true,
    appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    demoLogins: env.DEMO_LOGINS === 'true',
    mail: { mode, smtpUrl: env.SMTP_URL ?? null, from: env.MAIL_FROM ?? 'Aravalli <no-reply@aravalli.example>' },
    rateLimit: { windowMs: int(env.RATE_LIMIT_WINDOW_SECONDS, 900, 'RATE_LIMIT_WINDOW_SECONDS') * 1000, loginMax: int(env.RATE_LIMIT_LOGIN, 10, 'RATE_LIMIT_LOGIN'), resetMax: int(env.RATE_LIMIT_RESET, 5, 'RATE_LIMIT_RESET') },
    invitationTtlDays: int(env.INVITATION_DAYS, 7, 'INVITATION_DAYS'),
  };
}

export function readAppConfig(env: Record<string, string | undefined>): AppConfig {
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`API_PORT must be a port number, got "${env.API_PORT}".`);
  return { port, db: readDbConfig(env), nodeEnv: env.NODE_ENV ?? 'development', auth: readAuthConfig(env) };
}
