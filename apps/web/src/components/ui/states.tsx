import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from './Button';

/** Nothing to show yet. Says what is missing and offers the next step. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Something failed. Says what, and lets the person try again. */
export function ErrorState({ title = 'Something went wrong', body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-[14px] text-muted">{body ?? 'The page could not be shown. Try again, or reload if it keeps happening.'}</p>
      <div className="mt-5 flex gap-2">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="ghost" onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

/** Shown while a page's data is loading. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-3 h-12 w-2/3 max-w-xl" />
      <Skeleton className="mb-10 h-5 w-1/2 max-w-md" />
      <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

interface BoundaryProps { children: ReactNode }
interface BoundaryState { error: Error | null }

/** Catches a render crash anywhere below it and shows an error state instead of a blank screen. */
class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Screen crashed:', error, info.componentStack); }
  render() {
    if (this.state.error) return <ErrorState onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

/** Resets itself on navigation, so one broken screen never traps you there. */
export function RouteErrorBoundary({ children }: BoundaryProps) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
