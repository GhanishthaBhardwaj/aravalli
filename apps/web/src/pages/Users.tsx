// User management (Org Admin only; the server refuses everyone else). Change a person's role or department, deactivate them,
// and invite new people by email with their role and department already chosen.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ROLES, type Role } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { fmtDate } from '../app/format';
import { auth, fieldErrors, type InvitationRow, type UserRow } from '../api/client';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/fields';
import { Card, Section } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';

export function Users() {
  const { user } = useSession();
  const toast = useToast();
  const users = useApi((signal) => { void signal; return auth.users(); }, []);
  const invitations = useApi((signal) => { void signal; return auth.invitations(); }, []);
  const departments = useApi((signal) => api.departments(signal), []);

  const [invite, setInvite] = useState<{ email: string; role: Role; department_id: string }>({ email: '', role: 'Employee', department_id: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string>('');

  const deptOptions = (departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }));
  const deptId = invite.department_id || deptOptions[0]?.value || '';

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const sent = await auth.invite({ email: invite.email.trim(), role: invite.role, department_id: Number(deptId) });
      toast.push(`Invitation sent to ${sent.email}`);
      setInvite({ email: '', role: 'Employee', department_id: '' });
      invitations.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  const change = async (row: UserRow, patch: { role?: Role; department_id?: number; is_active?: boolean }) => {
    setRowError('');
    try {
      await auth.updateUser(row.user_id, patch);
      toast.push(`${row.first_name} ${row.last_name} updated`);
      users.reload();
    } catch (err) {
      setRowError(fieldErrors(err)._form ?? 'Could not save that change.');
      users.reload();
    }
  };

  const revoke = async (row: InvitationRow) => {
    try {
      await auth.revokeInvitation(row.invitation_id);
      toast.push(`Invitation to ${row.email} revoked`);
      invitations.reload();
    } catch (err) {
      setRowError(fieldErrors(err)._form ?? 'Could not revoke that invitation.');
    }
  };

  return (
    <Page title="Users" description="Who can sign in to this organisation, what they may do, and who has been invited." loading={users.loading || departments.loading} error={users.error ?? departments.error} onRetry={users.reload}>
      {rowError && <div role="alert" className="mb-6 rounded-lg border border-fg bg-surface-2 px-4 py-3 text-[14px] font-medium">{rowError}</div>}

      <Section title="Invite someone" className="mb-14">
        <form onSubmit={send} noValidate className="grid items-start gap-x-4 md:grid-cols-[1fr_180px_200px_auto]" aria-label="Invite someone">
          <Field label="Email" error={errors.email ?? errors._form}>
            {(p) => <Input {...p} type="email" value={invite.email} onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))} />}
          </Field>
          <Field label="Role" error={errors.role}>
            {(p) => <Select {...p} value={invite.role} onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value as Role }))} options={ROLES.map((r) => ({ value: r, label: r }))} />}
          </Field>
          <Field label="Department" error={errors.department_id}>
            {(p) => <Select {...p} value={deptId} onChange={(e) => setInvite((s) => ({ ...s, department_id: e.target.value }))} options={deptOptions} />}
          </Field>
          <div className="pt-[28px]"><Button type="submit" variant="primary" disabled={busy || !invite.email.trim()}>{busy ? 'Sending…' : 'Send invitation'}</Button></div>
        </form>
      </Section>

      <Section title="People with a login" className="mb-14">
        <Card className="overflow-x-auto">
          <table className="tbl" aria-label="Users">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Last signed in</th><th className="right">Access</th></tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => {
                const me = u.user_id === user.user_id;
                return (
                  <tr key={u.user_id}>
                    <td><span className="inline-flex items-center gap-2 font-medium"><Avatar person={u} size={26} />{u.first_name} {u.last_name}{me && <span className="text-[12px] font-normal text-subtle">(you)</span>}</span></td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${u.user_id}`}>Role for {u.first_name} {u.last_name}</label>
                      <select id={`role-${u.user_id}`} className="control h-9 w-auto" value={u.role} onChange={(e) => change(u, { role: e.target.value as Role })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`dept-${u.user_id}`}>Department for {u.first_name} {u.last_name}</label>
                      <select id={`dept-${u.user_id}`} className="control h-9 w-auto max-w-[200px]" value={u.department_id} onChange={(e) => change(u, { department_id: Number(e.target.value) })}>
                        {(departments.data ?? []).map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="text-muted">{u.email}{!u.email_verified && <span className="ml-2 text-[12px] text-subtle">unconfirmed</span>}</td>
                    <td className="text-muted">{u.last_login_at ? fmtDate(u.last_login_at) : 'Never'}</td>
                    <td className="right">
                      <Button size="sm" variant="secondary" disabled={me && u.is_active} onClick={() => change(u, { is_active: !u.is_active })} aria-label={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.first_name} ${u.last_name}`}>
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="Invitations">
        <Card className="overflow-x-auto">
          {(invitations.data ?? []).length === 0 ? (
            <EmptyState title="No invitations yet" body="Invitations you send appear here until they are accepted, revoked or expire." />
          ) : (
            <table className="tbl" aria-label="Invitations">
              <thead><tr><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Expires</th><th className="right"> </th></tr></thead>
              <tbody>
                {(invitations.data ?? []).map((i) => (
                  <tr key={i.invitation_id}>
                    <td className="font-medium">{i.email}</td>
                    <td>{i.role}</td>
                    <td>{i.department_name}</td>
                    <td>{i.status}</td>
                    <td className="text-muted">{fmtDate(i.expires_at)}</td>
                    <td className="right">{i.status === 'Pending' && <Button size="sm" onClick={() => revoke(i)} aria-label={`Revoke invitation to ${i.email}`}>Revoke</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Section>
    </Page>
  );
}
