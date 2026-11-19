import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
  /** When set the button is inert and shows this text as a tooltip. */
  disabledReason?: string;
  /** Render as a link to this route (unless disabled). */
  to?: string;
  children: ReactNode;
}

const VARIANT = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
};
const SIZE = { md: 'h-10 px-4 text-[14px]', sm: 'h-8 px-3 text-[13px]' };
const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]';

/** The one button. Primary (jade) is for the single main action on a screen. */
export function Button({ variant = 'secondary', size = 'md', disabledReason, to, className = '', onClick, type = 'button', children, ...rest }: Props) {
  const blocked = Boolean(disabledReason);
  const classes = `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`;

  if (to && !blocked && !rest.disabled) {
    return <Link to={to} className={classes}>{children}</Link>;
  }

  const btn = (
    <button
      {...rest}
      type={type}
      aria-disabled={blocked || rest.disabled || undefined}
      onClick={blocked ? (e) => e.preventDefault() : onClick}
      className={`${classes} ${blocked || rest.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
    >
      {children}
    </button>
  );
  if (!blocked) return btn;
  return (
    <span className="tip-host relative inline-flex">
      {btn}
      <span role="tooltip" className="tip absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-normal text-fg shadow-pop">
        {disabledReason}
      </span>
    </span>
  );
}
