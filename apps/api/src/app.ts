import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Clock } from '@aravalli/shared';
import { createMailer, type Mailer } from './auth/mailer';
import { authenticate } from './core/context';
import type { AuthConfig } from './core/config';
import { one, type Pool } from './core/db';
import { errorHandler, notFoundHandler } from './core/errors';
import { buildRegistry } from './routes';
import { createLimiters } from './routes/auth';

export interface AppOptions {
  pool: Pool;
  clock: Clock;
  auth: AuthConfig;
  /** Defaults to a mailer built from the auth config. Tests pass their own to read what was sent. */
  mailer?: Mailer;
  /** Milliseconds since the epoch; tests move it to check expiry. */
  nowMs?: () => number;
}

export function createApp({ pool, clock, auth, mailer = createMailer(auth.mail), nowMs = Date.now }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  const registry = buildRegistry({ pool, clock, auth, mailer, nowMs }, authenticate(pool, auth.jwtSecret), createLimiters(auth.rateLimit));
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
  app.use(helmet());
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
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
