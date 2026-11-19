// The public landing page. Built to match docs/design/Main.dc.html: same text, layout and motion.
// Everything is plain HTML and CSS (see landing.css), including the 3D risk landscape. The only JavaScript is the typed
// headline, the numbers that count up, the tilt that follows the mouse, the FAQ and the demo sign-in buttons.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Role } from '@aravalli/shared';
import { auth, type DemoAccount } from '../../api/client';
import { useAuth } from '../../app/providers';
import { PRODUCT } from '../../app/brand';
import { reducedMotion } from '../../components/ui/CountUp';
import './landing.css';

const ACCENT = '#3DB58B';
const HEADLINE = 'See the next risk before it becomes an incident.';
const ROLES: Role[] = ['Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'];

/** The two demonstration organisations, named after their real sources (the same names the importers use). */
export const DEMO_ORGS = [
  { slug: 'osha-manufacturing', name: 'OSHA Severe Injury Reports · US manufacturing 2024–2025', text: 'A factory group with 5,481 real OSHA injury reports.' },
  { slug: 'uci-servicenow', name: 'UCI ServiceNow Incident Log · anonymised IT company', text: 'An IT service desk with 24,802 real ServiceNow tickets.' },
];

const SEV = { low: '#7C8B86', med: '#C9A227', high: '#E07A2F', crit: '#D2453B' };
const sevBright = { low: '#93A69D', med: '#E3C45A', high: '#F5A066', crit: '#FF7A6E' };

// ----------------------------------------------------------------------------------------------- contour lines
interface Peak { x: number; y: number; r: number; k: number; p: number }

/** Wobbly closed curves around each peak: the drifting "map" lines behind the hero and the closing section. */
function contourRings(peaks: Peak[], levels: number): string[] {
  const out: string[] = [];
  for (const P of peaks) {
    for (let L = 1; L <= levels; L++) {
      let d = '';
      for (let s = 0; s <= 90; s++) {
        const a = (s / 90) * Math.PI * 2;
        const wob = 1 + 0.16 * Math.sin(P.k * a + P.p + L * 0.35) + 0.08 * Math.sin((P.k + 3) * a - P.p * 1.3 + L * 0.2);
        const rad = (L / levels) * P.r * wob;
        d += `${s === 0 ? 'M' : 'L'}${(P.x + Math.cos(a) * rad * 1.25).toFixed(1)} ${(P.y + Math.sin(a) * rad * 0.62).toFixed(1)} `;
      }
      out.push(`${d}Z`);
    }
  }
  return out;
}

/** The stacked rings of the 3D landscape: each ring sits a little higher than the one below. */
function terrainRings() {
  const peaks = [
    { x: 245, y: 185, r: 190, n: 12, step: 8, k: 3, p: 0.6 },
    { x: 125, y: 300, r: 105, n: 7, step: 7, k: 4, p: 2.1 },
  ];
  const out: { d: string; z: number; op: string }[] = [];
  for (const P of peaks) {
    for (let L = 0; L < P.n; L++) {
      let d = '';
      for (let s = 0; s <= 72; s++) {
        const a = (s / 72) * Math.PI * 2;
        const wob = 1 + 0.14 * Math.sin(P.k * a + P.p + L * 0.5) + 0.06 * Math.sin((P.k + 2) * a - L * 0.3);
        const rad = P.r * (1 - L / P.n) * wob + 4;
        d += `${s === 0 ? 'M' : 'L'}${(P.x + Math.cos(a) * rad).toFixed(1)} ${(P.y + Math.sin(a) * rad).toFixed(1)} `;
      }
      out.push({ d: `${d}Z`, z: L * P.step, op: (0.18 + (L / P.n) * 0.45).toFixed(2) });
    }
  }
  return out;
}

