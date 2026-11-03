import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { validateSignup } from '@aravalli/shared';
import { auth, fieldErrors } from '../../api/client';
import { useAuth } from '../../app/providers';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/fields';
import { AuthShell, authLink, FormMessage } from './AuthShell';

export function Signup() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [v, setV] = useState({ organisation_name: '', first_name: '', last_name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local = validateSignup({ ...v, email: v.email.trim() });
    if (Object.values(local).some(Boolean)) { setErrors(local); return; }
    setBusy(true);
    setErrors({});
    try {
      setUser(await auth.signup({ ...v, email: v.email.trim() }));
      nav('/', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your organisation"
      subtitle="You become its Org Admin. Invite your team once you are in."
      footer={<>Already have an account? <Link to="/login" className={authLink}>Sign in</Link></>}
    >
      {errors._form && <FormMessage kind="error">{errors._form}</FormMessage>}
      <form onSubmit={submit} noValidate>
        <Field label="Organisation name" error={errors.organisation_name}>
          {(p) => <Input {...p} autoComplete="organization" value={v.organisation_name} onChange={set('organisation_name')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name}>
            {(p) => <Input {...p} autoComplete="given-name" value={v.first_name} onChange={set('first_name')} />}
          </Field>
          <Field label="Last name" error={errors.last_name}>
            {(p) => <Input {...p} autoComplete="family-name" value={v.last_name} onChange={set('last_name')} />}
          </Field>
        </div>
        <Field label="Work email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={v.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 10 characters, with a letter and a number.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={v.password} onChange={set('password')} />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create organisation'}</Button>
      </form>
    </AuthShell>
  );
}
