import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  /** When set the button is inert and shows this text as a tooltip. */
  disabledReason?: string;
}

const VARIANTS = {
  primary: 'bg-signal text-white border-signal shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:bg-[#1d4ed8]',
  secondary: 'bg-surface text-[#344054] border-[#d0d5dd] shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:bg-[var(--hover)]',
  ghost: 'border-transparent text-ink hover:bg-[var(--hover)]',
};

export function Button({ variant = 'secondary', disabledReason, className = '', onClick, type = 'button', ...rest }: Props) {
  const blocked = Boolean(disabledReason);
  const btn = (
    <button
      {...rest}
      type={type}
      aria-disabled={blocked || rest.disabled || undefined}
      onClick={blocked ? (e) => e.preventDefault() : onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 text-[14px] font-semibold transition-colors duration-150 disabled:opacity-50 ${VARIANTS[variant]} ${
        blocked ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
    />
  );
  if (!blocked) return btn;
  return (
    <span className="tip-host relative inline-flex">
      {btn}
      <span
        role="tooltip"
        className="tip panel absolute right-0 top-full z-30 mt-1 w-60 px-3 py-2 text-xs font-normal"
        style={{ boxShadow: 'var(--popover-shadow)' }}
      >
        {disabledReason}
      </span>
    </span>
  );
}
