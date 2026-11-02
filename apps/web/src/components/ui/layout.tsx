import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A bordered surface. Used sparingly: most content sits on the page, divided by rules. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** A titled part of a page, opened by a heading and a rule. */
export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 className="text-[19px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A label above a value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-subtle">{label}</dt>
      <dd className="mt-0.5 text-[15px]">{children}</dd>
    </div>
  );
}

/** A record code such as RSK-0012, in the mono face, linking to the record. */
export function IdLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="num whitespace-nowrap text-[13px] font-medium underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** A big figure with its label. No icon, no box: the number is the design. */
export function Figure({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div>
      <div className="num text-[40px] font-semibold leading-none">{value}</div>
      <div className="mt-2 text-[14px] font-medium">{label}</div>
      {note && <div className="text-[13px] text-muted">{note}</div>}
    </div>
  );
}
