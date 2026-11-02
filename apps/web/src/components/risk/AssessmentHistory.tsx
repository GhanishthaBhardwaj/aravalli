import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bandFor, type Employee, type RiskAssessment } from '@aravalli/shared';
import { ScoreBadge } from './ScoreBadge';
import { Table, type Column } from '../ui/Table';
import { BAND_VAR } from '../ui/Badge';
import { PersonName } from '../ui/Avatar';
import { reducedMotion } from '../ui/CountUp';
import { tooltipStyle } from '../charts/BandBarChart';
import { fmtDate } from '../../app/format';

// Faint zones behind the line; 17–19 cannot occur, so High runs up to the Critical boundary.
const ZONES = [
  { y1: 0, y2: 4.5, fill: BAND_VAR.Low, opacity: 0.35 },
  { y1: 4.5, y2: 9.5, fill: BAND_VAR.Medium, opacity: 0.18 },
  { y1: 9.5, y2: 19.5, fill: BAND_VAR.High, opacity: 0.1 },
  { y1: 19.5, y2: 25, fill: BAND_VAR.Critical, opacity: 0.22 },
];

interface DotProps { cx?: number; cy?: number; index?: number; payload?: { score: number } }

/** The score over time, drawn on its risk-band zones. `assessments` must be oldest-first. */
export function ScoreChart({ assessments }: { assessments: RiskAssessment[] }) {
  const data = assessments.map((a) => ({ label: fmtDate(a.assessment_date), score: a.risk_score }));
  const latest = assessments.at(-1);

  const dot = ({ cx, cy, index, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
    const isLast = index === data.length - 1;
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={isLast ? 8 : 5.5} fill={BAND_VAR[bandFor(payload.score)]} stroke="var(--fg)" strokeWidth={2} />
        {isLast && <text x={cx} y={cy - 15} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="Geist Mono, monospace" fill="var(--fg)">{payload.score}</text>}
      </g>
    );
  };

  return (
    <div className="h-56" role="img" aria-label={`Line chart of risk score over ${data.length} assessments; latest score ${latest?.risk_score}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 24, bottom: 0, left: -12 }}>
          {ZONES.map((z) => <ReferenceArea key={z.y1} y1={z.y1} y2={z.y2} fill={z.fill} fillOpacity={z.opacity} ifOverflow="hidden" />)}
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} />
          <YAxis domain={[0, 25]} ticks={[0, 5, 10, 20, 25]} tick={{ fill: 'var(--muted)', fontSize: 12, fontFamily: 'Geist Mono, monospace' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="score" stroke="var(--fg)" strokeWidth={2} dot={dot} activeDot={false} isAnimationActive={!reducedMotion()} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Newest first. */
export function AssessmentTable({ assessments, employees }: { assessments: RiskAssessment[]; employees: Employee[] }) {
  const cols: Column<RiskAssessment>[] = [
    { key: 'date', header: 'Date', render: (a) => <span className="num whitespace-nowrap text-[13px]">{a.assessment_date}</span>, sort: (a) => a.assessment_date },
    { key: 'l', header: 'Likelihood', align: 'right', render: (a) => <span className="num">{a.likelihood}</span> },
    { key: 'i', header: 'Impact', align: 'right', render: (a) => <span className="num">{a.impact}</span> },
    { key: 's', header: 'Score', render: (a) => <ScoreBadge score={a.risk_score} band={bandFor(a.risk_score)} /> },
    { key: 'by', header: 'Assessed by', hideBelow: 'md', render: (a) => <PersonName person={employees.find((e) => e.employee_id === a.assessed_by)} /> },
    { key: 'n', header: 'Notes', hideBelow: 'md', render: (a) => <span className="block max-w-[34ch] truncate text-muted" title={a.mitigation_notes ?? ''}>{a.mitigation_notes ?? '—'}</span> },
  ];
  return <Table rows={[...assessments].reverse()} columns={cols} rowKey={(a) => a.assessment_id} caption="Assessment history, newest first" />;
}
