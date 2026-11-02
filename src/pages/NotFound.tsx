import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { EmptyState } from '../components/ui/misc';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <Page title="Not found">
      <div className="panel">
        <EmptyState
          title={`404 — this ${what} doesn't exist`}
          body="The link may be wrong, or the record may not exist in the demo data."
          action={<Link to="/" className="text-accent underline">Go to Overview</Link>}
        />
      </div>
    </Page>
  );
}
