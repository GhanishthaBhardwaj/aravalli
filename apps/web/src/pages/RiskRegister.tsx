import { PlusIcon } from '@heroicons/react/20/solid';
import { permit, RISK_STATUSES, type RiskListItem } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { useListParams } from '../app/useListParams';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { NameChip } from '../components/ui/Avatar';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

// `owner`, `l` and `i` arrive from links on other pages (People, heat map) and are not shown as controls.
const KEYS = ['q', 'department', 'owner', 'status', 'band', 'l', 'i'];
const PAGE_SIZE = 20;

/** The two demonstration organisations have a risk register that was written for the demo, not taken from the real data. */
export const SAMPLE_REGISTER = 'Sample risk register written for this demo, linked to real incidents.';

export function RiskRegister() {
  const { actor, organisation } = useSession();
  const f = useFilters(KEYS);
  const list = useListParams({ sort: 'code', dir: 'asc' }, PAGE_SIZE);
  const heatCell = Boolean(f.get('l') || f.get('i'));

  const departments = useApi((signal) => api.departments(signal), []);
  const { data, loading, refreshing, error, reload } = useApi(
    (signal) =>
      api.risks(
        {
          q: f.get('q').trim() || undefined,
          department_id: f.get('department') || undefined,
          owner_id: f.get('owner') || undefined,
          statuses: f.get('status') || undefined,
          bands: f.get('band') || undefined,
          likelihood: f.get('l') || undefined,
          impact: f.get('i') || undefined,
          // a heat-map cell link shows open risks only, matching the map
          open: heatCell ? true : undefined,
          sort: list.sort, order: list.dir, limit: list.limit, offset: list.offset,
        },
        signal,
      ),
    [f.get('q'), f.get('department'), f.get('owner'), f.get('status'), f.get('band'), f.get('l'), f.get('i'), list.sort, list.dir, list.page],
  );

  const cols: Column<RiskListItem>[] = [
    { key: 'code', header: 'Code', sortKey: 'code', render: (r) => <IdLink to={`/risks/${r.risk_code}`}>{r.risk_code}</IdLink> },
    { key: 'title', header: 'Risk', sortKey: 'title', render: (r) => <span className="block max-w-[22ch] font-medium md:max-w-[44ch] md:truncate" title={r.title}>{r.title}</span> },
    { key: 'dept', header: 'Department', hideBelow: 'md', sortKey: 'department', render: (r) => r.department_name },
    { key: 'owner', header: 'Owner', hideBelow: 'md', sortKey: 'owner', render: (r) => <NameChip name={r.owner_name} /> },
    { key: 'score', header: 'Score', sortKey: 'score', render: (r) => <ScoreBadge score={r.risk_score} band={r.severity_band === 'Unrated' ? null : r.severity_band} /> },
    { key: 'status', header: 'Status', hideBelow: 'md', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  const p = permit(actor, 'risk.register');

  return (
    <Page
      title="Risk Register"
      description={organisation.data_note ? SAMPLE_REGISTER : undefined}
      actions={
        <Button variant="primary" to="/risks/new" disabledReason={p.allowed ? undefined : p.reason}>
          <PlusIcon className="h-4 w-4" aria-hidden="true" /> Register risk
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} />
        <FilterSelect label="Department" value={f.get('department')} onChange={(v) => f.set('department', v)} options={(departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }))} />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={RISK_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Severity" value={f.get('band')} onChange={(v) => f.set('band', v)} options={['Critical', 'High', 'Medium', 'Low', 'Unrated'].map((b) => ({ value: b, label: b }))} />
        {f.active && <Button variant="ghost" onClick={f.clear}>Clear filters</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table
          rows={data?.data ?? []}
          columns={cols}
          rowKey={(r) => r.risk_id}
          rowHref={(r) => `/risks/${r.risk_code}`}
          caption="Risk register"
          noun="risks"
          loading={loading || (refreshing && !data)}
          error={error?.message}
          onRetry={reload}
          server={{ total: data?.page.total ?? 0, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir, onSort: list.setSort, onPage: list.setPage }}
          empty={<EmptyState title="No risks match these filters" action={<Button onClick={f.clear}>Clear filters</Button>} />}
        />
      </Card>
    </Page>
  );
}
