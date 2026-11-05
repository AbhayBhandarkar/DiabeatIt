import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';

export const COOKIE = 'diabeatit_account';
export const SESSION_MS = 7 * 86400000;
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$1' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'));
}
export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/v2', maxAge: SESSION_MS });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/v2' });
}