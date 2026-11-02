import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useMeta } from './providers';
import { PRODUCT } from './brand';
import { PageHeader } from '../components/ui/PageHeader';
import { PageSkeleton } from '../components/ui/states';

interface Props { title: string; code?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }

/** Page header plus a simulated 200–300ms data boundary on navigation, so loading states are real. */
export function Page({ title, code, description, actions, children }: Props) {
  const { setMeta } = useMeta();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMeta({ title });
    document.title = `${code ? `${code} · ` : ''}${title} · ${PRODUCT.name}`;
  }, [title, code, setMeta]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 200 + Math.random() * 100);
    return () => clearTimeout(t);
  }, [pathname]);

  if (loading) return <PageSkeleton />;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
      <PageHeader title={title} code={code} description={description} actions={actions} />
      {children}
    </motion.div>
  );
}
