import type { ReactNode } from 'react';

/** Turns "see https://example.com/page." into text with a real link (the full stop is not part of the address). */
function withLinks(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s),]+)/).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[.;]+$/, '');
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-4 hover:underline">{url}</a>
        {part.slice(url.length)}
      </span>
    );
  });
}

/**
 * The honest-data note of a demonstration organisation. The server stores it as up to three lines,
 * "Source: ...", "Changed: ..." and "Added: ...". A normal customer organisation has none, and nothing is shown.
 * `short` shows only the source line (for the page footer).
 */
export function DataNote({ note, short }: { note: string | null; short?: boolean }) {
  if (!note) return null;
  const lines = note.split('\n').filter(Boolean);
  const shown = short ? lines.slice(0, 1) : lines;
  return (
    <div className="space-y-1" data-testid="data-note">
      {shown.map((line) => {
        const colon = line.indexOf(': ');
        const label = colon > 0 && colon < 12 ? line.slice(0, colon) : '';
        const text = label ? line.slice(colon + 2) : line;
        return (
          <p key={line}>
            {label && <span className="font-semibold text-fg">{label}: </span>}
            {withLinks(text)}
          </p>
        );
      })}
    </div>
  );
}
