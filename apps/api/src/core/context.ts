// THE ONE PLACE a request's organisation and actor come from: the verified session. Never the body, the URL or a header the
// client could choose. Every repository query takes organisationId from this object and nowhere else.
//
// The access token only says WHICH USER is calling. The organisation, role and department are read from the database on every
// request, so deactivating a user, or changing their role, takes effect on their very next request.
import type { Employee, Permission, Role } from '@aravalli/shared';
import { hasPermission, scopeFor, type Scope } from '@aravalli/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyAccessToken } from '../auth/crypto';
import { getSession } from '../repositories/auth';
import { iso } from './db';
import type { Pool } from './db';
import { AppError } from './errors';

export interface RequestContext {
  userId: number;
  organisationId: number;
  /** The employee row of the signed-in user. */
  actorId: number;
  role: Role;
  departmentId: number;
  actor: Employee;
  scope: Scope;
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx: RequestContext;
  }
}

const unauthorized = () => new AppError('unauthorized', 'Sign in to continue.');

export function authenticate(pool: Pool, jwtSecret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.header('authorization') ?? '';
      const match = /^Bearer (\S+)$/.exec(header);
      const userId = match ? verifyAccessToken(match[1]!, jwtSecret) : null;
      if (userId === null) throw unauthorized();
      const s = await getSession(pool, userId);
      if (!s || !s.user_active || !s.employee_active) throw unauthorized();
      const actor: Employee = {
        employee_id: s.employee_id, organisation_id: s.organisation_id, employee_code: s.employee_code, department_id: s.department_id,
        first_name: s.first_name, last_name: s.last_name, email: s.email, job_title: s.job_title, role: s.role, is_active: true, created_at: iso(s.employee_created_at),
      };
      req.ctx = { userId, organisationId: s.organisation_id, actorId: s.employee_id, role: s.role, departmentId: s.department_id, actor, scope: scopeFor(actor) };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Refuses the request unless the signed-in role holds the permission. */
export const requirePermission = (permission: Permission): RequestHandler => (req, _res, next) => {
  if (!hasPermission(req.ctx.role, permission)) return next(new AppError('forbidden', req.ctx.role === 'Auditor' ? 'Auditors have read-only access.' : `Your role (${req.ctx.role}) is not allowed to do this.`));
  next();
};
