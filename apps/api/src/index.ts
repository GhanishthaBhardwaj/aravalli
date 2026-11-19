// API entry point:  npm run dev -w @aravalli/api   (or  npm run dev  from the repository root, which also starts the web app)
import { systemClock } from '@aravalli/shared';
import { createApp } from './app';
import { loadEnvFile, readAppConfig } from './core/config';
import { createPool } from './core/db';

loadEnvFile();
const config = readAppConfig(process.env);
const pool = createPool(config.db);
const app = createApp({ pool, clock: systemClock, auth: config.auth, serveWeb: config.nodeEnv === 'production' });

const server = app.listen(config.port, config.host, () => {
  console.log(`Aravalli API  http://${config.host}:${config.port}   docs: http://${config.host}:${config.port}/api/docs`);
  if (config.nodeEnv === 'production') console.log('Production mode: this server also serves the built web app (apps/web/dist).');
  if (config.auth.demoLogins) console.log('Demo logins are ON (DEMO_LOGINS=true): anyone who can reach this server can sign in as a demo user.');
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
