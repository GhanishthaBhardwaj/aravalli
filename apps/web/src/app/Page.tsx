import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useMeta } from './providers';
import { PRODUCT } from './brand';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, PageSkeleton } from '../components/ui/states';

interface Props {
  title: string;
  code?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** The page's main request is still running for the first time. */
  loading?: boolean;
  /** The page's main request failed. */
  error?: Error | null;
  onRetry?: () => void;
  children: ReactNode;
}

/** Page header plus the loading and error states of the page's main request. */
export function Page({ title, code, description, actions, loading, error, onRetry, children }: Props) {
  const { setMeta } = useMeta();

  useEffect(() => {
    setMeta({ title });
    document.title = `${code ? `${code} · ` : ''}${title} · ${PRODUCT.name}`;
  }, [title, code, setMeta]);

  if (loading) return <PageSkeleton />;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
      <PageHeader title={title} code={code} description={description} actions={actions} />
      {error ? <ErrorState title="This page could not be loaded" body={error.message} onRetry={onRetry} /> : children}
    </motion.div>
  );
}
