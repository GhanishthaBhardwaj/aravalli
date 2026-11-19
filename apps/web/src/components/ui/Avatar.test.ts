import { describe, expect, it } from 'vitest';
import { initialsOf } from './Avatar';

describe('initialsOf', () => {
  it('uses the first and the last word that is not a number', () => {
    expect(initialsOf('Production Supervisor 1')).toBe('PS');
    expect(initialsOf('Service Desk Analyst 12')).toBe('SA');
    expect(initialsOf('Plant Safety Officer')).toBe('PO');
    expect(initialsOf('Head of Production')).toBe('HP');
  });
  it('still works for ordinary two-word names, one word and nothing', () => {
    expect(initialsOf('Maya Sharma')).toBe('MS');
    expect(initialsOf('  maya  ')).toBe('M');
    expect(initialsOf('')).toBe('?');
  });
});
