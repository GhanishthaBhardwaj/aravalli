// User management (Org Admin only; the server refuses everyone else). Add a person with a name, email, role, department and a
// first password; they can sign in straight away. Change a role or department, set a new password, or deactivate someone.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ROLES, type Role } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { fmtDate } from '../app/format';
import { api, auth, fieldErrors, type UserRow } from '../api/client';
import { useApi } from '../api/useApi';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/fields';
import { Card, Section } from '../components/ui/layout';
import { Modal } from '../components/ui/Modal';

const EMPTY = { first_name: '', last_name: '', email: '', job_title: '', role: 'Employee' as Role, department_id: '', password: '' };

export function Users() {
  const { user } = useSession();
  const toast = useToast();
  const users = useApi(() => auth.users(), []);
  const departments = useApi((signal) => api.departments(signal), []);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');
  const [pwFor, setPwFor] = useState<UserRow | null>(null);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');

  const deptOptions = (departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }));
  const deptId = form.department_id || deptOptions[0]?.value || '';
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const made = await auth.createUser({ ...form, email: form.email.trim(), department_id: Number(deptId) });
      toast.push(`${made.first_name} ${made.last_name} can now sign in`);
      setForm(EMPTY);
      users.reload();
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
    } catch (err) {
      setRowError(fieldErrors(err)._form ?? 'Could not save that change.');
    }
    users.reload();
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwFor) return;
    setPwError('');
    try {
      await auth.setPassword(pwFor.user_id, pw);
      toast.push(`New password set for ${pwFor.first_name} ${pwFor.last_name}`);
      setPwFor(null);
      setPw('');
    } catch (err) {
      const f = fieldErrors(err);
      setPwError(f.password ?? f._form ?? 'Could not set the password.');
    }
  };

  return (
    <Page title="Users" loading={users.loading || departments.loading} error={users.error ?? departments.error} onRetry={users.reload}>
      {rowError && <div role="alert" className="mb-6 rounded-lg border border-fg bg-surface-2 px-4 py-3 text-[14px] font-medium">{rowError}</div>}

      <Section title="Add a person" className="mb-14">
        <form onSubmit={add} noValidate aria-label="Add a person">
          {errors._form && <div role="alert" className="mb-4 rounded-lg border border-fg bg-surface-2 px-4 py-3 text-[14px] font-medium">{errors._form}</div>}
          <div className="grid gap-x-4 md:grid-cols-4">
            <Field label="First name" error={errors.first_name}>{(p) => <Input {...p} value={form.first_name} onChange={set('first_name')} />}</Field>
            <Field label="Last name" error={errors.last_name}>{(p) => <Input {...p} value={form.last_name} onChange={set('last_name')} />}</Field>
            <Field label="Email (their login)" error={errors.email} className="md:col-span-2">{(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}</Field>
          </div>
          <div className="grid gap-x-4 md:grid-cols-4">
            <Field label="Role" error={errors.role}>{(p) => <Select {...p} value={form.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r, label: r }))} />}</Field>
            <Field label="Department" error={errors.department_id}>{(p) => <Select {...p} value={deptId} onChange={set('department_id')} options={deptOptions} />}</Field>
            <Field label="Job title (optional)" error={errors.job_title}>{(p) => <Input {...p} value={form.job_title} onChange={set('job_title')} />}</Field>
            <Field label="First password" error={errors.password} hint="10+ characters, a letter and a number.">{(p) => <Input {...p} type="text" autoComplete="off" value={form.password} onChange={set('password')} />}</Field>
          </div>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Adding…' : 'Add person'}</Button>
        </form>
      </Section>

      <Section title="People with a login">
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
                    <td><span className="inline-flex items-center gap-2 font-medium"><Avatar person={u} size={26} />{u.first_name} {u.last_name}{me && <span className="text-[12px] font-normal text-subtle">(you)</span>}{!u.is_active && <span className="text-[12px] font-normal text-subtle">inactive</span>}</span></td>
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
                    <td className="text-muted">{u.email}</td>
                    <td className="text-muted">{u.last_login_at ? fmtDate(u.last_login_at) : 'Never'}</td>
                    <td className="right whitespace-nowrap">
                      {!u.is_demo && <Button size="sm" className="mr-2" onClick={() => { setPwFor(u); setPw(''); setPwError(''); }} aria-label={`Set password for ${u.first_name} ${u.last_name}`}>Set password</Button>}
                      <Button size="sm" disabled={me && u.is_active} onClick={() => change(u, { is_active: !u.is_active })} aria-label={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.first_name} ${u.last_name}`}>
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

      <Modal open={pwFor !== null} onClose={() => setPwFor(null)} title={pwFor ? `Set a password for ${pwFor.first_name} ${pwFor.last_name}` : ''}>
        <form onSubmit={savePassword} noValidate>
          <Field label="New password" error={pwError} hint="10+ characters, a letter and a number.">{(p) => <Input {...p} type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button onClick={() => setPwFor(null)}>Cancel</Button><Button type="submit" variant="primary">Set password</Button></div>
        </form>
      </Modal>
    </Page>
  );
}
