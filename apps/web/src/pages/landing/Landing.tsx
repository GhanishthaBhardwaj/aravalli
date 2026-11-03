// The public landing page: what the product is, a real screenshot, who can do what, and where the demo data comes from.
// One 3D object (the hero heat map); everything else is plain HTML.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { PRODUCT } from '../../app/brand';
import { ThemeToggle } from '../../components/ui/theme';
import { HeatTilesFallback } from './HeatTiles3D';

const HeatTiles3D = lazy(() => import('./HeatTiles3D'));

const container = 'mx-auto w-full max-w-[1100px] px-4 md:px-10';
const primaryBtn = 'inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-[15px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover';
const secondaryBtn = 'inline-flex h-11 items-center justify-center rounded-lg border border-line-strong px-5 text-[15px] font-medium transition-colors duration-150 hover:bg-surface-2';

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className={`${container} flex h-16 items-center gap-4`}>
        <Link to="/" className="flex items-center gap-2.5" aria-label={`${PRODUCT.name} home`}>
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-md bg-fg text-[16px] font-bold text-bg">{PRODUCT.name[0]}</span>
          <span className="text-[16px] font-semibold tracking-[-0.02em]">{PRODUCT.name}</span>
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-5 text-[14px] text-muted md:flex">
          <a href="#product" className="hover:text-fg">Screenshot</a>
          <a href="#roles" className="hover:text-fg">Who can do what</a>
          <a href="#data" className="hover:text-fg">Demo data</a>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:block"><ThemeToggle /></div>
          <Link to="/login" className="hidden h-10 items-center rounded-lg px-3 text-[14px] font-medium hover:bg-surface-2 sm:inline-flex">Sign in</Link>
          <Link to="/signup" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition-colors hover:bg-accent-hover">Start free</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={`${container} grid items-center gap-8 pb-14 pt-10 md:pb-20 md:pt-16 lg:grid-cols-[1.1fr_0.9fr]`}>
      <div>
        <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Keep your risks and incidents in one place.</h1>
        <p className="mt-5 max-w-lg text-[17px] leading-7 text-muted">
          Write down what could go wrong, score it, and name who is responsible. When something does go wrong, log it, assign it and follow it to the end.
          Each person sees only what their role allows.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/signup" className={primaryBtn}>Start free</Link>
          <Link to="/login" className={secondaryBtn}>Open the demo</Link>
        </div>
      </div>
      <div className="relative h-[320px] sm:h-[400px]" data-testid="hero-visual">
        <Suspense fallback={<HeatTilesFallback />}>
          <HeatTiles3D />
        </Suspense>
      </div>
    </section>
  );
}

/** The product's own dashboard, tilted back and flattening as it scrolls into view. */
function ProductShot() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.95', 'start 0.3'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.94, 1]);
  const [missing, setMissing] = useState(false);
  return (
    <section id="product" className={`${container} pb-20`} aria-label="Screenshot of the overview">
      <p className="mb-4 text-[14px] text-muted">The overview screen, with the Ironbridge demo data.</p>
      <div ref={ref} style={{ perspective: 1500 }}>
        <motion.div style={{ rotateX, scale, transformOrigin: '50% 0%' }} className="overflow-hidden rounded-lg border border-line-strong bg-surface" data-testid="product-shot">
          {missing ? (
            <div className="flex aspect-[16/10] items-center justify-center text-muted">Screenshot</div>
          ) : (
            <>
              <img src="/landing/dashboard-light.png" alt="The Aravalli overview: open risks, open incidents, a risk heat map and the highest-scoring risks" width={1600} height={1000} loading="lazy" className="theme-light-only block w-full" onError={() => setMissing(true)} />
              <img src="/landing/dashboard-dark.png" alt="" aria-hidden="true" width={1600} height={1000} loading="lazy" className="theme-dark-only block w-full" onError={() => setMissing(true)} />
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

const PARTS: Array<[string, string]> = [
  ['Risk register', 'Each risk has an owner, a category and a score (likelihood times impact, 1 to 25). Every re-assessment is kept, so you can see whether a risk is getting better or worse.'],
  ['Incidents', 'Log what happened, set a severity, assign it, and move it through Open, Investigating, Contained, Resolved and Closed. Every change is a permanent entry in its log.'],
  ['Heat map and reports', 'Where the risk sits, how long incidents take to resolve, and which departments carry the most. Export to CSV or print.'],
  ['People and access', 'The admin adds people with a role and a department. Another organisation can never see your records.'],
];

function Parts() {
  return (
    <section className={`${container} pb-20`} aria-label="What is in it">
      <dl className="border-t border-line">
        {PARTS.map(([term, text]) => (
          <div key={term} className="grid gap-1 border-b border-line py-5 md:grid-cols-[240px_1fr] md:gap-8">
            <dt className="text-[16px] font-semibold">{term}</dt>
            <dd className="text-[15px] leading-7 text-muted">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ROLE_ROWS: Array<[string, string, string]> = [
  ['Org Admin', 'Everything in their organisation, including adding people and setting passwords.', 'Everything'],
  ['Risk Officer', 'All risks and incidents. Cannot manage users.', 'Everything except users'],
  ['Department Head', 'Risks and incidents of their own department only.', 'Their department'],
  ['Auditor', 'Nothing: read-only.', 'Everything, read-only'],
  ['Employee', 'Report incidents; update the ones they reported or were given.', 'Only their own incidents'],
];

function Roles() {
  return (
    <section id="roles" className={`${container} pb-20`} aria-labelledby="roles-title">
      <h2 id="roles-title" className="text-[26px] font-bold tracking-[-0.03em]">Who can do what</h2>
      <p className="mt-2 max-w-xl text-[15px] text-muted">The server enforces this on every request. Hiding a button in the screen is never the only lock.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line">
        <table className="tbl min-w-[620px]">
          <thead><tr><th>Role</th><th>Can change</th><th>Can see</th></tr></thead>
          <tbody>
            {ROLE_ROWS.map(([role, change, see]) => <tr key={role}><td className="font-medium">{role}</td><td>{change}</td><td className="text-muted">{see}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DemoData() {
  return (
    <section id="data" className={`${container} pb-20`} aria-labelledby="data-title">
      <h2 id="data-title" className="text-[26px] font-bold tracking-[-0.03em]">About the demo data</h2>
      <div className="mt-3 max-w-2xl space-y-3 text-[15px] leading-7 text-muted">
        <p>
          The two demonstration organisations are invented companies filled with <strong className="font-semibold text-fg">real public records</strong>:
          US OSHA severe injury reports for the manufacturer (Ironbridge), and an anonymised ServiceNow incident log from the UCI Machine Learning Repository
          (CC BY 4.0) for the IT services firm (Meridian). The staff and the risk registers are made up.
        </p>
        <p>Dates are shifted forward so the data looks current. The original date stays on every incident, and every screen of a demo organisation says so.</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line py-8 text-[14px] text-muted">
      <div className={`${container} flex flex-wrap items-center justify-between gap-4`}>
        <span>{PRODUCT.name}: risk and incident management.</span>
        <nav aria-label="Footer" className="flex gap-5">
          <Link to="/login" className="hover:text-fg">Sign in</Link>
          <Link to="/signup" className="hover:text-fg">Create an organisation</Link>
        </nav>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => { document.title = `${PRODUCT.name}: risk and incident management`; }, []);
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main>
        <Hero />
        <ProductShot />
        <Parts />
        <Roles />
        <DemoData />
      </main>
      <Footer />
    </div>
  );
}