const PINS = [
  { x: 245, y: 185, z: 88, h: 74, c: sevBright.crit, ring: 'rgba(210,69,59,0.25)', label: 'RSK-0042 · 20' },
  { x: 300, y: 150, z: 50, h: 50, c: sevBright.high, ring: 'rgba(224,122,47,0.2)', label: '' },
  { x: 190, y: 250, z: 40, h: 40, c: sevBright.high, ring: 'rgba(224,122,47,0.2)', label: '' },
  { x: 125, y: 300, z: 42, h: 32, c: sevBright.med, ring: 'rgba(201,162,39,0.2)', label: '' },
  { x: 320, y: 280, z: 14, h: 24, c: sevBright.med, ring: 'rgba(201,162,39,0.2)', label: '' },
  { x: 90, y: 180, z: 4, h: 18, c: sevBright.low, ring: 'rgba(124,139,134,0.2)', label: '' },
];

// ---------------------------------------------------------------------------------------------------- page data
const HEAT_COUNTS = [[0, 1, 2, 1, 0], [1, 3, 4, 2, 1], [2, 4, 6, 3, 2], [1, 3, 5, 4, 2], [0, 2, 3, 3, 1]];
const STEPS = [
  ['Create your company', 'Sign up with your work email. You become the Org Admin of a private space.'],
  ['Add your team', 'Add departments and people, each with their role and department already set.'],
  ['Record your risks', 'Each department writes down its risks with an owner and a score.'],
  ['Handle incidents', 'Report what happened, link it to its risk and follow it until it is closed.'],
];
const TIMELINE = [
  ['Mon 09:14', 'Reported by the line supervisor', '#E8EFEB'],
  ['Mon 09:40', 'Assigned to Maintenance, now Investigating', '#E8EFEB'],
  ['Mon 11:05', 'Contained: machine locked out and tagged', ACCENT],
  ['Tue 16:20', 'Linked to risk RSK-0042, hazardous energy', '#E8EFEB'],
  ['Thu 10:30', 'Resolved: lock-out training repeated for the shift', '#E8EFEB'],
];
const ROLE_ROWS = [
  ['Org Admin', 'Everything in the company'],
  ['Risk Officer', 'All risks and incidents'],
  ['Department Head', 'Their own department'],
  ['Auditor', 'Everything, read-only'],
  ['Employee', 'Incidents they reported or were given'],
];
const DEPTS: [string, number][] = [['Maintenance', 20], ['Production', 16], ['Warehouse', 15], ['Logistics', 9], ['Quality', 6]];
const FAQS = [
  ['Is my company’s data separate from other companies?', 'Yes. Each company is its own space. Every query is limited to your company, and the database refuses any link to another company’s records.'],
  ['Who can see what?', 'Org Admins, Risk Officers and Auditors see the whole company. Department Heads see their own department. Employees see the incidents they reported or were given. Auditors can’t change anything.'],
  ['Can anyone edit an incident’s history?', 'No. Assessments and updates are append-only, and the database blocks edits and deletes.'],
  ['How is a risk scored?', 'Likelihood × impact, each from 1 to 5: Low (1–4), Medium (5–9), High (10–16) and Critical (20–25).'],
  ['Is the demo data real?', 'The incidents are real public records from OSHA and an anonymised ServiceNow log. The risk registers and staff accounts were written for this demo, and dates are shifted. The source, what was changed and what was added are listed inside each demo company.'],
];

const bandOf = (s: number) => (s >= 20 ? 'crit' : s >= 10 ? 'high' : s >= 5 ? 'med' : 'low');
const range = (from: number, to: number) => `entry ${from}% cover ${to}%`;

function Mountain({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19l6.5-10 4 6 3-4.5L22 19H2z" fill={ACCENT} /></svg>
  );
}

