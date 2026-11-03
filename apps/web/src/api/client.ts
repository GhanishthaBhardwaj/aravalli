// The ONE place the web app talks to the server. Pages never call fetch directly.
//
// Sign-in: the access token (15 minutes) lives only in this module's memory, never in localStorage, so a script injected into
// the page cannot read it from storage. The refresh token is an httpOnly cookie the browser sends by itself; when an access
// token expires the first failing request triggers ONE refresh (shared by every request that fails at the same moment) and is
// then retried. The organisation and the user come from the session on the server; nothing here chooses them.
import type {
  AssessmentInput, DepartmentWithStats, EmployeeListItem, HeatCell, IncidentDetail, IncidentListItem, IncidentStatus,
  Overview, Paged, ResolutionRow, Role, RiskDetail, RiskInput, RiskListItem, RiskProfileRow, RiskStatus, SessionUser, Single,
} from '@aravalli/shared';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: { field: string; message: string }[] = []) {
    super(message);
  }
}

/** Form-friendly errors: { field: message }, with `_form` for a problem that belongs to no single field. */
export function fieldErrors(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof ApiError)) return { _form: error instanceof Error ? error.message : 'Something went wrong.' };
  const out: Record<string, string | undefined> = {};
  for (const d of error.details) if (d.field && !out[d.field]) out[d.field] = d.message;
  if (!Object.keys(out).length || !error.details.length) out._form = error.message;
  return out;
}

// ----------------------------------------------------------------------------------------------------------- session
interface SessionBody { access_token: string; expires_in: number; user: SessionUser }

let accessToken: string | null = null;
let refreshing: Promise<SessionUser | null> | null = null;
const signedOutListeners = new Set<() => void>();

/** The provider subscribes to hear that the session ended (refresh failed), so it can show the sign-in screen. */
export const onSignedOut = (fn: () => void): (() => void) => {
  signedOutListeners.add(fn);
  return () => signedOutListeners.delete(fn);
};
export const hasAccessToken = (): boolean => accessToken !== null;
/** For tests only. */
export const _setAccessToken = (t: string | null): void => { accessToken = t; };

// ------------------------------------------------------------------------ transport
type Query = Record<string, string | number | boolean | undefined | null>;

export function queryString(query: Query = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface CallOptions { query?: Query; body?: unknown; signal?: AbortSignal; /** No sign-in needed or wanted (login, sign-up, reset...). */ anonymous?: boolean }

async function send(method: string, path: string, opts: CallOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken && !opts.anonymous) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(`/api${path}${queryString(opts.query)}`, {
      method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: opts.signal, credentials: 'same-origin',
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'The server could not be reached. Check that the API is running, then try again.');
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: handled below */
  }
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: { field: string; message: string }[] } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `The server answered ${res.status}.`, e?.details ?? []);
  }
  return json as T;
}

async function call<T>(method: string, path: string, opts: CallOptions = {}): Promise<T> {
  let res = await send(method, path, opts);
  if (res.status === 401 && !opts.anonymous) {
    // the access token probably expired: renew it once (shared with any other request failing right now) and try again
    const user = await refreshSession();
    if (user) res = await send(method, path, opts);
    else signedOutListeners.forEach((fn) => fn());
  }
  return parse<T>(res);
}

function take(body: SessionBody): SessionUser {
  accessToken = body.access_token;
  return body.user;
}

