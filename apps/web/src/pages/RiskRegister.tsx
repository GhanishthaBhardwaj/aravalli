import { useMemo } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { permit, RISK_STATUSES } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { riskRows, type RiskRow } from '../data/selectors';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { PersonName } from '../components/ui/Avatar';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

// `owner`, `l` and `i` arrive from links on other pages (People, heat map) and are not shown as controls.
const KEYS = ['q', 'department', 'owner', 'status', 'band', 'l', 'i'];

export function RiskRegister() {
  const { ds, actor } = useData();
  const f = useFilters(KEYS);
  const all = useMemo(() => riskRows(ds), [ds]);
  const q = f.get('q').trim().toLowerCase();

  const rows = all.filter(
    (r) =>
      (!q || r.risk.risk_code.toLowerCase().includes(q) || r.risk.title.toLowerCase().includes(q)) &&
      (!f.get('department') || String(r.risk.department_id) === f.get('department')) &&
      (!f.get('owner') || String(r.risk.owner_employee_id) === f.get('owner')) &&
      (!f.get('status') || r.risk.status === f.get('status')) &&
      (!f.get('band') || (r.band ?? 'Unrated') === f.get('band')) &&
      (!f.get('l') || r.current?.likelihood === Number(f.get('l'))) &&
      (!f.get('i') || r.current?.impact === Number(f.get('i'))) &&
      // a heat-map cell link shows open risks only, matching the map
      (!(f.get('l') || f.get('i')) || r.risk.status !== 'Closed'),
  );

  const cols: Column<RiskRow>[] = [
    { key: 'code', header: 'Code', sort: (r) => r.risk.risk_code, render: (r) => <IdLink to={`/risks/${r.risk.risk_code}`}>{r.risk.risk_code}</IdLink> },
    { key: 'title', header: 'Risk', sort: (r) => r.risk.title, render: (r) => <span className="block max-w-[44ch] truncate font-medium" title={r.risk.title}>{r.risk.title}</span> },
    { key: 'dept', header: 'Department', sort: (r) => r.department.name, render: (r) => r.department.name },
    { key: 'owner', header: 'Owner', sort: (r) => r.owner.last_name, render: (r) => <PersonName person={r.owner} /> },
    { key: 'score', header: 'Score', sort: (r) => r.score, render: (r) => <ScoreBadge score={r.score} band={r.band} /> },
    { key: 'status', header: 'Status', sort: (r) => r.risk.status, render: (r) => <StatusBadge status={r.risk.status} /> },
  ];

  const p = permit(actor, 'risk.register');

  return (
    <Page
      title="Risk Register"
      description="Every registered risk, scored by its latest assessment."
      actions={
        <Button variant="primary" to="/risks/new" disabledReason={p.allowed ? undefined : p.reason}>
          <PlusIcon className="h-4 w-4" aria-hidden="true" /> Register risk
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} />
        <FilterSelect label="Department" value={f.get('department')} onChange={(v) => f.set('department', v)} options={ds.departments.map((d) => ({ value: String(d.department_id), label: d.name }))} />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={RISK_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Severity" value={f.get('band')} onChange={(v) => f.set('band', v)} options={['Critical', 'High', 'Medium', 'Low', 'Unrated'].map((b) => ({ value: b, label: b }))} />
        {f.active && <Button variant="ghost" onClick={f.clear}>Clear filters</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table
          rows={rows}
          columns={cols}
          rowKey={(r) => r.risk.risk_id}
          rowHref={(r) => `/risks/${r.risk.risk_code}`}
          caption="Risk register"
          urlState
          pageSize={20}
          noun="risks"
          defaultSort={{ key: 'code', dir: 'asc' }}
          empty={<EmptyState title="No risks match these filters" body="Remove a filter or widen the search." action={<Button onClick={f.clear}>Clear filters</Button>} />}
        />
      </Card>
    </Page>
  );
}
