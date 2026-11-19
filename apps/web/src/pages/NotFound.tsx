import { Page } from '../app/Page';
import { Button } from '../components/ui/Button';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <Page title="Not found">
      <div className="max-w-md">
        <p className="num text-[64px] font-semibold leading-none">404</p>
        <p className="mt-4 text-[20px] font-semibold">This {what} doesn't exist.</p>
        <div className="mt-6"><Button to="/" variant="primary">Go to Overview</Button></div>
      </div>
    </Page>
  );
}
