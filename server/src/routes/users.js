import { mediaRoutes } from './media.js';
import { removeImage } from '../services/media.js';
import { Router } from 'express';
import { pool, transaction } from '../db.js';
import { getUser, userColumns, notify } from '../services/queries.js';
import { HttpError, bodyObject, textField, username, imageUrl, id, pagination, listResult, searchTerm, likePattern } from '../services/validation.js';

export const userRoutes = Router();
userRoutes.use(mediaRoutes);

userRoutes.get('/search', async (req, res) => {
  const q = searchTerm(req.query.q);
  const paging = pagination(req.query);
  const { rows } = await pool.query(
    'SELECT ' + userColumns + ' FROM users u WHERE u.id <> $1 AND (u.username ILIKE $2 OR u.full_name ILIKE $2) ORDER BY is_following ASC, followers_count DESC, u.id ASC LIMIT $3 OFFSET $4',
    [req.userId, likePattern(q), paging.limit + 1, paging.offset],
  );
  res.json(listResult(rows, paging));
});

userRoutes.patch('/me', async (req, res) => {
  const body = bodyObject(req.body);
  const values = [req.userId];
  const updates = [];
  const add = (column, value) => { values.push(value); updates.push(column + ' = $' + values.length); };
  if (Object.hasOwn(body, 'full_name')) add('full_name', textField(body.full_name, 'full_name', { max: 80 }));
  if (Object.hasOwn(body, 'bio')) add('bio', textField(body.bio, 'bio', { min: 0, max: 240 }));
  if (Object.hasOwn(body, 'avatar_url')) add('avatar_url', imageUrl(body.avatar_url, 'avatar_url'));
  if (!updates.length) throw new HttpError(400, 'Supply full_name, bio, or avatar_url to update your profile.');
  let oldAvatar;
  const user = await transaction(async (client) => {
    if (Object.hasOwn(body, 'avatar_url')) {
      const previous = await client.query('SELECT avatar_url FROM users WHERE id=$1 FOR UPDATE', [req.userId]);
      oldAvatar = previous.rows[0]?.avatar_url;
    }
    await client.query('UPDATE users SET ' + updates.join(', ') + ', updated_at = now() WHERE id = $1', values);
    return getUser(req.userId, req.userId, client, true);
  });
  if (oldAvatar && oldAvatar !== user.avatar_url) await removeImage(oldAvatar);
  res.json({ data: user });
});

async function followList(req, res, kind) {
  const handle = username(req.params.username);
  const paging = pagination(req.query);
  const target = await pool.query('SELECT id FROM users WHERE username = $1', [handle]);
  if (!target.rows[0]) throw new HttpError(404, 'This person could not be found.');
  // Both column names are internal constants, never request parameters.
  const joinedColumn = kind === 'followers' ? 'follower_id' : 'following_id';
  const targetColumn = kind === 'followers' ? 'following_id' : 'follower_id';
  const { rows } = await pool.query(
    'SELECT ' + userColumns + ' FROM follows f JOIN users u ON u.id = f.' + joinedColumn + ' WHERE f.' + targetColumn + ' = $2 ORDER BY f.created_at DESC, f.id DESC LIMIT $3 OFFSET $4',
    [req.userId, target.rows[0].id, paging.limit + 1, paging.offset],
  );
  res.json(listResult(rows, paging));
}
userRoutes.get('/:username/followers', (req, res) => followList(req, res, 'followers'));
userRoutes.get('/:username/following', (req, res) => followList(req, res, 'following'));

userRoutes.post('/:id/follow', async (req, res) => {
  const targetId = id(req.params.id);
  if (targetId === req.userId) throw new HttpError(400, 'You cannot follow yourself.');
  const result = await transaction(async (client) => {
    // Serialize opposite follow/unfollow actions for this pair, including notifications.
    await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [req.userId, targetId]);
    const target = await client.query('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [targetId]);
    if (!target.rows[0]) throw new HttpError(404, 'This person could not be found.');
    const added = await client.query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT (follower_id, following_id) DO NOTHING RETURNING id', [req.userId, targetId]);
    if (added.rowCount) await notify(client, { recipientId: targetId, actorId: req.userId, type: 'follow' });
    return { user: await getUser(req.userId, targetId, client), added: added.rowCount > 0 };
  });
  res.status(result.added ? 201 : 200).json({ data: result.user });
});

userRoutes.delete('/:id/follow', async (req, res) => {
  const targetId = id(req.params.id);
  if (targetId === req.userId) throw new HttpError(400, 'You cannot unfollow yourself.');
  const user = await transaction(async (client) => {
    // Serialize opposite follow/unfollow actions for this pair, including notifications.
    await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [req.userId, targetId]);
    const target = await client.query('SELECT id FROM users WHERE id = $1 FOR KEY SHARE', [targetId]);
    if (!target.rows[0]) throw new HttpError(404, 'This person could not be found.');
    await client.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [req.userId, targetId]);
    await client.query("DELETE FROM notifications WHERE type = 'follow' AND actor_id = $1 AND recipient_id = $2", [req.userId, targetId]);
    return getUser(req.userId, targetId, client);
  });
  res.json({ data: user });
});

userRoutes.get('/:username', async (req, res) => {
  const handle = username(req.params.username);
  const { rows } = await pool.query('SELECT ' + userColumns + ' FROM users u WHERE u.username = $2', [req.userId, handle]);
  if (!rows[0]) throw new HttpError(404, 'This person could not be found.');
  res.json({ data: rows[0] });
});


