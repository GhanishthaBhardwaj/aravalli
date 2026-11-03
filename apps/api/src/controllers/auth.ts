// Turns auth requests into service calls, and owns the refresh cookie (the only place that sets or reads it).
import type { Role } from '@aravalli/shared';
import type { Request, Response } from 'express';
import { verifyAccessToken } from '../auth/crypto';
import { idParam, sendData } from '../core/http';
import type { Deps } from '../services/deps';
import * as service from '../services/auth';

export const REFRESH_COOKIE = 'aravalli_refresh';
const COOKIE_PATH = '/api/auth';

export const makeAuthController = (d: Deps) => {
  const setCookie = (res: Response, t: service.Tokens) =>
    res.cookie(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, secure: d.auth.cookieSecure, sameSite: 'strict', path: COOKIE_PATH, maxAge: t.refreshMaxAgeMs });
  const ua = (req: Request) => req.header('user-agent') ?? null;
  const cookie = (req: Request): string | undefined => (typeof req.cookies?.[REFRESH_COOKIE] === 'string' ? req.cookies[REFRESH_COOKIE] : undefined);

  /** Sets the cookie and answers with the access token (in the body, kept in memory by the web app) and the user. */
  async function respondWithSession(res: Response, t: service.Tokens, status = 200) {
    setCookie(res, t);
    const userId = verifyAccessToken(t.accessToken, d.auth.jwtSecret)!;
    sendData(res, { access_token: t.accessToken, token_type: 'Bearer', expires_in: t.expiresIn, user: await service.sessionUser(d, userId) }, status);
  }

  return {
    async signup(req: Request, res: Response, body: service.SignupBody) { await respondWithSession(res, await service.signup(d, body, ua(req)), 201); },
    async login(req: Request, res: Response, body: { email: string; password: string }) { await respondWithSession(res, await service.login(d, body.email, body.password, ua(req))); },
    async refresh(req: Request, res: Response) {
      try {
        await respondWithSession(res, await service.refresh(d, cookie(req), ua(req)));
      } catch (error) {
        res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
        throw error;
      }
    },
    async logout(req: Request, res: Response) {
      await service.logout(d, cookie(req));
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      sendData(res, { ok: true });
    },
    async me(req: Request, res: Response) { sendData(res, await service.sessionUser(d, req.ctx.userId)); },
    async demoAccounts(_req: Request, res: Response) { sendData(res, await service.demoAccounts(d)); },
    async demoLogin(req: Request, res: Response, body: { organisation: string; role: Role }) { await respondWithSession(res, await service.demoLogin(d, body.organisation, body.role, ua(req))); },

    async users(req: Request, res: Response) { sendData(res, await service.listUsers(d, req.ctx)); },
    async createUser(req: Request, res: Response, body: service.NewUserBody) { sendData(res, await service.createUser(d, req.ctx, body), 201); },
    async updateUser(req: Request, res: Response, body: service.UserPatch) { sendData(res, await service.updateUser(d, req.ctx, idParam(req), body)); },
    async setPassword(req: Request, res: Response, body: { password: string }) { await service.setUserPassword(d, req.ctx, idParam(req), body.password); sendData(res, { ok: true }); },
  };
};
