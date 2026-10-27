import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool, transaction } from '../db.js';
import { requireAuth } from '../middleware/security.js';
import { bodyObject, textField, username, email, password, HttpError } from '../services/validation.js';
import { getUser } from '../services/queries.js';
import { createSession, setSessionCookie, cookieName, cookieOptions, tokenHash } from '../services/session.js';

export const authRoutes = Router();
const failedAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' } },
});
// A missing account still runs bcrypt, reducing account-enumeration timing leaks.
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);

authRoutes.post('/register', failedAuthLimiter, async (req, res) => {
  const body = bodyObject(req.body);
  const fullName = textField(body.full_name, 'full_name', { max: 80 });
  const handle = username(body.username);
  const address = email(body.email);
  const secret = password(body.password);
  if (body.confirm_password !== undefined && body.confirm_password !== secret) throw new HttpError(400, 'Passwords do not match.', { confirm_password: 'Passwords do not match.' });
  const hash = await bcrypt.hash(secret, 12);
  const result = await transaction(async (client) => {
    const { rows } = await client.query('INSERT INTO users (full_name, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id', [fullName, handle, address, hash]);
    const userId = rows[0].id;
    const session = await createSession(client, userId, req.cookies[cookieName]);
    return { session, user: await getUser(userId, userId, client, true) };
  });
  setSessionCookie(res, result.session);
  res.status(201).json({ data: result.user });
});

authRoutes.post('/login', failedAuthLimiter, async (req, res) => {
  const body = bodyObject(req.body);
  const address = email(body.email);
  const secret = textField(body.password, 'password', { max: 72, trim: false });
  if (Buffer.byteLength(secret, 'utf8') > 72) throw new HttpError(400, 'Password is too long.');
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [address]);
  const matches = await bcrypt.compare(secret, rows[0]?.password_hash || await dummyHash);
  if (!rows[0] || !matches) throw new HttpError(401, 'Email or password is incorrect.');
  const result = await transaction(async (client) => ({
    session: await createSession(client, rows[0].id, req.cookies[cookieName]),
    user: await getUser(rows[0].id, rows[0].id, client, true),
  }));
  setSessionCookie(res, result.session);
  res.json({ data: result.user });
});

authRoutes.post('/logout', async (req, res) => {
  const token = req.cookies[cookieName];
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
  }
  res.clearCookie(cookieName, cookieOptions);
  res.json({ data: { message: 'You are signed out.' } });
});

authRoutes.get('/me', requireAuth, async (req, res) => {
  res.json({ data: await getUser(req.userId, req.userId, pool, true) });
});

