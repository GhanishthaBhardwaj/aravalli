import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import type { Permission } from '@aravalli/shared';
import { Layout } from './Layout';
import { useAuth, useSession } from './providers';
import { Home } from '../pages/Home';
import { RiskRegister } from '../pages/RiskRegister';
import { RiskNew } from '../pages/RiskNew';
import { RiskDetail } from '../pages/RiskDetail';
import { HeatMapPage } from '../pages/HeatMapPage';
import { IncidentRegister } from '../pages/IncidentRegister';
import { IncidentNew } from '../pages/IncidentNew';
import { IncidentDetail } from '../pages/IncidentDetail';
import { Departments } from '../pages/Departments';
import { People } from '../pages/People';
import { Reports } from '../pages/Reports';
import { Users } from '../pages/Users';
import { NotFound } from '../pages/NotFound';
import { Login, safeNext } from '../pages/auth/Login';
import { Signup } from '../pages/auth/Signup';
import { ErrorState, PageSkeleton, RouteErrorBoundary } from '../components/ui/states';

// The landing page carries the 3D library; it is loaded only for visitors who are not signed in.
const Landing = lazy(() => import('../pages/landing/Landing'));

/** Development only: a screen that crashes on purpose, to prove the error state works. */
function Crash(): never {
  throw new Error('Deliberate crash to test the error state');
}

/** A signed-in screen that the role may not use at all: say so plainly (the server refuses it too). */
function Allowed({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, actor } = useSession();
  if (can(permission)) return <>{children}</>;
  return <ErrorState title="Not available for your role" body={`${actor.role}s cannot open this page.`} />;
}

function SignedIn() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/risks" element={<Allowed permission="risk.read"><RiskRegister /></Allowed>} />
          <Route path="/risks/new" element={<Allowed permission="risk.read"><RiskNew /></Allowed>} />
          <Route path="/risks/heatmap" element={<Allowed permission="report.read"><HeatMapPage /></Allowed>} />
          <Route path="/risks/:code" element={<Allowed permission="risk.read"><RiskDetail /></Allowed>} />
          <Route path="/incidents" element={<IncidentRegister />} />
          <Route path="/incidents/new" element={<IncidentNew />} />
          <Route path="/incidents/:code" element={<IncidentDetail />} />
          <Route path="/departments" element={<Allowed permission="directory.read"><Departments /></Allowed>} />
          <Route path="/people" element={<Allowed permission="directory.read"><People /></Allowed>} />
          <Route path="/reports" element={<Allowed permission="report.read"><Reports /></Allowed>} />
          <Route path="/users" element={<Allowed permission="user.manage"><Users /></Allowed>} />
          {import.meta.env.DEV && <Route path="/__crash" element={<Crash />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </RouteErrorBoundary>
    </Layout>
  );
}

function Splash() {
  return <div className="mx-auto max-w-[1180px] px-4 py-14 md:px-10"><PageSkeleton /></div>;
}

/** Decides what a visitor sees at any address that is not one of the public forms. */
function Gate() {
  const { status, error, retry } = useAuth();
  const { pathname, search } = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'error') return <div className="mx-auto max-w-[1180px] px-4 py-14 md:px-10"><ErrorState title="Aravalli can't load" body={error} onRetry={retry} /></div>;
  if (status === 'in') return <SignedIn />;
  if (pathname === '/') return <Suspense fallback={<Splash />}><Landing /></Suspense>;
  return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
}

/** Sign-in and sign-up make no sense for someone who is already signed in. */
function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'in') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignedOutOnly><Login /></SignedOutOnly>} />
      <Route path="/signup" element={<SignedOutOnly><Signup /></SignedOutOnly>} />
      <Route path="*" element={<Gate />} />
    </Routes>
  );
}
