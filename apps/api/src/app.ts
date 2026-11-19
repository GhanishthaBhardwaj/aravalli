import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Clock } from '@aravalli/shared';
import { authenticate } from './core/context';
import type { AuthConfig } from './core/config';
import { one, type Pool } from './core/db';
import { errorHandler, notFoundHandler } from './core/errors';
import { buildRegistry } from './routes';
import { createLimiters } from './routes/auth';
import { securityHeaders, serveWebApp, webDist } from './webapp';

export interface AppOptions {
  pool: Pool;
  clock: Clock;
  auth: AuthConfig;
  /** Milliseconds since the epoch; tests move it to check expiry. */
  nowMs?: () => number;
  /** Production: also serve the built web app (apps/web/dist) and fall back to index.html for app routes. */
  serveWeb?: boolean;
}

export function createApp({ pool, clock, auth, nowMs = Date.now, serveWeb = false }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting proxy (Render) the real client address and the https scheme arrive in X-Forwarded-* headers from ONE proxy.
  // Without this, every visitor looks like the proxy to the rate limiter, and secure cookies are not recognised as secure.
  app.set('trust proxy', 1);

  const registry = buildRegistry({ pool, clock, auth, nowMs }, authenticate(pool, auth.jwtSecret), createLimiters(auth.rateLimit));
  const spec = registry.openapi({
    title: 'Aravalli API',
    version: '3.0.0',
    description:
      'Enterprise risk and incident management. Sign in with POST /api/auth/login (or sign up); send the returned access token as "Authorization: Bearer ...". ' +
      'The organisation and role come from the session, never from the request, and another organisation\'s records answer 404. ' +
      'Errors always look like { "error": { "code", "message", "details" } }.',
  });

  // Swagger UI uses inline scripts, so the docs page gets a relaxed content-security policy of its own; everything else gets helmet's defaults.
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Aravalli API' }));
  app.use(securityHeaders(serveWeb ? webDist : undefined));
  app.get('/api/health', async (_req, res) => {
    try {
      await one(pool, 'SELECT 1 AS ok');
      res.json({ status: 'ok', database: 'up', time: clock.now() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', time: clock.now() });
    }
  });
  app.get('/api/openapi.json', (_req, res) => res.json(spec));

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', registry.router);
  if (serveWeb) serveWebApp(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
