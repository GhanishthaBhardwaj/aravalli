// Controllers turn a validated request into a service call and a response. No SQL and no business rules here.
import { inScope } from '@aravalli/shared';
import type { DepartmentWithStats } from '@aravalli/shared';
import type { Request, Response } from 'express';
import { notFound } from '../core/errors';
import { idParam, sendData, sendPage } from '../core/http';
import * as repo from '../repositories/directory';
import type { Deps } from '../services/deps';

/** What the caller may know about a department: a Department Head sees only their own; an Employee sees names but no figures. */
function departmentsFor(req: Request, all: DepartmentWithStats[]): DepartmentWithStats[] {
  const scope = req.ctx.scope;
  if (scope.kind === 'department') return all.filter((dep) => inScope(scope, dep));
  if (scope.kind === 'own') return all.map((dep) => ({ ...dep, open_risks: 0, open_incidents: 0, people: 0 }));
  return all;
}

export const makeDirectoryController = (d: Deps) => ({
  async currentOrganisation(req: Request, res: Response) {
    const org = await repo.getOrganisation(d.pool, req.ctx.organisationId);
    if (!org) throw notFound('Organisation');
    sendData(res, org);
  },
  async organisationById(req: Request, res: Response) {
    // an organisation can read only itself, even though ids are guessable
    const id = idParam(req);
    const org = id === req.ctx.organisationId ? await repo.getOrganisation(d.pool, id) : undefined;
    if (!org) throw notFound('Organisation');
    sendData(res, org);
  },
  async listDepartments(req: Request, res: Response) {
    sendData(res, departmentsFor(req, await repo.listDepartments(d.pool, req.ctx.organisationId)));
  },
  async department(req: Request, res: Response) {
    const id = idParam(req);
    const dept = departmentsFor(req, await repo.listDepartments(d.pool, req.ctx.organisationId)).find((x) => x.department_id === id);
    if (!dept) throw notFound('Department');
    sendData(res, dept);
  },
  async listEmployees(req: Request, res: Response, q: { q?: string; department_id?: number; role: string[]; active?: boolean; sort: string; order: 'asc' | 'desc'; limit: number; offset: number }) {
    const { data, total } = await repo.listEmployees(
      d.pool, req.ctx.organisationId,
      { q: q.q, department_id: q.department_id, roles: q.role, active: q.active, scope: req.ctx.scope },
      q.sort, q.order === 'desc', q.limit, q.offset,
    );
    sendPage(res, data, q.limit, q.offset, total);
  },
  async employee(req: Request, res: Response) {
    const e = await repo.getEmployee(d.pool, req.ctx.organisationId, idParam(req));
    if (!e || !inScope(req.ctx.scope, e)) throw notFound('Employee');
    sendData(res, e);
  },
});
