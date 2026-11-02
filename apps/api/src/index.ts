// API entry point:  npm run dev -w @aravalli/api   (or  npm run dev  from the repository root, which also starts the web app)
import { systemClock } from '@aravalli/shared';
import { createApp } from './app';
import { loadEnvFile, readAppConfig } from './core/config';
import { createPool } from './core/db';

loadEnvFile();
const config = readAppConfig(process.env);
const pool = createPool(config.db);
const app = createApp({ pool, clock: systemClock, defaultOrganisationId: config.devOrganisationId });

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Aravalli API  http://127.0.0.1:${config.port}   docs: http://127.0.0.1:${config.port}/api/docs`);
  console.log('DEV MODE: organisation and actor come from request headers, not from a login (Phase 3).');
});

// Graceful shutdown: stop taking requests, let running ones finish, then close the pool.
let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
