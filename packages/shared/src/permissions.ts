import type { Employee, Role } from './types';

// THE permission map. The server enforces it on every endpoint (middleware + service checks); the browser reads the same map
// only to hide or disable what the server would refuse, and to explain why.

export type Permission =
  | 'directory.read' // departments and people
  | 'risk.read' | 'risk.write'
  | 'incident.read' | 'incident.report' | 'incident.update' | 'incident.assign' | 'incident.link'
  | 'report.read'
  | 'user.manage';

const ALL: readonly Permission[] = [
  'directory.read', 'risk.read', 'risk.write', 'incident.read', 'incident.report', 'incident.update', 'incident.assign', 'incident.link', 'report.read', 'user.manage',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Everything in their organisation. */
  'Org Admin': ALL,
  /** All risks and incidents; no user management. */
  'Risk Officer': ALL.filter((p) => p !== 'user.manage'),
  /** Only their own department (see scopeFor). */
  'Department Head': ['directory.read', 'risk.read', 'risk.write', 'incident.read', 'incident.report', 'incident.update', 'incident.assign', 'incident.link'],
  /** Read-only. */
  Auditor: ['directory.read', 'risk.read', 'incident.read', 'report.read'],
  /** Reports incidents; sees and updates only those they reported or are assigned to. */
  Employee: ['incident.read', 'incident.report', 'incident.update'],
};

export const hasPermission = (role: Role, permission: Permission): boolean => ROLE_PERMISSIONS[role].includes(permission);

/** Which rows a person may see. */
export type Scope =
  | { kind: 'org' }
  | { kind: 'department'; departmentId: number }
  | { kind: 'own'; employeeId: number };

export function scopeFor(actor: Pick<Employee, 'role' | 'employee_id' | 'department_id'>): Scope {
  if (actor.role === 'Department Head') return { kind: 'department', departmentId: actor.department_id };
  if (actor.role === 'Employee') return { kind: 'own', employeeId: actor.employee_id };
  return { kind: 'org' };
}

/** What a scoped row looks like to the scope check. */
export interface Target { department_id?: number; reported_by?: number; assigned_to?: number | null }

/** Can this person see this row? Used for single-record reads; lists filter in SQL with the same rule. */
export function inScope(scope: Scope, target: Target): boolean {
  switch (scope.kind) {
    case 'org':
      return true;
    case 'department':
      return target.department_id === scope.departmentId;
    case 'own':
      return target.reported_by === scope.employeeId || target.assigned_to === scope.employeeId;
  }
}

export type Action =
  | 'risk.register' | 'risk.assess' | 'risk.status'
  | 'incident.report' | 'incident.update' | 'incident.assign' | 'incident.link';

const ACTION_PERMISSION: Record<Action, Permission> = {
  'risk.register': 'risk.write', 'risk.assess': 'risk.write', 'risk.status': 'risk.write',
  'incident.report': 'incident.report', 'incident.update': 'incident.update', 'incident.assign': 'incident.assign', 'incident.link': 'incident.link',
};

export interface Permit { allowed: boolean; reason?: string }

const ok: Permit = { allowed: true };
const no = (reason: string): Permit => ({ allowed: false, reason });

type Actor = Pick<Employee, 'role' | 'employee_id' | 'department_id'>;

/** Can this person do this, optionally to this record? Disabled actions explain themselves. */
export function permit(actor: Actor, action: Action, target?: Target): Permit {
  if (actor.role === 'Auditor') return no('Auditors have read-only access.');
  if (!hasPermission(actor.role, ACTION_PERMISSION[action])) {
    return no(actor.role === 'Employee' && (action === 'incident.assign' || action === 'incident.link')
      ? 'Employees cannot assign or link incidents.'
      : 'Employees cannot register, assess or close risks.');
  }
  if (target && !inScope(scopeFor(actor), target)) {
    return no(actor.role === 'Employee'
      ? 'Employees can update only incidents they reported or are assigned to.'
      : 'Department Heads can act only on their own department.');
  }
  return ok;
}

/** Employees may not close incidents. */
export const canClose = (actor: Pick<Employee, 'role'>): Permit =>
  actor.role === 'Employee' ? no('Employees cannot close incidents.') : ok;

/** What the signed-in person looks like to the web app (GET /api/auth/me). */
export interface SessionUser {
  user_id: number;
  email: string;
  email_verified: boolean;
  is_demo: boolean;
  organisation_id: number;
  organisation_name: string;
  organisation_data_note: string | null;
  employee: Employee;
  permissions: Permission[];
}
