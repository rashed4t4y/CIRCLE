import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { transaction } from '../db.js';
import { getUser } from '../services/queries.js';
import { HttpError, textField } from '../services/validation.js';
import { saveImage, removeImage, maxImageBytes } from '../services/media.js';

export const mediaRoutes = Router();
const limit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, keyGenerator: req => String(req.userId),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { message: 'Too many image changes. Please try again later.' } },
});
const parse = multer({ storage: multer.memoryStorage(), limits: {
  fileSize: maxImageBytes, files: 2, fields: 4, parts: 6, fieldSize: 1024,
} }).fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

mediaRoutes.post('/me/media', limit, (req, res, next) => parse(req, res, error => {
  if (error) return next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
    error.code === 'LIMIT_FILE_SIZE' ? 'Images must be at most 5 MB.' : 'Invalid image upload fields.'));
  next();
}), async (req, res) => {
  const body = req.body || {};
  for (const key of Object.keys(body)) {
    if (!['full_name', 'bio', 'remove_avatar', 'remove_cover'].includes(key)) throw new HttpError(400, 'Unknown profile field.');
  }
  const changes = {};
  if (Object.hasOwn(body, 'full_name')) changes.full_name = textField(body.full_name, 'full_name', { max: 80 });
  if (Object.hasOwn(body, 'bio')) changes.bio = textField(body.bio, 'bio', { min: 0, max: 240 });
  for (const kind of ['avatar', 'cover']) {
    if (body['remove_' + kind] !== undefined && body['remove_' + kind] !== 'true') throw new HttpError(400, 'Invalid image removal flag.');
    if (body['remove_' + kind] && req.files?.[kind]) throw new HttpError(400, 'Choose either replacement or removal.');
  }
  const created = [], obsolete = [];
  let user;
  try {
    for (const kind of ['avatar', 'cover']) {
      if (body['remove_' + kind]) changes[kind + '_url'] = null;
      if (req.files?.[kind]) {
        const url = await saveImage(req.files[kind][0].buffer, kind);
        created.push(url); changes[kind + '_url'] = url;
      }
    }
    if (!Object.keys(changes).length) throw new HttpError(400, 'Choose a profile change to save.');
    user = await transaction(async client => {
      const { rows } = await client.query('SELECT avatar_url, cover_url FROM users WHERE id=$1 FOR UPDATE', [req.userId]);
      if (!rows[0]) throw new HttpError(401, 'Please sign in again.');
      for (const column of ['avatar_url', 'cover_url']) {
        if (Object.hasOwn(changes, column) && rows[0][column]) obsolete.push(rows[0][column]);
      }
      const entries = Object.entries(changes);
      await client.query('UPDATE users SET ' + entries.map(([column], i) => column + '=$' + (i + 2)).join(', ')
        + ', updated_at=now() WHERE id=$1', [req.userId, ...entries.map(([, value]) => value)]);
      return getUser(req.userId, req.userId, client, true);
    });
  } catch (error) { await Promise.all(created.map(removeImage)); throw error; }
  await Promise.all(obsolete.map(removeImage));
  res.json({ data: user });
});
