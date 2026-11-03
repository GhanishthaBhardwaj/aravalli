import type { Clock, Employee } from '@aravalli/shared';
import type { Pool } from '../core/db';
import { AppError } from '../core/errors';
import type { Mailer } from '../auth/mailer';
import type { AuthConfig } from '../core/config';
import * as directory from '../repositories/directory';

/** What every service needs. The clock is injected so tests can fix time and production uses the real one. */
export interface Deps {
  pool: Pool;
  clock: Clock;
  auth: AuthConfig;
  mailer: Mailer;
  /** Milliseconds since the epoch. Injected so tests can move time forward to check expiry. */
  nowMs: () => number;
}

/** DATETIME text for "now" from the injected clock: 'YYYY-MM-DD HH:MM:00'. */
export const stamp = (clock: Clock): string => `${clock.now().replace('T', ' ')}:00`;

/** The acting employee, or an error. Actors are looked up inside the request's organisation only. */
export async function actorFor(pool: Pool, organisationId: number, actorId: number): Promise<Employee> {
  const actor = await directory.getEmployee(pool, organisationId, actorId);
  if (!actor) throw new AppError('unauthorized', 'The signed-in employee does not exist in this organisation.');
  if (!actor.is_active) throw new AppError('forbidden', 'The acting employee is not active.');
  return actor;
}
