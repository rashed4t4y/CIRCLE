import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError, id, pagination, listResult } from '../services/validation.js';

export const notificationRoutes = Router();

notificationRoutes.get('/', async (req, res) => {
  const paging = pagination(req.query);
  const { rows } = await pool.query(
    "SELECT n.id, n.type, n.is_read, n.post_id, n.comment_id, n.created_at, json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username, 'avatar_url', u.avatar_url) AS actor FROM notifications n JOIN users u ON u.id = n.actor_id WHERE n.recipient_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT $2 OFFSET $3",
    [req.userId, paging.limit + 1, paging.offset],
  );
  const unread = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND is_read = false', [req.userId]);
  res.json({ ...listResult(rows, paging), unread_count: unread.rows[0].count });
});

notificationRoutes.patch('/read-all', async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false', [req.userId]);
  res.json({ data: { unread_count: 0 } });
});

notificationRoutes.patch('/:id/read', async (req, res) => {
  const notificationId = id(req.params.id);
  const result = await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_id = $2 RETURNING id, is_read', [notificationId, req.userId]);
  if (!result.rows[0]) throw new HttpError(404, 'This notification could not be found.');
  res.json({ data: result.rows[0] });
});

