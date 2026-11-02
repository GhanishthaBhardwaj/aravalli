import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface Props { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Centered dialog. Escape and the backdrop close it; focus is trapped inside and handed back on close. */
export function Modal({ open, title, description, onClose, children }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0"
            style={{ background: 'var(--overlay)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
              <div>
                <h2 id={titleId} className="text-[20px] font-semibold leading-7">{title}</h2>
                {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
              </div>
              <button type="button" data-close onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg">
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
