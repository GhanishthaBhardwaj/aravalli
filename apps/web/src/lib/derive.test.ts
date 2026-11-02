import { describe, expect, it } from 'vitest';
import { formatHours, fullName, incidentAgeDays, splitName } from './derive';

const base = { occurred_at: '2026-10-10T09:00:00' };

describe('incidentAgeDays', () => {
  it('counts to "now" while an incident is open', () => {
    expect(incidentAgeDays({ ...base, status: 'Open', resolved_at: null }, '2026-10-20T08:59')).toBe(9);
    expect(incidentAgeDays({ ...base, status: 'Investigating', resolved_at: null }, '2026-10-20T09:00')).toBe(10);
  });

  it('counts to the resolution time once resolved, whatever "now" is', () => {
    const resolved = { ...base, status: 'Closed' as const, resolved_at: '2026-10-12T10:00:00' };
    expect(incidentAgeDays(resolved, '2027-01-01T00:00')).toBe(2);
  });

  it('never goes negative', () => {
    expect(incidentAgeDays({ ...base, status: 'Open', resolved_at: null }, '2026-10-01T00:00')).toBe(0);
  });
});

describe('presentation helpers', () => {
  it('formats hours, switching to days after two', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(5.25)).toBe('5.3 h');
    expect(formatHours(47.9)).toBe('47.9 h');
    expect(formatHours(48)).toBe('2.0 d');
  });

  it('builds names and initials', () => {
    expect(fullName({ first_name: 'Ananya', last_name: 'Reddy' })).toBe('Ananya Reddy');
    expect(fullName(undefined)).toBe('—');
    expect(splitName('Ananya Reddy')).toEqual({ first_name: 'Ananya', last_name: 'Reddy' });
    expect(splitName('Mary Jane Watson')).toEqual({ first_name: 'Mary', last_name: 'Watson' });
    expect(splitName('Cher')).toEqual({ first_name: 'Cher', last_name: '' });
  });
});
