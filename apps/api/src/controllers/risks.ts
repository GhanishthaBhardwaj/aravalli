import type { AssessmentInput, RiskInput, RiskStatus } from '@aravalli/shared';
import type { Request, Response } from 'express';
import { idParam, requireActor, sendData, sendPage } from '../core/http';
import type { RiskFilters } from '../repositories/risks';
import type { Deps } from '../services/deps';
import * as service from '../services/risks';

export interface RiskListQuery extends RiskFilters {
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const makeRisksController = (d: Deps) => ({
  async list(req: Request, res: Response, q: RiskListQuery) {
    const { sort, order, limit, offset, ...filters } = q;
    const { data, total } = await service.listRisks(d, req.ctx.organisationId, filters, sort, order === 'desc', limit, offset);
    sendPage(res, data, limit, offset, total);
  },
  async get(req: Request, res: Response) {
    sendData(res, await service.getRisk(d, req.ctx.organisationId, idParam(req)));
  },
  async getByCode(req: Request, res: Response) {
    sendData(res, await service.getRiskByCode(d, req.ctx.organisationId, req.params.code));
  },
  async create(req: Request, res: Response, body: RiskInput) {
    sendData(res, await service.registerRisk(d, req.ctx.organisationId, requireActor(req), body), 201);
  },
  async assessments(req: Request, res: Response) {
    sendData(res, await service.listAssessments(d, req.ctx.organisationId, idParam(req)));
  },
  async assess(req: Request, res: Response, body: AssessmentInput) {
    sendData(res, await service.addAssessment(d, req.ctx.organisationId, requireActor(req), idParam(req), body), 201);
  },
  async status(req: Request, res: Response, body: { status: RiskStatus; note: string }) {
    sendData(res, await service.changeStatus(d, req.ctx.organisationId, requireActor(req), idParam(req), body.status, body.note));
  },
});
