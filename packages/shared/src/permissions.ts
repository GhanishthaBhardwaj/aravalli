import type { Employee, Incident } from './types';

export type Action =
  | 'risk.register' | 'risk.assess' | 'risk.status'
  | 'incident.report' | 'incident.update' | 'incident.assign' | 'incident.link';

export interface Permit { allowed: boolean; reason?: string }

const ok: Permit = { allowed: true };
const no = (reason: string): Permit => ({ allowed: false, reason });

/** Simulated, light role enforcement (see README). Disabled actions explain themselves. */
export function permit(actor: Employee, action: Action, incident?: Incident): Permit {
  if (actor.role === 'Auditor') return no('Auditors have read-only access.');
  if (actor.role !== 'Employee') return ok;
  switch (action) {
    case 'incident.report':
      return ok;
    case 'incident.update':
      return incident && (incident.reported_by === actor.employee_id || incident.assigned_to === actor.employee_id)
        ? ok
        : no('Employees can update only incidents they reported or are assigned to.');
    case 'incident.assign':
    case 'incident.link':
      return no('Employees cannot assign or link incidents.');
    default:
      return no('Employees cannot register, assess or close risks.');
  }
}

/** Employees may not close incidents. */
export const canClose = (actor: Employee): Permit =>
  actor.role === 'Employee' ? no('Employees cannot close incidents.') : ok;
