// The public landing page. One 3D object (the hero heat map), everything else is plain HTML and CSS with small, quiet motion.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { bandFor } from '@aravalli/shared';
import { PRODUCT } from '../../app/brand';
import { ThemeToggle } from '../../components/ui/theme';
import { HeatTilesFallback } from './HeatTiles3D';

const HeatTiles3D = lazy(() => import('./HeatTiles3D'));

const container = 'mx-auto w-full max-w-[1180px] px-4 md:px-10';
const primaryBtn = 'inline-flex h-12 items-center justify-center rounded-lg bg-accent px-6 text-[16px] font-medium text-accent-fg transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98]';
const secondaryBtn = 'inline-flex h-12 items-center justify-center rounded-lg border border-line-strong bg-surface px-6 text-[16px] font-medium transition-colors duration-150 hover:bg-surface-2';

/** Fades and lifts a block into place once, as it scrolls into view. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

// ------------------------------------------------------------------------------------------------------------ navbar
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`sticky top-0 z-50 border-b transition-colors duration-200 ${scrolled ? 'border-line bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur' : 'border-transparent bg-bg'}`}>
      <div className={`${container} flex h-[68px] items-center gap-4`}>
        <Link to="/" className="flex items-center gap-3" aria-label={`${PRODUCT.name} home`}>
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-fg text-[17px] font-bold text-bg">{PRODUCT.name[0]}</span>
          <span className="text-[17px] font-semibold tracking-[-0.02em]">{PRODUCT.name}</span>
        </Link>
        <nav aria-label="Sections" className="ml-8 hidden items-center gap-6 text-[14px] text-muted md:flex">
          <a href="#product" className="hover:text-fg">Product</a>
          <a href="#features" className="hover:text-fg">Features</a>
          <a href="#pricing" className="hover:text-fg">Pricing</a>
          <a href="#faq" className="hover:text-fg">FAQ</a>
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

// -------------------------------------------------------------------------------------------------------------- hero
function Hero() {
  return (
    <section className={`${container} grid items-center gap-10 pb-16 pt-12 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr]`}>
      <div>
        <p className="mb-5 text-[14px] font-medium text-muted">Enterprise risk and incident management</p>
        <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[60px] lg:text-[68px]">See the risk before it becomes the incident.</h1>
        <p className="mt-6 max-w-xl text-[18px] leading-8 text-muted">
          Register risks with an accountable owner, score them over time, and follow every incident to resolution. One place for the whole organisation,
          with each person seeing exactly what their role allows.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/signup" className={primaryBtn}>Start free</Link>
          <Link to="/login" className={secondaryBtn}>Try a live demo</Link>
        </div>
        <p className="mt-5 text-[13px] text-subtle">No card needed. The demo runs on real public safety and IT-service data.</p>
      </div>
      <div className="relative h-[340px] sm:h-[420px] lg:h-[500px]" data-testid="hero-visual">
        <Suspense fallback={<HeatTilesFallback />}>
          <HeatTiles3D />
        </Suspense>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------------------------------- product screenshot
/** The product's own dashboard, tilted back and flattening as it scrolls into view. */
function ProductShot() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.95', 'start 0.3'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 26, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.92, 1]);
  const [missing, setMissing] = useState(false);
  return (
    <section id="product" className={`${container} pb-20 md:pb-28`} aria-labelledby="product-title">
      <Reveal>
        <h2 id="product-title" className="max-w-2xl text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[40px]">The whole picture on one page</h2>
        <p className="mt-3 max-w-2xl text-[17px] leading-7 text-muted">Open risks, open incidents, how long things take to resolve, and where the risk sits. Every figure links to the records behind it.</p>
      </Reveal>
      <div ref={ref} className="mt-10" style={{ perspective: 1500 }}>
        <motion.div style={{ rotateX, scale, transformOrigin: '50% 0%' }} className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-pop" data-testid="product-shot">
          {missing ? (
            <div className="flex aspect-[16/9] items-center justify-center text-muted">Product screenshot</div>
          ) : (
            <>
              <img src="/landing/dashboard-light.png" alt="The Aravalli overview dashboard: open risks, open incidents, a risk heat map and the highest-scoring risks" width={1600} height={1000} loading="lazy" className="theme-light-only block w-full" onError={() => setMissing(true)} />
              <img src="/landing/dashboard-dark.png" alt="" aria-hidden="true" width={1600} height={1000} loading="lazy" className="theme-dark-only block w-full" onError={() => setMissing(true)} />
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------ industries
const INDUSTRIES = ['Manufacturing', 'IT and managed services', 'Logistics and warehousing', 'Healthcare', 'Financial services', 'Energy and utilities', 'Construction', 'Retail and hospitality'];

function Industries() {
  return (
    <section className="border-y border-line py-10" aria-labelledby="industries-title">
      <div className={container}>
        <h2 id="industries-title" className="text-center text-[14px] font-medium text-muted">Built for organisations that run on safety, uptime and compliance</h2>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3 text-[17px] font-medium tracking-[-0.01em]">
          {INDUSTRIES.map((i) => <li key={i} className="text-fg">{i}</li>)}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------ bento
function MiniHeat() {
  return (
    <div aria-hidden="true" className="grid w-full max-w-[220px] grid-cols-5 gap-1">
      {Array.from({ length: 25 }, (_, n) => {
        const l = 5 - Math.floor(n / 5);
        const i = (n % 5) + 1;
        return <div key={n} className={`aspect-square rounded-[4px] band-${bandFor(l * i).toLowerCase()}`} />;
      })}
    </div>
  );
}

function MiniTimeline() {
  const rows = [['Reported', 'Open'], ['Investigation started', 'Investigating'], ['Hazard contained', 'Contained'], ['Corrective action verified', 'Resolved']];
  return (
    <ol aria-hidden="true" className="w-full space-y-2.5 text-[13px]">
      {rows.map(([text, status], i) => (
        <li key={text} className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === rows.length - 1 ? 'bg-accent' : 'bg-line-strong'}`} />
          <span className="min-w-0 flex-1 truncate">{text}</span>
          <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">{status}</span>
        </li>
      ))}
    </ol>
  );
}

function MiniRoles() {
  const roles = ['Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'];
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {roles.map((r, i) => <span key={r} className={`rounded-full border px-3 py-1 text-[13px] ${i === 3 ? 'border-fg' : 'border-line-strong text-muted'}`}>{r}</span>)}
    </div>
  );
}

function MiniScore() {
  const pts = [4, 6, 6, 9, 12, 12, 16, 20];
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * 200} ${70 - p * 3}`).join(' ');
  return (
    <svg aria-hidden="true" viewBox="0 0 200 76" className="w-full max-w-[260px]">
      <path d={path} fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="200" cy={70 - 20 * 3} r="4.5" fill="var(--accent)" />
    </svg>
  );
}

function MiniTenants() {
  return (
    <div aria-hidden="true" className="flex w-full items-center gap-3 text-[13px]">
      <div className="flex-1 rounded-lg border border-line-strong p-3"><div className="font-medium">Your organisation</div><div className="mt-1 text-muted">All of its risks, incidents and people</div></div>
      <div className="h-10 w-px bg-line-strong" />
      <div className="flex-1 rounded-lg border border-dashed border-line p-3 text-subtle"><div className="font-medium">Everyone else</div><div className="mt-1">Not found. Not even a hint.</div></div>
    </div>
  );
}

function Bento() {
  const cell = 'flex flex-col justify-between rounded-xl border border-line bg-surface p-6';
  const title = 'text-[19px] font-semibold tracking-[-0.02em]';
  const body = 'mt-1.5 text-[15px] leading-6 text-muted';
  return (
    <section id="features" className={`${container} py-20 md:py-28`} aria-labelledby="features-title">
      <Reveal>
        <h2 id="features-title" className="max-w-2xl text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[40px]">Built around how risk work actually goes</h2>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-6">
        <Reveal className={`${cell} md:col-span-3`}>
          <div className="mb-8"><MiniHeat /></div>
          <div><h3 className={title}>A heat map you can trust</h3><p className={body}>Likelihood times impact, scored by the database and never by a spreadsheet. Click a cell to see exactly which risks sit there.</p></div>
        </Reveal>
        <Reveal delay={0.05} className={`${cell} md:col-span-3`}>
          <div className="mb-8"><MiniTimeline /></div>
          <div><h3 className={title}>Incidents with a trail</h3><p className={body}>Every status change is a permanent entry in the incident&apos;s log. Closed means closed: nobody rewrites history.</p></div>
        </Reveal>
        <Reveal className={`${cell} md:col-span-2`}>
          <div className="mb-8"><MiniScore /></div>
          <div><h3 className={title}>Scores with history</h3><p className={body}>Reassess as often as you like. Each assessment is kept, so you can see whether a risk is getting better.</p></div>
        </Reveal>
        <Reveal delay={0.05} className={`${cell} md:col-span-2`}>
          <div className="mb-8"><MiniRoles /></div>
          <div><h3 className={title}>Five roles, enforced on the server</h3><p className={body}>Org Admin, Risk Officer, Department Head, Auditor, Employee. A hidden button is never the only lock.</p></div>
        </Reveal>
        <Reveal delay={0.1} className={`${cell} md:col-span-2`}>
          <div className="mb-8"><MiniTenants /></div>
          <div><h3 className={title}>Your data stays yours</h3><p className={body}>Every organisation is isolated. Another company&apos;s records answer &ldquo;not found&rdquo;, however they ask.</p></div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------- testimonial
function Testimonial() {
  return (
    <section className={`${container} pb-20 md:pb-28`} aria-label="Testimonial">
      <Reveal>
        <figure className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-8 md:p-12">
          <span className="mb-6 inline-block rounded-md border border-dashed border-fg px-2 py-1 text-[12px] font-medium" data-testid="placeholder-tag">Placeholder: not a real customer</span>
          <blockquote className="text-[22px] font-medium leading-9 tracking-[-0.02em] md:text-[26px]">
            &ldquo;Before, our incident list lived in three spreadsheets and nobody trusted any of them. Now the Monday review takes twenty minutes.&rdquo;
          </blockquote>
          <figcaption className="mt-6 text-[14px] text-muted">Name Surname, Head of Risk, Company Name <span className="text-subtle">(replace this quote with a real one before launch)</span></figcaption>
        </figure>
      </Reveal>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------- pricing
interface Plan { name: string; monthly: number | null; blurb: string; features: string[]; cta: string; featured?: boolean }
const PLANS: Plan[] = [
  { name: 'Starter', monthly: 0, blurb: 'For a small team getting its first register in order.', features: ['Up to 10 people', 'Risk and incident registers', 'Heat map and basic reports', 'Email invitations'], cta: 'Start free' },
  { name: 'Professional', monthly: 49, blurb: 'For organisations that report to auditors and boards.', features: ['Up to 250 people', 'All five roles, department scoping', 'Full reports and CSV export', 'Priority support'], cta: 'Start free', featured: true },
  { name: 'Enterprise', monthly: null, blurb: 'For groups with many sites and special requirements.', features: ['Unlimited people', 'Single sign-on and audit exports', 'Data import assistance', 'A named contact'], cta: 'Talk to us' },
];

function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <section id="pricing" className={`${container} pb-20 md:pb-28`} aria-labelledby="pricing-title">
      <Reveal className="text-center">
        <h2 id="pricing-title" className="text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[40px]">Simple pricing</h2>
        <p className="mx-auto mt-3 max-w-xl text-[17px] text-muted">Pay for people, not for features. Prices are for display: this version takes no payments.</p>
        <div role="radiogroup" aria-label="Billing period" className="mt-7 inline-flex rounded-lg border border-line p-0.5">
          {([['Monthly', false], ['Yearly (2 months free)', true]] as const).map(([label, value]) => (
            <button key={label} type="button" role="radio" aria-checked={yearly === value} onClick={() => setYearly(value)}
              className={`h-9 rounded-md px-4 text-[14px] font-medium transition-colors ${yearly === value ? 'bg-fg text-bg' : 'text-muted hover:text-fg'}`}>
              {label}
            </button>
          ))}
        </div>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PLANS.map((p, n) => {
          const price = p.monthly === null ? null : yearly ? Math.round((p.monthly * 10) / 12) : p.monthly;
          return (
            <Reveal key={p.name} delay={n * 0.05} className={`flex flex-col rounded-xl border p-7 ${p.featured ? 'border-fg bg-surface' : 'border-line bg-surface'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-[19px] font-semibold">{p.name}</h3>
                {p.featured && <span className="rounded-md bg-accent px-2 py-0.5 text-[12px] font-medium text-accent-fg">Most chosen</span>}
              </div>
              <p className="mt-2 text-[14px] text-muted">{p.blurb}</p>
              <div className="mt-6 flex items-baseline gap-1.5" data-testid={`price-${p.name}`}>
                {price === null ? <span className="text-[34px] font-bold tracking-[-0.03em]">Custom</span> : (
                  <>
                    <span className="num text-[44px] font-semibold leading-none tracking-[-0.04em]">${price}</span>
                    <span className="text-[14px] text-muted">{price === 0 ? 'free' : 'per user / month'}</span>
                  </>
                )}
              </div>
              <div className="h-5 text-[13px] text-subtle">{price !== null && price > 0 && yearly ? 'billed yearly' : ''}</div>
              <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                {p.features.map((f) => <li key={f} className="flex gap-2.5"><span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg" />{f}</li>)}
              </ul>
              <Link to="/signup" className={`mt-7 ${p.featured ? primaryBtn : secondaryBtn}`}>{p.cta}</Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------- FAQ
const FAQ: Array<[string, string]> = [
  ['Is my data kept apart from other companies?', 'Yes. Every record belongs to exactly one organisation, and the server decides which one from your sign-in, never from anything the browser sends. Asking for another organisation’s record gets the same answer as asking for one that does not exist.'],
  ['Who can see and change what?', 'Org Admins manage everything in their organisation. Risk Officers manage all risks and incidents but not users. Department Heads act only within their own department. Auditors can read everything and change nothing. Employees report incidents and see only the ones they reported or were given.'],
  ['Where does the demo data come from?', 'The two demo organisations are invented companies filled with real public records: OSHA severe injury reports for the manufacturer, and an anonymised ServiceNow incident log from the UCI repository for the IT services firm. Dates are shifted forward so the data looks current, and the original dates are kept on each record.'],
  ['How do I bring my team in?', 'Sign up, then invite people by email from the Users screen, choosing each person’s role and department in advance. Invitations expire after a week.'],
  ['Can I get my data out?', 'Registers export to CSV and every report prints cleanly. Nothing is locked in.'],
  ['What does it cost?', 'The Starter plan is free. The prices above are placeholders for this version: no payment is taken and nothing is charged.'],
];

function Faq() {
  return (
    <section id="faq" className={`${container} pb-20 md:pb-28`} aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl">
        <Reveal><h2 id="faq-title" className="text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[40px]">Questions</h2></Reveal>
        <div className="mt-8 border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-[18px] leading-none transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- closing call to action
function FinalCta() {
  return (
    <section className={`${container} pb-20 md:pb-28`} aria-labelledby="cta-title">
      <Reveal>
        <div className="rounded-xl bg-fg px-6 py-14 text-center text-bg md:px-12 md:py-20">
          <h2 id="cta-title" className="mx-auto max-w-2xl text-[32px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[44px]">Start with the risks you already know about.</h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] opacity-75">Create an organisation, add your first risk and invite your team in an afternoon.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className={primaryBtn}>Start free</Link>
            <Link to="/login" className="inline-flex h-12 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--bg)_35%,transparent)] px-6 text-[16px] font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--bg)_12%,transparent)]">Try a live demo</Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line py-10 text-[14px] text-muted">
      <div className={`${container} flex flex-wrap items-start justify-between gap-8`}>
        <div className="max-w-sm">
          <div className="flex items-center gap-3 text-fg">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-[15px] font-bold text-bg">{PRODUCT.name[0]}</span>
            <span className="text-[16px] font-semibold tracking-[-0.02em]">{PRODUCT.name}</span>
          </div>
          <p className="mt-3">Enterprise risk and incident management.</p>
        </div>
        <div className="max-w-md">
          <p className="font-medium text-fg">Demonstration data</p>
          <p className="mt-1">Incidents in the demo organisations are real public records: OSHA Severe Injury Reports (US Department of Labor) and the UCI ServiceNow incident event log (CC BY 4.0). The companies themselves are invented.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2">
          <Link to="/login" className="hover:text-fg">Sign in</Link>
          <Link to="/signup" className="hover:text-fg">Create an organisation</Link>
          <a href="#pricing" className="hover:text-fg">Pricing</a>
          <a href="#faq" className="hover:text-fg">FAQ</a>
        </nav>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => { document.title = `${PRODUCT.name}: enterprise risk and incident management`; }, []);
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main>
        <Hero />
        <Industries />
        <ProductShot />
        <Bento />
        <Testimonial />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
