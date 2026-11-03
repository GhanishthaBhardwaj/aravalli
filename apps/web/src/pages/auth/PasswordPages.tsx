import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { validatePassword } from '@aravalli/shared';
import { auth, fieldErrors } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/fields';
import { AuthShell, authLink, FormMessage } from './AuthShell';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.forgot(email.trim());
      setSent(true);
    } catch (err) {
      setError(fieldErrors(err)._form ?? 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send a link to choose a new one." footer={<Link to="/login" className={authLink}>Back to sign in</Link>}>
      {sent ? (
        <FormMessage kind="ok">If that address has an account, a reset link is on its way. It works once and expires in an hour.</FormMessage>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Field label="Email">
            {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(password);
    if (problem) { setErrors({ password: problem }); return; }
    setBusy(true);
    setErrors({});
    try {
      await auth.reset(token, password);
      nav('/login?reset=1', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Choose a new password" footer={<Link to="/forgot-password" className={authLink}>Ask for a new link</Link>}>
        <FormMessage kind="error">This link is incomplete. Open the link from the email again, or ask for a new one.</FormMessage>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed out everywhere and asked to sign in again.">
      {(errors._form || errors.token) && <FormMessage kind="error">{errors._form ?? errors.token}{' '}<Link to="/forgot-password" className={authLink}>Ask for a new link</Link></FormMessage>}
      <form onSubmit={submit} noValidate>
        <Field label="New password" error={errors.password} hint="At least 10 characters, with a letter and a number.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</Button>
      </form>
    </AuthShell>
  );
}
