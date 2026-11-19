import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PRODUCT } from '../../app/brand';
import { Logo } from '../../components/ui/Logo';
import { ThemeToggle } from '../../components/ui/theme';

/** The frame around every signed-out form: logo, a card, a way home. */
export function AuthShell({ title, subtitle, children, footer, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => { document.title = `${title} · ${PRODUCT.name}`; }, [title]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-4 py-5 md:px-10">
        <Link to="/" aria-label={`${PRODUCT.name} home`}><Logo /></Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:pt-14">
        <div className={`w-full ${wide ? 'max-w-[760px]' : 'max-w-[440px]'}`}>
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[38px]">{title}</h1>
          {subtitle && <p className="mt-3 text-[16px] leading-6 text-muted">{subtitle}</p>}
          <div className="mt-8 rounded-xl border border-line bg-surface p-6 sm:p-8">{children}</div>
          {footer && <div className="mt-6 text-center text-[14px] text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const authLink = 'font-medium text-accent underline-offset-4 hover:underline';

/** A message at the top of a form: a problem (announced to screen readers) or a confirmation. */
export function FormMessage({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-5 rounded-lg border px-4 py-3 text-[14px] ${kind === 'error' ? 'border-[color:var(--sev-critical)] bg-surface-2 font-medium' : 'border-line-strong bg-surface-2 text-fg'}`}
    >
      {children}
    </div>
  );
}
