import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';

export const cookieName = 'circle_session';
export const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(client, userId, oldToken) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000);
  if (typeof oldToken === 'string' && /^[a-f0-9]{64}$/.test(oldToken)) {
    await client.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(oldToken)]);
  }
  await client.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [userId]);
  await client.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash(token), userId, expiresAt]);
  return { token, expiresAt };
}

export function setSessionCookie(res, session) {
  res.cookie(cookieName, session.token, { ...cookieOptions, expires: session.expiresAt });
}

