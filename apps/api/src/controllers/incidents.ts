import type { IncidentStatus } from '@aravalli/shared';
import type { Request, Response } from 'express';
import { idParam, sendData, sendPage } from '../core/http';
import type { IncidentFilters } from '../repositories/incidents';
import type { Deps } from '../services/deps';
import * as service from '../services/incidents';

export interface IncidentListQuery extends IncidentFilters {
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const makeIncidentsController = (d: Deps) => ({
  async list(req: Request, res: Response, q: IncidentListQuery) {
    const { sort, order, limit, offset, ...filters } = q;
    const { data, total } = await service.listIncidents(d, req.ctx, filters, sort, order === 'desc', limit, offset);
    sendPage(res, data, limit, offset, total);
  },
  async get(req: Request, res: Response) {
    sendData(res, await service.getIncident(d, req.ctx, idParam(req)));
  },
  async getByCode(req: Request, res: Response) {
    sendData(res, await service.getIncidentByCode(d, req.ctx, req.params.code));
  },
  async updates(req: Request, res: Response) {
    sendData(res, await service.listUpdates(d, req.ctx, idParam(req)));
  },
  async report(req: Request, res: Response, body: service.ReportIncidentInput) {
    sendData(res, await service.reportIncident(d, req.ctx, body), 201);
  },
  async addUpdate(req: Request, res: Response, body: { update_text: string; status_to: IncidentStatus | null }) {
    sendData(res, await service.addUpdate(d, req.ctx, idParam(req), body.update_text, body.status_to), 201);
  },
  async assign(req: Request, res: Response, body: { employee_id: number | null }) {
    sendData(res, await service.assign(d, req.ctx, idParam(req), body.employee_id));
  },
  async linkRisk(req: Request, res: Response, body: { risk_id: number | null }) {
    sendData(res, await service.linkRisk(d, req.ctx, idParam(req), body.risk_id));
  },
});
