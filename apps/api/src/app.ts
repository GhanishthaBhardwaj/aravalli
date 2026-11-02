import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { Clock } from '@aravalli/shared';
import { devContext } from './core/context';
import { one, type Pool } from './core/db';
import { errorHandler, notFoundHandler } from './core/errors';
import { buildRegistry } from './routes';

export interface AppOptions {
  pool: Pool;
  clock: Clock;
  /** DEV ONLY: the organisation used when a request names none (see core/context.ts). */
  defaultOrganisationId?: number | null;
}

export function createApp({ pool, clock, defaultOrganisationId = null }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const registry = buildRegistry({ pool, clock });
  const spec = registry.openapi({
    title: 'Aravalli API',
    version: '2.0.0',
    description:
      'Enterprise risk and incident management. Every request is scoped to one organisation. ' +
      'Until Phase 3 adds login, the organisation and the acting employee come from the DEV-ONLY headers X-Organisation-Id and X-Actor-Id. ' +
      'Errors always look like { "error": { "code", "message", "details" } }.',
  });

  // Health and docs need no organisation, so they sit before the context middleware.
  app.get('/api/health', async (_req, res) => {
    try {
      await one(pool, 'SELECT 1 AS ok');
      res.json({ status: 'ok', database: 'up', time: clock.now() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', time: clock.now() });
    }
  });
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Aravalli API' }));

  app.use('/api', devContext(pool, defaultOrganisationId), registry.router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
