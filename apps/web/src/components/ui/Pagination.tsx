import { Button } from './Button';

interface Props { total: number; page: number; pages: number; pageSize: number; noun: string; onPage: (p: number) => void }

export function Pagination({ total, page, pages, pageSize, noun, onPage }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[14px] text-muted">
      <span aria-live="polite">
        Showing <span className="num">{from}–{to}</span> of <span className="num">{total}</span> {noun}
      </span>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</Button>
          <span>Page <span className="num">{page}</span> of <span className="num">{pages}</span></span>
          <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next</Button>
        </nav>
      )}
    </div>
  );
}
