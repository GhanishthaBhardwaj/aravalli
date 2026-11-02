/**
 * Time is injected, never read from a global, so rules that depend on "today"
 * ("the date cannot be in the future") are deterministic in tests and in demos.
 * Formats: today() = 'YYYY-MM-DD', now() = 'YYYY-MM-DDTHH:mm' (local time).
 */
export interface Clock {
  today(): string;
  now(): string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const systemClock: Clock = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  now() {
    const d = new Date();
    return `${this.today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
};

/** A clock stuck at one moment. `at` is 'YYYY-MM-DDTHH:mm'. */
export function fixedClock(at: string): Clock {
  return { today: () => at.slice(0, 10), now: () => at };
}

/** The demo organisation's sample data is dated around this moment. */
export const DEMO_CLOCK: Clock = fixedClock('2026-10-20T17:30');
