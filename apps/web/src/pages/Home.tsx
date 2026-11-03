// The home screen is different for each role: the same URL, a different first page.
//   Org Admin, Risk Officer, Auditor  the whole organisation (Overview), each with their own next steps
//   Department Head                    their department only
//   Employee                           the incidents they reported or were given
import { Link } from 'react-router-dom';
import type { IncidentListItem } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession } from '../app/providers';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { fmtDate } from '../app/format';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CountUp } from '../components/ui/CountUp';
import { Figure, Section } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';
import { Overview } from './Overview';

export function Home() {
  const { actor } = useSession();
  switch (actor.role) {
    case 'Org Admin': return <Overview variant="admin" />;
    case 'Risk Officer': return <Overview variant="officer" />;
    case 'Auditor': return <Overview variant="auditor" />;
    case 'Department Head': return <DepartmentHome />;
    case 'Employee': return <EmployeeHome />;
  }
}

const link = 'font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg';

const incidentColumns: Column<IncidentListItem>[] = [
  { key: 'code', header: 'Code', render: (i) => <span className="num text-[13px]">{i.incident_code}</span> },
  { key: 'title', header: 'Title', render: (i) => <span className="font-medium">{i.title}</span> },
  { key: 'sev', header: 'Severity', hideBelow: 'sm', render: (i) => <SeverityBadge severity={i.severity} /> },
  { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
  { key: 'when', header: 'Reported', hideBelow: 'md', render: (i) => fmtDate(i.reported_at) },
];

function DepartmentHome() {
  const { actor } = useSession();
  const { data, loading, error, reload } = useApi(
    async (signal) => {
      const [dept, openRisks, openIncidents, critical, unassigned, topRisks, recent] = await Promise.all([
        api.departments(signal),
        api.risks({ open: true, limit: 1 }, signal),
        api.incidents({ open: true, limit: 1 }, signal),
        api.incidents({ open: true, severities: 'Critical', limit: 1 }, signal),
        api.incidents({ open: true, unassigned: true, limit: 1 }, signal),
        api.risks({ open: true, sort: 'score', order: 'desc', limit: 5 }, signal),
        api.incidents({ open: true, sort: 'reported_at', order: 'desc', limit: 6 }, signal),
      ]);
      return { dept: dept[0], openRisks: openRisks.page.total, openIncidents: openIncidents.page.total, critical: critical.page.total, unassigned: unassigned.page.total, topRisks: topRisks.data, recent: recent.data };
    },
    [],
  );
  const name = data?.dept?.name ?? 'your department';
  return (
    <Page
      title={`${name}`}
      description={data && (
        <>
          You are the Head of {name}, so this is everything in {name} and nothing else.{' '}
          {data.unassigned > 0 ? <><strong className="font-semibold text-fg">{data.unassigned} open incidents</strong> have nobody assigned. <Link to="/incidents?assignee=none" className={link}>Assign them</Link>.</> : 'Every open incident has an owner.'}
        </>
      )}
      loading={loading}
      error={error}
      onRetry={reload}
      actions={<Button to="/incidents/new" variant="primary">Report incident</Button>}
    >
      {data && (
        <>
          <p className="mb-4 text-[13px] text-subtle">{actor.first_name} {actor.last_name} · {actor.job_title}</p>
          <div className="mb-16 grid grid-cols-2 gap-y-10 border-y border-line py-9 lg:grid-cols-4">
            {[
              <Figure key="r" label="Open risks" value={<CountUp value={data.openRisks} />} note="in your department" />,
              <Figure key="i" label="Open incidents" value={<CountUp value={data.openIncidents} />} note="in your department" />,
              <Figure key="c" label="Critical open incidents" value={<CountUp value={data.critical} />} note="need attention first" />,
              <Figure key="u" label="Unassigned" value={<CountUp value={data.unassigned} />} note="open incidents with no owner" />,
            ].map((f, i) => (
              <div key={i} className={`min-w-0 pr-4 ${i % 2 === 1 ? 'border-l border-line pl-6 sm:pl-8' : ''} ${i > 0 ? 'lg:border-l lg:border-line lg:pl-8' : ''}`}>{f}</div>
            ))}
          </div>
          <div className="grid gap-x-16 gap-y-14 lg:grid-cols-2">
            <Section title="Highest-scoring risks" aside={<Link to="/risks" className={link}>All risks</Link>}>
              {data.topRisks.length === 0 ? <p className="text-[15px] text-muted">No open risks in your department.</p> : (
                <ol>
                  {data.topRisks.map((r) => (
                    <li key={r.risk_id} className="border-b border-line last:border-0">
                      <Link to={`/risks/${r.risk_code}`} className="flex items-center gap-4 py-4 transition-colors hover:bg-surface-2 sm:-mx-3 sm:rounded-lg sm:px-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-medium">{r.title}</div>
                          <div className="num mt-1 text-[13px] text-muted">{r.risk_code}</div>
                        </div>
                        <ScoreBadge score={r.risk_score} band={r.severity_band === 'Unrated' ? null : r.severity_band} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            <Section title="Latest open incidents" aside={<Link to="/incidents?open=1" className={link}>All incidents</Link>}>
              <Table rows={data.recent} rowKey={(i) => i.incident_id} rowHref={(i) => `/incidents/${i.incident_code}`} caption="Latest open incidents in your department" columns={incidentColumns} noun="incidents" empty={<EmptyState title="Nothing open" body="No open incidents in your department right now." />} />
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}

function EmployeeHome() {
  const { actor } = useSession();
  const { data, loading, error, reload } = useApi(
    async (signal) => {
      const [open, all, recent] = await Promise.all([
        api.incidents({ open: true, limit: 1 }, signal),
        api.incidents({ limit: 1 }, signal),
        api.incidents({ sort: 'reported_at', order: 'desc', limit: 10 }, signal),
      ]);
      const assigned = recent.data.filter((i) => i.assigned_to === actor.employee_id && i.status !== 'Closed').length;
      return { open: open.page.total, total: all.page.total, recent: recent.data, assigned };
    },
    [],
  );
  return (
    <Page
      title={`Hello, ${actor.first_name}`}
      description="Report something that went wrong, and follow the incidents you reported or were given. You see only those."
      loading={loading}
      error={error}
      onRetry={reload}
      actions={<Button to="/incidents/new" variant="primary">Report an incident</Button>}
    >
      {data && (
        <>
          <div className="mb-16 grid grid-cols-2 gap-y-10 border-y border-line py-9">
            <div className="pr-4"><Figure label="Open" value={<CountUp value={data.open} />} note="incidents you reported or were given" /></div>
            <div className="border-l border-line pl-6 sm:pl-8"><Figure label="All time" value={<CountUp value={data.total} />} note="incidents in total" /></div>
          </div>
          <Section title="Your incidents" aside={<Link to="/incidents" className={link}>See all</Link>}>
            <Table
              rows={data.recent}
              rowKey={(i) => i.incident_id}
              rowHref={(i) => `/incidents/${i.incident_code}`}
              caption="Your most recent incidents"
              columns={incidentColumns}
              noun="incidents"
              empty={<EmptyState title="You have not reported anything yet" body="When something goes wrong, report it here so the right people can act." action={<Button to="/incidents/new" variant="primary">Report an incident</Button>} />}
            />
          </Section>
        </>
      )}
    </Page>
  );
}
