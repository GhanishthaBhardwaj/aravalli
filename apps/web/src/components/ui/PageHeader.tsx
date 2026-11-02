import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  /** A record code shown in the mono face above the title, e.g. RSK-0012. */
  code?: string;
  actions?: ReactNode;
}

/** Big, bold page headline with room around it. */
export function PageHeader({ title, description, code, actions }: Props) {
  return (
    <header className="mb-12 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0 max-w-3xl">
        {code && <div className="num mb-2 text-[14px] text-subtle">{code}</div>}
        <h1 className="break-words text-[34px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[46px]">{title}</h1>
        {description && <p className="mt-4 text-[17px] leading-7 text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
