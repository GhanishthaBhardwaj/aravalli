// The ONE place the web app talks to the server. Pages never call fetch directly.
//
// DEV ONLY until Phase 3: the organisation and the acting employee are sent as two headers. They are kept in this
// module (and remembered in localStorage as a preference, not as data) and replaced by a login session later.
import type {
  AssessmentInput, DepartmentWithStats, EmployeeListItem, HeatCell, IncidentDetail, IncidentListItem, IncidentStatus,
  OrganisationSummary, Overview, Paged, ResolutionRow, RiskDetail, RiskInput, RiskListItem, RiskProfileRow, RiskStatus, Single,
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

// ---------------------------------------------------------------- session (dev only)
const SESSION_KEY = 'aravalli:session';
interface SessionState { organisationId: number | null; actorId: number | null }
let session: SessionState = readSession();

function readSession(): SessionState {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<SessionState> | null;
    return { organisationId: Number(raw?.organisationId) || null, actorId: Number(raw?.actorId) || null };
  } catch {
    return { organisationId: null, actorId: null };
  }
}

export const getSession = (): SessionState => session;
export function setSession(next: Partial<SessionState>): void {
  session = { ...session, ...next };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: the choice just lasts until reload */
  }
}

// ------------------------------------------------------------------------ transport
type Query = Record<string, string | number | boolean | undefined | null>;

export function queryString(query: Query = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function call<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal; anonymous?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // `anonymous` leaves the saved organisation and actor out: used to ask which organisations exist, before one is chosen.
  if (session.organisationId && !opts.anonymous) headers['X-Organisation-Id'] = String(session.organisationId);
  if (session.actorId && !opts.anonymous) headers['X-Actor-Id'] = String(session.actorId);
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}${queryString(opts.query)}`, {
      method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'The server could not be reached. Check that the API is running, then try again.');
  }
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

const data = async <T>(p: Promise<Single<T>>): Promise<T> => (await p).data;

// --------------------------------------------------------------------------- endpoints
export type ListParams = { limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' };

export const api = {
  organisations: (signal?: AbortSignal) => data(call<Single<OrganisationSummary[]>>('GET', '/organisations', { signal, anonymous: true })),
  currentOrganisation: () => data(call<Single<OrganisationSummary>>('GET', '/organisations/current')),

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
