// One error shape for the whole API:  { "error": { "code", "message", "details" } }
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'actor_required'
  | 'organisation_not_found'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  actor_required: 401,
  organisation_not_found: 404,
  internal_error: 500,
};

export interface ErrorDetail { field: string; message: string }

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly details: ErrorDetail[] = []) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} not found.`);

/** The shared validators return { field: message }; turn that into API details. */
export function validationFailed(errors: Record<string, string | undefined>): AppError {
  const details = Object.entries(errors)
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([field, message]) => ({ field: field === '_form' ? '' : field, message }));
  const form = details.find((d) => d.field === '');
  return new AppError('validation_error', form ? form.message : 'The request is not valid.', details);
}

export const notFoundHandler: RequestHandler = (req, _res, next) => next(new AppError('not_found', `No route for ${req.method} ${req.path}.`));

// Express recognises an error handler by its four parameters, so the unused _next must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    res.status(400).json({ error: { code: 'validation_error', message: 'The request is not valid.', details } });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  // body-parser failures (malformed JSON, body too large) carry their own 4xx status
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(400).json({ error: { code: 'validation_error', message: 'The request could not be read.', details: [] } });
    return;
  }
  console.error(error); // the stack stays in the server log; the client gets nothing it could use
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on the server.', details: [] } });
};
