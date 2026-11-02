import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useMeta } from './providers';
import { PRODUCT } from './brand';
import { PageSkeleton } from '../components/ui/misc';

interface Props { title: string; description?: string; actions?: ReactNode; children: ReactNode }

/** Page header (title, one-line description, actions) plus a simulated 200–300ms data boundary on navigation. */
export function Page({ title, description, actions, children }: Props) {
  const { setMeta } = useMeta();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMeta({ title });
    document.title = `${title} · ${PRODUCT.name}`;
  }, [title, setMeta]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 200 + Math.random() * 100);
    return () => clearTimeout(t);
  }, [pathname]);

  if (loading) return <PageSkeleton />;
  return (
    <div className="fade mx-auto max-w-[1280px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="break-words">{title}</h1>
          {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
        </div>
        {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
