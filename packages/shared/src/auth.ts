// Account rules shared by the sign-up / reset forms (to explain) and the server (to decide).
import type { Errors } from './validation';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const isEmail = (s: string): boolean => s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export function validatePassword(password: string, email = ''): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (email && password.toLowerCase() === email.toLowerCase()) return 'The password cannot be your email address.';
  if (/^(.)\1+$/.test(password)) return 'Choose a password that is not one repeated character.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Include at least one letter and one number.';
  return undefined;
}

export interface SignupInput { organisation_name: string; first_name: string; last_name: string; email: string; password: string }

export function validateSignup(v: SignupInput): Errors {
  const e: Errors = {};
  const org = v.organisation_name.trim();
  if (org.length < 2 || org.length > 150) e.organisation_name = 'Organisation name must be 2–150 characters.';
  if (!v.first_name.trim() || v.first_name.trim().length > 60) e.first_name = 'First name is required (up to 60 characters).';
  if (!v.last_name.trim() || v.last_name.trim().length > 60) e.last_name = 'Last name is required (up to 60 characters).';
  if (!isEmail(v.email.trim())) e.email = 'Enter a valid email address.';
  const p = validatePassword(v.password, v.email.trim());
  if (p) e.password = p;
  return e;
}
