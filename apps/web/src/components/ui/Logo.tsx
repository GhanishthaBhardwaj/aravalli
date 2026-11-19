import { PRODUCT } from '../../app/brand';

/** The mountain mark, drawn in the brand colour. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M2 19l6.5-10 4 6 3-4.5L22 19H2z" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5 text-[17px] font-[650] tracking-[-0.01em]">
      <LogoMark size={size} />
      {PRODUCT.name}
    </span>
  );
}
