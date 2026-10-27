import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError } from '../services/validation.js';
import { cookieName, tokenHash } from '../services/session.js';

const origins = new Set([config.clientOrigin, config.serverOrigin]);

// Require an exact Origin on every mutation, including sign-in and sign-up.
// SameSite cookies add a second CSRF defense. CLI clients send Origin too.
export function protectOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (origin && !origins.has(origin)) return next(new HttpError(403, 'This request origin is not allowed.'));
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!origin) return next(new HttpError(403, 'An Origin header is required.'));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.sendStatus(204);
  }
  if (!['GET', 'HEAD'].includes(req.method) && !origin) return next(new HttpError(403, 'An Origin header is required.'));
  next();
}

export async function requireAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Please sign in to continue.');
  const { rows } = await pool.query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [tokenHash(token)]);
  if (!rows[0]) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  req.userId = rows[0].user_id;
  next();
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: { message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'The request contains invalid JSON.' } });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: { message: 'This request is too large.' } });
  if (error.code === '23505') return res.status(409).json({ error: { message: 'This username or email is already in use.' } });
  if (['23503', '23514', '22P02', '22001'].includes(error.code)) return res.status(400).json({ error: { message: 'The supplied data is not valid.' } });
  console.error('API error:', error.code || error.name || 'unknown');
  if (['ECONNREFUSED', 'ENOTFOUND', '28P01', '3D000', '57P01', '42P01'].includes(error.code)) return res.status(503).json({ error: { message: 'CIRCLE cannot reach its database. Check PostgreSQL setup and migrations.' } });
  res.status(500).json({ error: { message: 'Something went wrong. Please try again.' } });
}

