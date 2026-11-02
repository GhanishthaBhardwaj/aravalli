import { Button } from './Button';

interface Props { total: number; page: number; pages: number; pageSize: number; noun: string; onPage: (p: number) => void }

export function Pagination({ total, page, pages, pageSize, noun, onPage }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="no-print flex items-center justify-between border-t border-line px-3 py-2 text-[13px] text-muted">
      <span aria-live="polite">
        Showing {from}–{to} of {total} {noun}
      </span>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <Button onClick={() => onPage(page - 1)} disabled={page <= 1} className="h-8">
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button onClick={() => onPage(page + 1)} disabled={page >= pages} className="h-8">
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
