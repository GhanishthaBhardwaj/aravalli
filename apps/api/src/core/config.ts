// Everything the server reads from the environment, in one place. Nothing else touches process.env.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbConfig, type DbConfig } from '../db/config';

export interface AppConfig {
  port: number;
  db: DbConfig;
  /** DEV ONLY (see core/context.ts): the organisation used when a request names none. Unset means the lowest organisation id. */
  devOrganisationId: number | null;
  nodeEnv: string;
}

/** Loads the repository's .env if there is one. Variables already in the environment win. */
export function loadEnvFile(): void {
  const file = join(fileURLToPath(new URL('../../../../', import.meta.url)), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function readAppConfig(env: Record<string, string | undefined>): AppConfig {
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`API_PORT must be a port number, got "${env.API_PORT}".`);
  const dev = env.DEV_ORGANISATION_ID ? Number(env.DEV_ORGANISATION_ID) : null;
  if (dev !== null && (!Number.isInteger(dev) || dev < 1)) throw new Error('DEV_ORGANISATION_ID must be a positive integer.');
  return { port, db: readDbConfig(env), devOrganisationId: dev, nodeEnv: env.NODE_ENV ?? 'development' };
}
