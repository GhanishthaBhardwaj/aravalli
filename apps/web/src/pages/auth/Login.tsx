import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Role } from '@aravalli/shared';
import { auth, fieldErrors, type DemoAccount } from '../../api/client';
import { useAuth } from '../../app/providers';
import { PRODUCT } from '../../app/brand';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/fields';
import { LogoMark } from '../../components/ui/Logo';
import { authLink, FormMessage } from './AuthShell';

/** Where to go after signing in: a path inside this app only (never an address someone else typed into the link). */
export const safeNext = (raw: string | null): string => (raw && /^\/(?!\/)[\w\-./?=&%]*$/.test(raw) ? raw : '/');

/** How each demonstration organisation is shown here. Display text only: the names stored in the database do not change. */
const DEMO_DISPLAY: Record<string, { title: string; source: string }> = {
  'uci-servicenow': { title: 'ServiceNow IT incidents', source: 'UCI dataset · 24,802 tickets' },
  'osha-manufacturing': { title: 'OSHA injury reports', source: 'US Dept. of Labor · 5,481 reports' },
};
/** Short button labels so all five roles fit in one row; the full role is the tooltip and the test id. */
const ROLE_LABEL: Partial<Record<Role, string>> = { 'Department Head': 'Dept. Head' };

/** Wobbly closed curves for the dark panel on the left (the same "map lines" as the landing page). */
function contours(): string[] {
  const out: string[] = [];
  const P = { x: 420, y: 520, r: 520, k: 3, p: 0.8 };
  for (let L = 1; L <= 14; L++) {
    let d = '';
    for (let s = 0; s <= 90; s++) {
      const a = (s / 90) * Math.PI * 2;
      const wob = 1 + 0.16 * Math.sin(P.k * a + P.p + L * 0.35) + 0.08 * Math.sin((P.k + 3) * a - P.p * 1.3 + L * 0.2);
      const rad = (L / 14) * P.r * wob;
      d += `${s === 0 ? 'M' : 'L'}${(P.x + Math.cos(a) * rad).toFixed(1)} ${(P.y + Math.sin(a) * rad * 0.8).toFixed(1)} `;
    }
    out.push(`${d}Z`);
  }
  return out;
}

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
      setError(fieldErrors(e)._form ?? 'Could not log in.');
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
      <h2 id="demo-heading" className="flex items-center gap-3 text-[13px] font-normal text-muted">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        or try a demo organisation
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </h2>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {orgs.map(([slug, name], index) => (
        <div key={slug} className="form-in rounded-xl border border-line bg-bg p-3" style={{ animationDelay: `${350 + index * 90}ms` }}>
          <div className="text-[13.5px] font-semibold leading-snug">{DEMO_DISPLAY[slug]?.title ?? name}</div>
          <div className="mb-2.5 text-[12px] text-muted">{DEMO_DISPLAY[slug]?.source ?? 'Sample organisation'}</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {accounts
              .filter((a) => a.organisation_slug === slug)
              .map((a) => (
                <button
                  key={a.role}
                  type="button"
                  data-testid={`demo-${slug}-${a.role}`}
                  disabled={busy !== null}
                  onClick={() => go(slug, a.role)}
                  title={`${a.role}: ${a.first_name} ${a.last_name}, ${a.job_title}`}
                  className="min-h-[32px] whitespace-nowrap rounded-lg border border-line bg-surface px-1 py-1 text-center text-[11.5px] font-medium text-fg transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                >
                  {busy === `${slug}:${a.role}` ? '…' : (ROLE_LABEL[a.role] ?? a.role)}
                </button>
              ))}
          </div>
        </div>
      ))}
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
  const rings = useMemo(contours, []);
  const notice = params.get('expired') ? 'Your session ended. Log in again.' : '';

  useEffect(() => {
    document.title = `Log in · ${PRODUCT.name}`;
  }, []);

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
    <div className="flex min-h-screen flex-wrap bg-bg">
      {/* the dark panel on the left (a short band on a phone): always night colours */}
      <aside data-theme="dark" className="relative isolate flex flex-[1_1_380px] flex-col justify-between gap-4 overflow-hidden bg-bg p-5 text-fg md:gap-10 md:p-12">
        <svg viewBox="0 0 640 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full">
          <g className="drift-slow" fill="none" stroke="#A0D7BE" strokeOpacity="0.14">
            {rings.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
        <Link to="/" className="flex items-center gap-2.5 text-[18px] font-[650] no-underline" aria-label={`${PRODUCT.name} home`}>
          <LogoMark size={24} />
          {PRODUCT.name}
        </Link>
        <div />
        <div>
          <h2 className="fade-up-slow max-w-[16ch] text-[20px] font-bold leading-[1.15] tracking-[-0.03em] md:mb-3 md:text-[34px] md:leading-[1.08]">Every risk, every incident, one record.</h2>
        </div>
      </aside>

      <main data-theme="light" className="relative flex flex-[1_1_520px] items-center justify-center bg-surface px-4 py-6 text-fg md:px-12">
<div className="form-in flex w-full max-w-[440px] flex-col gap-4">
          <div>
            <h1 className="mb-1 text-[26px] font-bold tracking-[-0.03em]">Log in</h1>
            <p className="text-muted">
              New here? <Link to="/signup" className={authLink}>Create an organisation</Link>
            </p>
          </div>
          {notice && <FormMessage kind="ok">{notice}</FormMessage>}
          {errors._form && <FormMessage kind="error">{errors._form}</FormMessage>}
          <form onSubmit={submit} noValidate>
            <Field label="Work email" error={errors.email}>
              {(p) => <Input {...p} type="email" autoComplete="username" placeholder="you@company.com" className="!h-11 !rounded-[10px]" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Password" error={errors.password}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" className="!h-11 !rounded-[10px]" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            <Button type="submit" variant="primary" className="!h-[46px] w-full !rounded-[10px] font-semibold" disabled={busy || !email || !password}>
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
            <p className="mt-3 text-[12px] text-muted">Forgot your password? Ask your Org Admin.</p>
          </form>
          <DemoLogins />
        </div>
      </main>
    </div>
  );
}
