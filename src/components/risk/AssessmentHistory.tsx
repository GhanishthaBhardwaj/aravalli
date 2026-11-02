import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Employee, RiskAssessment } from '../../domain/types';
import { bandFor } from '../../domain/scoring';
import { ScoreBadge } from './ScoreBadge';
import { Table } from '../ui/Table';
import type { Column } from '../ui/Table';
import { ChartCard } from '../ui/ChartCard';
import { SEV_COLOR } from '../ui/Chip';
import { PersonName } from '../ui/Avatar';
import { reducedMotion } from '../ui/CountUp';
import { fmtDate } from '../../app/format';

// Pale band zones behind the line; 17–19 cannot occur, so High runs up to the Critical boundary.
const ZONES = [
  { y1: 0, y2: 4.5, fill: '#ecfdf3' },
  { y1: 4.5, y2: 9.5, fill: '#fffaeb' },
  { y1: 9.5, y2: 19.5, fill: '#fff4ed' },
  { y1: 19.5, y2: 25, fill: '#fef3f2' },
];

interface DotProps { cx?: number; cy?: number; index?: number; payload?: { score: number } }

/** `assessments` must be oldest-first. */
export function AssessmentHistory({ assessments, employees }: { assessments: RiskAssessment[]; employees: Employee[] }) {
  const latest = assessments.at(-1);
  const data = assessments.map((a) => ({ label: fmtDate(a.assessment_date), score: a.risk_score }));

  const dot = ({ cx, cy, index, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
    const isLast = index === data.length - 1;
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={isLast ? 8 : 5.5} fill={SEV_COLOR[bandFor(payload.score)]} stroke="#fff" strokeWidth={2.5} />
        {isLast && (
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="#101828">{payload.score}</text>
        )}
      </g>
    );
  };

  const cols: Column<RiskAssessment>[] = [
    { key: 'date', header: 'Date', render: (a) => <span className="mono text-[12px]">{a.assessment_date}</span>, sort: (a) => a.assessment_date },
    { key: 'l', header: 'Likelihood', align: 'right', render: (a) => <span className="mono">{a.likelihood}</span> },
    { key: 'i', header: 'Impact', align: 'right', render: (a) => <span className="mono">{a.impact}</span> },
    { key: 's', header: 'Score', render: (a) => <ScoreBadge score={a.risk_score} band={bandFor(a.risk_score)} /> },
    { key: 'by', header: 'Assessed by', render: (a) => <PersonName person={employees.find((e) => e.employee_id === a.assessed_by)} /> },
    { key: 'n', header: 'Notes', render: (a) => <span className="block max-w-[34ch] truncate" title={a.mitigation_notes ?? ''}>{a.mitigation_notes ?? '—'}</span> },
  ];
  const newestFirst = [...assessments].reverse();

  return (
    <div className="space-y-4">
      {assessments.length > 1 && (
        <ChartCard title="Score over time" table={{ headers: ['Date', 'Score'], rows: data.map((d) => [d.label, d.score]) }}>
          <div className="h-52" role="img" aria-label={`Line chart of risk score over ${data.length} assessments; latest score ${latest?.risk_score}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 22, right: 20, bottom: 0, left: -16 }}>
                {ZONES.map((z) => (
                  <ReferenceArea key={z.y1} y1={z.y1} y2={z.y2} fill={z.fill} fillOpacity={1} ifOverflow="hidden" />
                ))}
                <CartesianGrid stroke="#ffffff" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5c6b84' }} tickLine={false} axisLine={false} padding={{ left: 16, right: 16 }} />
                <YAxis domain={[0, 25]} ticks={[0, 5, 10, 20, 25]} tick={{ fontSize: 11, fill: '#5c6b84' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e1e6f0', boxShadow: 'none' }} />
                <Line type="monotone" dataKey="score" stroke="#344054" strokeWidth={2} dot={dot} activeDot={false} isAnimationActive={!reducedMotion()} animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
            {(['Low', 'Medium', 'High', 'Critical'] as const).map((b) => (
              <li key={b} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[b] }} />{b}</li>
            ))}
          </ul>
        </ChartCard>
      )}
      <h3 className="section-title pt-2">Assessment history ({assessments.length})</h3>
      <div className="panel overflow-hidden">
        <Table rows={newestFirst} columns={cols} rowKey={(a) => a.assessment_id} caption="Assessment history, newest first" />
      </div>
    </div>
  );
}
