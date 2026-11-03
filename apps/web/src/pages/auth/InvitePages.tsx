import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { validatePassword } from '@aravalli/shared';
import { auth, fieldErrors, type InvitationPreview } from '../../api/client';
import { useAuth } from '../../app/providers';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/fields';
import { AuthShell, authLink, FormMessage } from './AuthShell';

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [v, setV] = useState({ first_name: '', last_name: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    auth.lookupInvitation(token).then(
      (i) => { setInvite(i); setState('ok'); },
      () => setState('invalid'),
    );
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(v.password, invite?.email);
    const local: Record<string, string | undefined> = {
      first_name: v.first_name.trim() ? undefined : 'First name is required.',
      last_name: v.last_name.trim() ? undefined : 'Last name is required.',
      password: problem,
    };
    if (Object.values(local).some(Boolean)) { setErrors(local); return; }
    setBusy(true);
    setErrors({});
    try {
      setUser(await auth.acceptInvitation({ token, ...v }));
      nav('/', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setBusy(false);
    }
  };

  if (state === 'loading') return <AuthShell title="Accept your invitation"><p role="status" className="text-muted">Checking your invitation…</p></AuthShell>;
  if (state === 'invalid' || !invite) {
    return (
      <AuthShell title="Invitation not valid" footer={<Link to="/login" className={authLink}>Go to sign in</Link>}>
        <FormMessage kind="error">This invitation is invalid, has expired or was already used. Ask your Org Admin to send a new one.</FormMessage>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={`Join ${invite.organisation_name}`}
      subtitle={<>{invite.invited_by_name} invited <strong className="font-semibold text-fg">{invite.email}</strong> as <strong className="font-semibold text-fg">{invite.role}</strong> in {invite.department_name}.</>}
    >
      {errors._form && <FormMessage kind="error">{errors._form}</FormMessage>}
      <form onSubmit={submit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name}>
            {(p) => <Input {...p} autoComplete="given-name" value={v.first_name} onChange={(e) => setV((s) => ({ ...s, first_name: e.target.value }))} />}
          </Field>
          <Field label="Last name" error={errors.last_name}>
            {(p) => <Input {...p} autoComplete="family-name" value={v.last_name} onChange={(e) => setV((s) => ({ ...s, last_name: e.target.value }))} />}
          </Field>
        </div>
        <Field label="Choose a password" error={errors.password} hint="At least 10 characters, with a letter and a number.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV((s) => ({ ...s, password: e.target.value }))} />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Joining…' : 'Join'}</Button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const { status } = useAuth();

  useEffect(() => {
    if (!token) { setState('failed'); return; }
    let live = true;
    auth.verifyEmail(token).then(() => live && setState('done'), () => live && setState('failed'));
    return () => { live = false; };
  }, [token]);

  const next = status === 'in' ? <Link to="/" className={authLink}>Go to your dashboard</Link> : <Link to="/login" className={authLink}>Sign in</Link>;
  return (
    <AuthShell title="Confirm your email" footer={next}>
      {state === 'working' && <p role="status" className="text-muted">Confirming…</p>}
      {state === 'done' && <FormMessage kind="ok">Your email address is confirmed. Thank you.</FormMessage>}
      {state === 'failed' && <FormMessage kind="error">This confirmation link is invalid or has expired. Sign in and choose “Resend confirmation” from the banner.</FormMessage>}
    </AuthShell>
  );
}
