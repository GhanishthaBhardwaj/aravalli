// Small helpers shared by every controller: async error forwarding, pagination and the response envelopes.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from './errors';

/** Express 4 does not forward rejected promises; this does. */
export const handle = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

/** limit / offset pagination. See docs/api.md for why this and not cursors. */
export const pagingQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe(`Rows per page, 1 to ${MAX_LIMIT}.`),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0).describe('Rows to skip.'),
};

export interface Page<T> {
  data: T[];
  page: { limit: number; offset: number; total: number };
}

export const sendPage = <T>(res: Response, data: T[], limit: number, offset: number, total: number): void => {
  res.json({ data, page: { limit, offset, total } } satisfies Page<T>);
};

export const sendData = <T>(res: Response, data: T, status = 200): void => {
  res.status(status).json({ data });
};

export const idParam = (req: Request, name = 'id'): number => {
  const raw = req.params[name];
  if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) throw new AppError('validation_error', `${name} must be a positive integer.`);
  return Number(raw);
};

/** `?a=x,y` means a list. */
export const csvList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v), z.array(item).max(20));

/** Booleans in a query string arrive as the text 'true' / 'false'. */
export const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** The signed-in employee. Every authenticated request has one. */
export const requireActor = (req: Request): number => req.ctx.actorId;
