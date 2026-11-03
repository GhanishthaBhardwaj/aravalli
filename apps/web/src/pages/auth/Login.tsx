import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Role } from '@aravalli/shared';
import { auth, fieldErrors, type DemoAccount } from '../../api/client';
import { useAuth } from '../../app/providers';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/fields';
import { AuthShell, authLink, FormMessage } from './AuthShell';

/** Where to go after signing in: a path inside this app only (never an address someone else typed into the link). */
export const safeNext = (raw: string | null): string => (raw && /^\/(?!\/)[\w\-./?=&%]*$/.test(raw) ? raw : '/');

function DemoLogins() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    auth.demoAccounts().then(setAccounts, () => undefined);
  }, []);
  if (!accounts.length) return null;

  const orgs = [...new Map(accounts.map((a) => [a.organisation_slug, a.organisation_name])).entries()];
  const go = async (slug: string, role: Role) => {
    setBusy(`${slug}:${role}`);
    setError('');
    try {
      setUser(await auth.demoLogin(slug, role));
      nav(safeNext(params.get('next')), { replace: true });
    } catch (e) {
      setError(fieldErrors(e)._form ?? 'Could not sign in.');
      setBusy(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="demo-heading">
      <h2 id="demo-heading" className="text-[17px] font-semibold tracking-[-0.02em]">Try a demonstration organisation</h2>
      <p className="mt-1 text-[14px] text-muted">Real public data, invented company. Pick a role to see what that person sees.</p>
      {error && <div className="mt-3"><FormMessage kind="error">{error}</FormMessage></div>}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {orgs.map(([slug, name]) => (
          <div key={slug} className="rounded-xl border border-line bg-surface p-5">
            <div className="text-[15px] font-semibold">{name}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {accounts.filter((a) => a.organisation_slug === slug).map((a) => (
                <Button key={a.role} size="sm" data-testid={`demo-${slug}-${a.role}`} disabled={busy !== null} onClick={() => go(slug, a.role)} title={`${a.first_name} ${a.last_name}, ${a.job_title}`}>
                  {busy === `${slug}:${a.role}` ? 'Signing in…' : a.role}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const notice = params.get('expired') ? 'Your session ended. Sign in again.' : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      setUser(await auth.login({ email, password }));
      nav(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back."
      wide
      footer={<>New to Aravalli? <Link to="/signup" className={authLink}>Create an organisation</Link></>}
    >
      <div className="mx-auto max-w-[400px]">
        {notice && <FormMessage kind="ok">{notice}</FormMessage>}
        {errors._form && <FormMessage kind="error">{errors._form}</FormMessage>}
        <form onSubmit={submit} noValidate>
          <Field label="Email" error={errors.email}>
            {(p) => <Input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Field label="Password" error={errors.password}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <p className="mt-4 text-[13px] text-muted">Forgot your password? Ask your organisation's Org Admin to set a new one.</p>
        </form>
      </div>
      <DemoLogins />
    </AuthShell>
  );
}
