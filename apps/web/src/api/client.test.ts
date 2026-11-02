import { describe, expect, it } from 'vitest';
import { ApiError, fieldErrors, queryString } from './client';

describe('queryString', () => {
  it('skips empty values and encodes the rest', () => {
    expect(queryString({ q: 'a b&c', limit: 20, empty: '', none: undefined, nothing: null, flag: false })).toBe('?q=a+b%26c&limit=20&flag=false');
    expect(queryString({})).toBe('');
    expect(queryString()).toBe('');
  });
});

describe('fieldErrors', () => {
  it('maps API validation details to form fields, keeping the first message per field', () => {
    const e = new ApiError(400, 'validation_error', 'The request is not valid.', [
      { field: 'title', message: 'Title is required.' },
      { field: 'title', message: 'Second message' },
      { field: 'category', message: 'Choose a category.' },
    ]);
    expect(fieldErrors(e)).toEqual({ title: 'Title is required.', category: 'Choose a category.' });
  });

  it('puts an error with no field into _form', () => {
    expect(fieldErrors(new ApiError(403, 'forbidden', 'Auditors have read-only access.'))).toEqual({ _form: 'Auditors have read-only access.' });
    expect(fieldErrors(new ApiError(409, 'conflict', 'Closed incidents are final.', []))).toEqual({ _form: 'Closed incidents are final.' });
  });

  it('copes with a network failure and with an unexpected error', () => {
    expect(fieldErrors(new ApiError(0, 'network_error', 'The server could not be reached.'))._form).toMatch(/could not be reached/);
    expect(fieldErrors(new Error('boom'))).toEqual({ _form: 'boom' });
    expect(fieldErrors('weird')._form).toMatch(/went wrong/);
  });
});
