import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  /** A record code shown in the mono face above the title, e.g. RSK-0012. */
  code?: string;
  actions?: ReactNode;
  /** A long title taken from a record (an incident): smaller type, so it does not fill the screen. */
  compact?: boolean;
}

/** Big, bold page headline with room around it. */
export function PageHeader({ title, description, code, actions, compact }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0 max-w-3xl">
        {code && <div className="code mb-2 text-[14px] text-subtle">{code}</div>}
        <h1 className={`page-title break-words font-bold tracking-[-0.035em] ${compact ? 'text-[24px] leading-[1.2] sm:text-[28px]' : 'text-[30px] leading-[1.1] sm:text-[40px]'}`}>{title}</h1>
        {description && <p className="mt-3 text-[16px] leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
