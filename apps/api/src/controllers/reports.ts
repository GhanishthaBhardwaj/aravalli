import type { Request, Response } from 'express';
import { sendData } from '../core/http';
import type { Deps } from '../services/deps';
import * as service from '../services/reports';

export const makeReportsController = (d: Deps) => ({
  async overview(req: Request, res: Response) {
    sendData(res, await service.overview(d, req.ctx.organisationId));
  },
  async heatmap(req: Request, res: Response, q: { mode: 'current' | 'first' }) {
    sendData(res, await service.heatmap(d, req.ctx.organisationId, q.mode));
  },
  async riskProfile(req: Request, res: Response) {
    sendData(res, await service.riskProfile(d, req.ctx.organisationId));
  },
  async resolution(req: Request, res: Response, q: { group_by: 'severity' | 'department' }) {
    sendData(res, await service.resolution(d, req.ctx.organisationId, q.group_by));
  },
});
