// THE ONE PLACE a request's organisation and actor come from.
//
// Every repository query takes organisationId from this object and nowhere else.
//
// DEV ONLY, until Phase 3 adds login: the organisation and the acting employee are read from two request headers
// (X-Organisation-Id, X-Actor-Id). Anyone can send any value, so this is NOT security. Phase 3 replaces
// `devContext` with middleware that reads them from a verified session, and nothing else has to change.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from './db';
import { one } from './db';
import { AppError } from './errors';

export interface RequestContext {
  organisationId: number;
  /** The employee performing the request; null for anonymous reads. */
  actorId: number | null;
  /** Where the values came from, so a log line or a test can tell. */
  source: 'dev-header' | 'dev-default';
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx: RequestContext;
  }
}

const positiveInt = (raw: unknown): number | null => {
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
};

export function devContext(pool: Pool, defaultOrganisationId: number | null): RequestHandler {
  let cachedDefault: number | null = defaultOrganisationId;
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const headerOrg = req.header('x-organisation-id');
      let organisationId = positiveInt(headerOrg);
      if (headerOrg !== undefined && organisationId === null) throw new AppError('validation_error', 'X-Organisation-Id must be a positive integer.');
      const fromHeader = organisationId !== null;
      if (organisationId === null) {
        if (cachedDefault === null) {
          const first = await one<{ organisation_id: number }>(pool, 'SELECT organisation_id FROM organisation ORDER BY organisation_id LIMIT 1');
          if (!first) throw new AppError('organisation_not_found', 'There are no organisations yet. Run npm run db:seed.');
          cachedDefault = first.organisation_id;
        }
        organisationId = cachedDefault;
      }
      const exists = await one(pool, 'SELECT 1 AS ok FROM organisation WHERE organisation_id = ?', [organisationId]);
      if (!exists) throw new AppError('organisation_not_found', 'That organisation does not exist.');

      const headerActor = req.header('x-actor-id');
      const actorId = positiveInt(headerActor);
      if (headerActor !== undefined && actorId === null) throw new AppError('validation_error', 'X-Actor-Id must be a positive integer.');
      req.ctx = { organisationId, actorId, source: fromHeader ? 'dev-header' : 'dev-default' };
      next();
    } catch (error) {
      next(error);
    }
  };
}
