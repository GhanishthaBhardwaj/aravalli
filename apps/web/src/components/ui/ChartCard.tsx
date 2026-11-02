import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  /** Screen-reader data table (visually hidden). */
  table: { headers: string[]; rows: (string | number)[][] };
  className?: string;
}

export function ChartCard({ title, children, table, className = '' }: Props) {
  return (
    <section className={`panel ${className}`}>
      <h2 className="section-title border-b border-line px-5 py-3.5">{title}</h2>
      <div className="p-5">{children}</div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