// ---------------------------------------------------------------------------------------------------- the page
export default function Landing() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [typedLen, setTypedLen] = useState(0);
  const [cursor, setCursor] = useState(true);
  const [count, setCount] = useState(0); // 0 to 1, drives the numbers
  const [open, setOpen] = useState(0); // which FAQ answer is open
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [demoBusy, setDemoBusy] = useState('');
  const reduce = useMemo(() => reducedMotion(), []);
  const moveFrame = useRef(0);

  const heroContours = useMemo(() => contourRings([{ x: 1100, y: 260, r: 540, k: 3, p: 0.4 }, { x: 160, y: 780, r: 420, k: 4, p: 1.7 }, { x: 760, y: 980, r: 480, k: 5, p: 2.9 }], 14), []);
  const ctaContours = useMemo(() => contourRings([{ x: 720, y: 600, r: 520, k: 3, p: 1.1 }], 12), []);
  const terrain = useMemo(() => terrainRings(), []);

  useEffect(() => { document.title = `${PRODUCT.name}: ${PRODUCT.tagline}`; }, []);
  useEffect(() => { auth.demoAccounts().then(setDemo, () => undefined); }, []);

  // the headline types itself once; the cursor stays a moment, then goes
  useEffect(() => {
    if (reduce) { setTypedLen(HEADLINE.length); setCursor(false); setCount(1); return; }
    let i = 0;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const typing = setInterval(() => {
      i += 1;
      setTypedLen(i);
      if (i >= HEADLINE.length) {
        clearInterval(typing);
        hide = setTimeout(() => setCursor(false), 2600);
      }
    }, 38);
    // the three big numbers count up shortly after the page opens
    let raf = 0;
    const start = performance.now() + 900;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 1800));
      setCount(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { clearInterval(typing); if (hide) clearTimeout(hide); cancelAnimationFrame(raf); };
  }, [reduce]);

  useEffect(() => () => cancelAnimationFrame(moveFrame.current), []);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce || moveFrame.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    moveFrame.current = requestAnimationFrame(() => { moveFrame.current = 0; setTilt({ x, y }); });
  };

  const demoLogin = async (slug: string, role: Role) => {
    setDemoBusy(`${slug}:${role}`);
    try {
      setUser(await auth.demoLogin(slug, role));
      nav('/', { replace: true });
    } catch {
      nav('/login');
    }
  };

  const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
  const heatDark = [];
  for (let r = 5; r >= 1; r--) {
    for (let c = 1; c <= 5; c++) {
      const n = HEAT_COUNTS[5 - r][c - 1];
      const band = bandOf(r * c) as keyof typeof SEV;
      const a0 = 20 + (c - 1) * 6 + (5 - r) * 4;
      heatDark.push({ key: `${r}-${c}`, n, bg: `color-mix(in srgb, ${SEV[band]} ${n ? 22 + n * 9 : 10}%, #111A17)`, range: range(a0, a0 + 18) });
    }
  }

  return (
    <div className="lp" data-theme="dark" id="top">
      <header className="lp-nav">
        <div className="lp-nav-in">
          <a href="#top" className="lp-brand"><Mountain size={24} />{PRODUCT.name}</a>
          <nav className="lp-navlinks" aria-label="Main">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#demo">Demo</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link to="/login" className="lp-nav-login">Log in</Link>
          <Link to="/signup" className="lp-btn lp-nav-cta">Start free</Link>
        </div>
      </header>

      {/* ------------------------------------------------------------------------------------------ hero */}
      <section className="lp-hero">
        <svg className="lp-hero-bg" viewBox="0 0 1440 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="dawnlight" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#F4D9A6" stopOpacity="0.28" />
              <stop offset="0.45" stopColor={ACCENT} stopOpacity="0.12" />
              <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.55" stopColor="#0B1210" stopOpacity="0" />
              <stop offset="1" stopColor="#0B1210" stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle className="lp-dawn" cx="1090" cy="250" r="360" fill="url(#dawnlight)" />
          <g className="lp-drift" fill="none" stroke="#A0D7BE" strokeOpacity="0.07" strokeWidth="1">
            {heroContours.map((d, i) => <path key={i} d={d} />)}
          </g>
          <rect x="0" y="0" width="1440" height="860" fill="url(#fade)" />
        </svg>

        <div className="lp-wrap lp-hero-row" onMouseMove={onMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
          <div className="lp-hero-text">
            <h1 className="lp-herohead" aria-label={HEADLINE}>
              <span aria-hidden="true">{HEADLINE.slice(0, typedLen)}</span>
              {cursor && <span className="lp-cursor" aria-hidden="true" />}
            </h1>
            <p className="lp-lede">Aravalli is where a company writes down what could go wrong, reports what did, and follows each incident until it is closed. Each person sees only their own work.</p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-main" to="/signup">Start free</Link>
              <a className="lp-btn lp-btn-line" href="#demo">Try the live demo</a>
            </div>
          </div>

          <div className="lp-terrainwrap" aria-hidden="true" data-testid="hero-visual">
            <div className="lp-terrain" style={{ transform: `rotateX(${(58 - tilt.y * 10).toFixed(2)}deg) rotateZ(${(-34 + tilt.x * 16).toFixed(2)}deg)` }}>
              <div className="lp-spin">
                {terrain.map((r, i) => (
                  <svg key={i} className="lp-ring" viewBox="0 0 420 420" width="420" height="420" style={{ transform: `translateZ(${r.z}px)` }}>
                    <path d={r.d} fill="rgba(160,215,190,0.035)" stroke="#A0D7BE" strokeOpacity={r.op} strokeWidth="1.1" />
                  </svg>
                ))}
                {PINS.map((p, i) => (
                  <div key={i} className="lp-pin" style={{ left: p.x, top: p.y, transform: `translateZ(${p.z}px)` }}>
                    <div className="lp-pin-stem" style={{ height: p.h, background: `linear-gradient(to top, rgba(0,0,0,0), ${p.c})` }} />
                    <div className="lp-pin-head" style={{ background: p.c, boxShadow: `0 0 0 4px ${p.ring}`, transform: `translateZ(${p.h}px) rotateX(-90deg)` }} />
                    {p.label && <div className="lp-pin-label mono" style={{ transform: `translateZ(${p.h}px) rotateX(-90deg)` }}>{p.label}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <figure className="lp-wrap lp-shot lp-rise" data-testid="product-shot">
          <div className="lp-shot-frame">
            <div className="lp-shot-bar"><i /><i /><i /><span className="mono">aravalli / overview</span></div>
            <img className="lp-shot-img" src="/landing/overview.png" width={1440} height={900} alt="The Aravalli Overview screen: incident and risk figures, the risk heat map, incidents by stage and the incidents that need attention" />
          </div>
        </figure>
      </section>

      {/* ------------------------------------------------------------------------------------------ problem */}
      <section className="lp-problem" aria-label="The problem">
        <div className="lp-wrap lp-problem-in">
          <p className="lp-problem-big lp-appear" style={{ animationRange: range(10, 35) }}>In January 2025, a worker in Texas was repairing the chain of a packing machine when it was switched on. He lost the tip of his finger.</p>
          <div className="lp-problem-side lp-appear" style={{ animationRange: range(25, 45) }}>
            <p>It was reported to OSHA, like thousands of injuries every year. In most companies the risk behind it, a machine that can start during repairs, sits in a spreadsheet that nobody opens.</p>
            <p style={{ color: '#E8EFEB' }}>Aravalli gives that risk an owner, a score and a review date, and links the next incident straight back to it.</p>
            <p className="lp-dim" style={{ fontSize: 13.5 }}>From OSHA severe injury report 2025010024.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------------ how it works */}
      <section id="how" className="lp-wrap" style={{ paddingTop: 128 }}>
        <h2 className="lp-h2">How it works</h2>
        <div className="lp-steps">
          <div className="lp-steps-track" aria-hidden="true" />
          <div className="lp-steps-draw lp-draw" aria-hidden="true" />
          <ol className="lp-four">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="lp-step">
                <span className="lp-dot lp-lit" aria-hidden="true" style={{ animationRange: range(35 + i * 10, 40 + i * 7) }} />
                <span className="lp-dim" style={{ fontSize: 14, marginTop: 8 }}>{i + 1}</span>
                <span style={{ fontSize: 19, fontWeight: 600 }}>{title}</span>
                <span className="lp-muted" style={{ fontSize: 15 }}>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------------ features */}
      <section id="features" className="lp-wrap lp-features" style={{ paddingTop: 104 }}>
        <div className="lp-feat">
          <div className="lp-feat-text">
            <h3>Know which risks matter most</h3>
            <p>Every risk gets an owner and a score from 1 to 25, likelihood times impact. The heat map shows where the dangerous ones sit, and old scores stay in the history so you can see whether a risk is getting better.</p>
          </div>
          <div className="lp-feat-card" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <span className="lp-dim" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12.5 }}>Likelihood</span>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: 6 }} role="img" aria-label="Example 5 by 5 risk heat map">
                {heatDark.map((h) => (
                  <div key={h.key} className="lp-heatcell lp-fill mono" style={{ background: h.bg, animationRange: h.range }}>{h.n || ''}</div>
                ))}
              </div>
              <div className="lp-dim" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 8 }}>Impact</div>
            </div>
          </div>
        </div>

        <div className="lp-feat rev">
          <div className="lp-feat-text">
            <h3>Follow every incident to the end</h3>
            <p>Anyone can report what happened. Someone is made responsible, the harm is contained, the cause is fixed, and each step lands on a timeline that can't be edited later.</p>
          </div>
          <div className="lp-feat-card">
            <div style={{ fontSize: 15, fontWeight: 600 }}>INC-4812 · Finger caught in packing machine chain</div>
            <div className="lp-dim" style={{ fontSize: 12.5, marginBottom: 20 }}>Maintenance · example timeline</div>
            <ol className="lp-timeline">
              {TIMELINE.map(([time, text, color], i) => (
                <li key={time} className="lp-appear" style={{ animationRange: range(20 + i * 12, 30 + i * 6) }}>
                  <span className="mono lp-dim" style={{ fontSize: 12 }}>{time}</span>
                  <div style={{ fontSize: 15, color }}>{text}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="lp-feat">
          <div className="lp-feat-text">
            <h3>Everyone sees only their own work</h3>
            <p>Five roles, checked by the server on every request. Each company's data is kept apart, and the database refuses any link between two companies.</p>
          </div>
          <div style={{ flex: '1 1 480px', minWidth: 0, borderTop: '1px solid rgba(190,230,210,0.16)' }}>
            {ROLE_ROWS.map(([name, sees], i) => (
              <div key={name} className="lp-rolerow lp-appear" style={{ animationRange: range(20 + i * 12, 30 + i * 6) }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span className="lp-muted" style={{ textAlign: 'right' }}>{sees}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-feat rev">
          <div className="lp-feat-text">
            <h3>Reports you can hand to management</h3>
            <p>See which departments carry the most risk and how quickly incidents are resolved. Export to CSV or print.</p>
          </div>
          <div className="lp-feat-card">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Highest risk score by department <span className="lp-dim" style={{ fontWeight: 400, fontSize: 12.5 }}>example</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {DEPTS.map(([name, score], i) => (
                <div key={name} className="lp-deptrow">
                  <span>{name}</span>
                  <div className="lp-bartrack">
                    <div className="lp-barfill lp-grow" style={{ width: `${(score / 25) * 100}%`, background: SEV[bandOf(score) as keyof typeof SEV], animationRange: range(25 + i * 10, 40 + i * 6) }} />
                  </div>
                  <span className="mono" style={{ textAlign: 'right', color: '#C8D4CE' }}>{score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------------ real data */}
      <section className="lp-wrap lp-section" aria-label="Real data">
        <h2 className="lp-h2" style={{ marginBottom: 12 }}>Built on real incidents</h2>
        <p className="lp-lead" style={{ marginBottom: 36 }}>The two demo companies are filled with public records, so the app is tested at a real company's volume, not on a handful of made-up rows.</p>
        <div className="lp-three" style={{ marginBottom: 40 }}>
          <div className="lp-num-cell"><div className="mono lp-num">{fmt(24802 * count)}</div><div className="lp-muted" style={{ marginTop: 8 }}>IT tickets from a real ServiceNow log</div></div>
          <div className="lp-num-cell"><div className="mono lp-num">{fmt(5481 * count)}</div><div className="lp-muted" style={{ marginTop: 8 }}>workplace injury reports filed with OSHA</div></div>
          <div className="lp-num-cell"><div className="mono lp-num">{fmt(19 * count)}</div><div className="lp-muted" style={{ marginTop: 8 }}>ms to load the incident list on 25,000 rows</div></div>
        </div>
        <p className="lp-dim" style={{ fontSize: 14, maxWidth: '70ch' }}>
          Sources: OSHA Severe Injury Reports (US Department of Labor) and the UCI incident management event log (CC BY 4.0). Staff names are role titles, the risk registers were written for this demo, and dates are shifted.
        </p>
      </section>

      {/* ------------------------------------------------------------------------------------------ demo */}
      <section id="demo" className="lp-wrap lp-section">
        <h2 className="lp-h2" style={{ marginBottom: 12 }}>Open a demo company</h2>
        <p className="lp-lead" style={{ marginBottom: 32 }}>Pick a role to sign in as that person. You don't need an account.</p>
        <div className="lp-two">
          {DEMO_ORGS.map((o) => (
            <article key={o.slug} className="lp-demo-card">
              <div><h3>{o.name}</h3><div className="lp-muted" style={{ fontSize: 15 }}>{o.text}</div></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ROLES.map((role) =>
                  demo.length > 0 ? (
                    <button key={role} type="button" className="lp-rolebtn" data-testid={`landing-demo-${o.slug}-${role}`} disabled={demoBusy !== ''} onClick={() => demoLogin(o.slug, role)}>
                      {demoBusy === `${o.slug}:${role}` ? 'Signing in…' : role}
                    </button>
                  ) : (
                    <Link key={role} className="lp-rolebtn" to="/login">{role}</Link>
                  ),
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------------ FAQ */}
      <section id="faq" className="lp-wrap lp-section lp-faq">
        <div style={{ flex: '1 1 280px' }}><h2 className="lp-h2">Questions</h2></div>
        <div style={{ flex: '2 1 560px', display: 'flex', flexDirection: 'column' }}>
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} className="lp-faq-item">
                <button type="button" className="lp-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  {q}
                  <span aria-hidden="true" style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}>+</span>
                </button>
                {isOpen && <p className="lp-faq-a">{a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------------ closing */}
      <section className="lp-cta">
        <svg className="lp-cta-bg" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="720" cy="620" r="460" fill="url(#dawnlight)" />
          <g className="lp-drift" fill="none" stroke="#A0D7BE" strokeOpacity="0.11">
            {ctaContours.map((d, i) => <path key={i} d={d} />)}
          </g>
        </svg>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 44, lineHeight: 1.1, letterSpacing: '-0.025em', fontWeight: 600, maxWidth: '18ch', marginBottom: 14 }}>Set up Aravalli for your company.</h2>
          <p className="lp-lead" style={{ maxWidth: '46ch', marginBottom: 28 }}>It takes a few minutes. You become the admin, then add your departments and people.</p>
          <Link className="lp-btn lp-btn-main" to="/signup" style={{ padding: '15px 24px', borderRadius: 12, fontSize: 16 }}>Create your company</Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-in">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E8EFEB', fontWeight: 650 }}><Mountain size={18} />{PRODUCT.name}</span>
          <span>Demo companies use real public incident records. Staff are role titles, the risk registers were written for this demo, and dates are shifted.</span>
          <span style={{ marginLeft: 'auto' }}>Data: OSHA Severe Injury Reports · UCI incident event log (CC BY 4.0)</span>
        </div>
      </footer>
    </div>
  );
}