/** Asks the server to exchange the refresh cookie for a new access token. Null if there is no valid session; throws if the server cannot be reached. */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= (async () => {
    try {
      const res = await send('POST', '/auth/refresh', { anonymous: true });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      return take((await parse<Single<SessionBody>>(res)).data);
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

const data = async <T>(p: Promise<Single<T>>): Promise<T> => (await p).data;
const anon = { anonymous: true } as const;

// --------------------------------------------------------------------------- endpoints
export type ListParams = { limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' };

export interface UserRow {
  user_id: number; employee_id: number; email: string; first_name: string; last_name: string; role: Role; department_id: number; department_name: string;
  is_active: boolean; is_demo: boolean; email_verified: boolean; last_login_at: string | null;
}
export interface InvitationRow {
  invitation_id: number; email: string; role: Role; department_id: number; department_name: string; invited_by_name: string;
  created_at: string; expires_at: string; status: 'Pending' | 'Accepted' | 'Revoked' | 'Expired';
}
export interface InvitationPreview { email: string; role: Role; organisation_name: string; department_name: string; invited_by_name: string; expires_at: string }
export interface DemoAccount { user_id: number; role: Role; organisation_slug: string; organisation_name: string; first_name: string; last_name: string; job_title: string }

export const auth = {
  signup: async (body: { organisation_name: string; first_name: string; last_name: string; email: string; password: string }) =>
    take((await call<Single<SessionBody>>('POST', '/auth/signup', { body, ...anon })).data),
  login: async (body: { email: string; password: string }) => take((await call<Single<SessionBody>>('POST', '/auth/login', { body, ...anon })).data),
  logout: async () => {
    try {
      await call('POST', '/auth/logout', anon);
    } finally {
      accessToken = null;
    }
  },
  me: () => data(call<Single<SessionUser>>('GET', '/auth/me')),
  forgot: (email: string) => call('POST', '/auth/forgot-password', { body: { email }, ...anon }),
  reset: (token: string, password: string) => call('POST', '/auth/reset-password', { body: { token, password }, ...anon }),
  verifyEmail: (token: string) => call('POST', '/auth/verify-email', { body: { token }, ...anon }),
  resendVerification: () => call('POST', '/auth/resend-verification'),
  lookupInvitation: (token: string) => data(call<Single<InvitationPreview>>('POST', '/auth/invitations/lookup', { body: { token }, ...anon })),
  acceptInvitation: async (body: { token: string; first_name: string; last_name: string; password: string }) =>
    take((await call<Single<SessionBody>>('POST', '/auth/invitations/accept', { body, ...anon })).data),
  demoAccounts: async (): Promise<DemoAccount[]> => {
    try {
      return await data(call<Single<DemoAccount[]>>('GET', '/auth/demo-accounts', anon));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return []; // demo logins are switched off on this server
      throw e;
    }
  },
  demoLogin: async (organisation: string, role: Role) => take((await call<Single<SessionBody>>('POST', '/auth/demo-login', { body: { organisation, role }, ...anon })).data),

  users: () => data(call<Single<UserRow[]>>('GET', '/users')),
  updateUser: (id: number, body: { role?: Role; department_id?: number; is_active?: boolean }) => data(call<Single<UserRow>>('PATCH', `/users/${id}`, { body })),
  invitations: () => data(call<Single<InvitationRow[]>>('GET', '/invitations')),
  invite: (body: { email: string; role: Role; department_id: number }) => data(call<Single<InvitationRow>>('POST', '/invitations', { body })),
  revokeInvitation: (id: number) => call('DELETE', `/invitations/${id}`),
};

export const api = {
  departments: (signal?: AbortSignal) => data(call<Single<DepartmentWithStats[]>>('GET', '/departments', { signal })),
  employees: (query: ListParams & { q?: string; department_id?: number | string; role?: string; active?: boolean }, signal?: AbortSignal) =>
    call<Paged<EmployeeListItem>>('GET', '/employees', { query, signal }),

  risks: (query: ListParams & Record<string, string | number | boolean | undefined>, signal?: AbortSignal) =>
    call<Paged<RiskListItem>>('GET', '/risks', { query, signal }),
  risk: (code: string, signal?: AbortSignal) => data(call<Single<RiskDetail>>('GET', `/risks/by-code/${encodeURIComponent(code)}`, { signal })),
  registerRisk: (body: RiskInput) => data(call<Single<RiskDetail>>('POST', '/risks', { body })),
  addAssessment: (riskId: number, body: AssessmentInput) => data(call<Single<RiskDetail>>('POST', `/risks/${riskId}/assessments`, { body })),
  changeRiskStatus: (riskId: number, status: RiskStatus, note: string) =>
    data(call<Single<RiskDetail>>('POST', `/risks/${riskId}/status`, { body: { status, note } })),

  incidents: (query: ListParams & Record<string, string | number | boolean | undefined>, signal?: AbortSignal) =>
    call<Paged<IncidentListItem>>('GET', '/incidents', { query, signal }),
  incident: (code: string, signal?: AbortSignal) => data(call<Single<IncidentDetail>>('GET', `/incidents/by-code/${encodeURIComponent(code)}`, { signal })),
  reportIncident: (body: {
    title: string; description: string; severity: string; department_id: number | null; occurred_at: string;
    assigned_to: number | null; risk_id: number | null;
  }) => data(call<Single<IncidentDetail>>('POST', '/incidents', { body })),
  addIncidentUpdate: (id: number, update_text: string, status_to: IncidentStatus | null) =>
    data(call<Single<IncidentDetail>>('POST', `/incidents/${id}/updates`, { body: { update_text, status_to } })),
  assignIncident: (id: number, employee_id: number | null) => data(call<Single<IncidentDetail>>('PATCH', `/incidents/${id}/assignment`, { body: { employee_id } })),
  linkIncidentRisk: (id: number, risk_id: number | null) => data(call<Single<IncidentDetail>>('PATCH', `/incidents/${id}/risk-link`, { body: { risk_id } })),

  overview: (signal?: AbortSignal) => data(call<Single<Overview>>('GET', '/reports/overview', { signal })),
  heatmap: (mode: 'current' | 'first', signal?: AbortSignal) => data(call<Single<HeatCell[]>>('GET', '/reports/heatmap', { query: { mode }, signal })),
  riskProfile: (signal?: AbortSignal) => data(call<Single<RiskProfileRow[]>>('GET', '/reports/risk-profile', { signal })),
  resolution: (group_by: 'severity' | 'department', signal?: AbortSignal) =>
    data(call<Single<ResolutionRow[]>>('GET', '/reports/resolution', { query: { group_by }, signal })),
};
