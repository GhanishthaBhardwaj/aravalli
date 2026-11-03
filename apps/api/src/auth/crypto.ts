// Passwords, one-time tokens and access tokens. Nothing secret is ever stored in the clear.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

/** Argon2id with the library's defaults (memory-hard, so stolen hashes are expensive to crack). */
export const hashPassword = (password: string): Promise<string> => argon2.hash(password, { type: argon2.argon2id });

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // a malformed hash must never let anyone in
  }
}

/** A random URL-safe token (256 bits). Only its hash is stored; the token itself goes to the person. */
export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newFamilyId = (): string => randomUUID();

/** The password for demo accounts: random and never shown, so they can only be entered through the demo login. */
export const unusablePassword = (): Promise<string> => hashPassword(randomBytes(32).toString('hex'));

export interface AccessClaims { sub: number }

export function signAccessToken(userId: number, secret: string, ttlSeconds: number): string {
  return jwt.sign({}, secret, { algorithm: 'HS256', subject: String(userId), expiresIn: ttlSeconds, issuer: 'aravalli' });
}

/** Returns the user id, or null for anything that is not a valid, unexpired token we signed. */
export function verifyAccessToken(token: string, secret: string): number | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'aravalli' });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) return null;
    return Number(payload.sub);
  } catch {
    return null;
  }
}
