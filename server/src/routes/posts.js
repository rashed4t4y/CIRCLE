import { Router } from 'express';
import { pool, transaction } from '../db.js';
import { getPost, postColumns, commentColumns, lockPost, notify } from '../services/queries.js';
import { HttpError, bodyObject, textField, imageUrl, id, pagination, listResult, username, searchTerm, likePattern } from '../services/validation.js';

export const postRoutes = Router();
export const commentRoutes = Router();
export const topicRoutes = Router();

async function feed(req, res, followingOnly = false) {
  const paging = pagination(req.query);
  const values = [req.userId];
  const conditions = [];
  const parameter = (value) => { values.push(value); return '$' + values.length; };
  if (followingOnly) conditions.push('EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id)');
  if (req.query.username !== undefined) conditions.push('u.username = ' + parameter(username(req.query.username)));
  const query = searchTerm(req.query.q);
  if (query) conditions.push('p.content ILIKE ' + parameter(likePattern(query)));
  const limit = parameter(paging.limit + 1);
  const offset = parameter(paging.offset);
  const { rows } = await pool.query(
    'SELECT ' + postColumns + ' FROM posts p JOIN users u ON u.id = p.user_id' +
      (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') +
      ' ORDER BY p.created_at DESC, p.id DESC LIMIT ' + limit + ' OFFSET ' + offset,
    values,
  );
  res.json(listResult(rows, paging));
}
postRoutes.get('/', (req, res) => feed(req, res));
postRoutes.get('/following', (req, res) => feed(req, res, true));

postRoutes.post('/', async (req, res) => {
  const body = bodyObject(req.body);
  const content = textField(body.content, 'content', { max: 500 });
  const url = imageUrl(body.image_url, 'image_url');
  const post = await transaction(async (client) => {
    const { rows } = await client.query('INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING id', [req.userId, content, url]);
    return getPost(req.userId, rows[0].id, client);
  });
  res.status(201).json({ data: post });
});

postRoutes.get('/:id', async (req, res) => {
  res.json({ data: await getPost(req.userId, id(req.params.id)) });
});

postRoutes.patch('/:id', async (req, res) => {
  const postId = id(req.params.id);
  const body = bodyObject(req.body);
  const values = [postId];
  const updates = [];
  const add = (column, value) => { values.push(value); updates.push(column + ' = $' + values.length); };
  if (Object.hasOwn(body, 'content')) add('content', textField(body.content, 'content', { max: 500 }));
  if (Object.hasOwn(body, 'image_url')) add('image_url', imageUrl(body.image_url, 'image_url'));
  if (!updates.length) throw new HttpError(400, 'Supply content or image_url to edit your post.');
  const post = await transaction(async (client) => {
    const existing = await lockPost(postId, client);
    if (existing.user_id !== req.userId) throw new HttpError(403, 'You can only edit your own posts.');
    await client.query('UPDATE posts SET ' + updates.join(', ') + ', updated_at = now() WHERE id = $1', values);
    return getPost(req.userId, postId, client);
  });
  res.json({ data: post });
});

postRoutes.delete('/:id', async (req, res) => {
  const postId = id(req.params.id);
  await transaction(async (client) => {
    const existing = await lockPost(postId, client);
    if (existing.user_id !== req.userId) throw new HttpError(403, 'You can only delete your own posts.');
    await client.query('DELETE FROM posts WHERE id = $1', [postId]);
  });
  res.json({ data: { id: postId, deleted: true } });
});

postRoutes.post('/:id/like', async (req, res) => {
  const postId = id(req.params.id);
  const result = await transaction(async (client) => {
    const post = await lockPost(postId, client);
    const added = await client.query('INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING RETURNING id', [postId, req.userId]);
    if (added.rowCount) await notify(client, { recipientId: post.user_id, actorId: req.userId, type: 'like', postId });
    return { post: await getPost(req.userId, postId, client), added: added.rowCount > 0 };
  });
  res.status(result.added ? 201 : 200).json({ data: result.post });
});

postRoutes.delete('/:id/like', async (req, res) => {
  const postId = id(req.params.id);
  const post = await transaction(async (client) => {
    await lockPost(postId, client);
    await client.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [postId, req.userId]);
    await client.query("DELETE FROM notifications WHERE type = 'like' AND post_id = $1 AND actor_id = $2", [postId, req.userId]);
    return getPost(req.userId, postId, client);
  });
  res.json({ data: post });
});

postRoutes.get('/:id/comments', async (req, res) => {
  const postId = id(req.params.id);
  const paging = pagination(req.query);
  await getPost(req.userId, postId);
  const { rows } = await pool.query(
    'SELECT ' + commentColumns + ' FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = $1 ORDER BY c.created_at ASC, c.id ASC LIMIT $2 OFFSET $3',
    [postId, paging.limit + 1, paging.offset],
  );
  res.json(listResult(rows, paging));
});

postRoutes.post('/:id/comments', async (req, res) => {
  const postId = id(req.params.id);
  const content = textField(bodyObject(req.body).content, 'content', { max: 1000 });
  const comment = await transaction(async (client) => {
    const post = await lockPost(postId, client);
    const added = await client.query('INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id', [postId, req.userId, content]);
    await notify(client, { recipientId: post.user_id, actorId: req.userId, type: 'comment', postId, commentId: added.rows[0].id });
    const { rows } = await client.query('SELECT ' + commentColumns + ' FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1', [added.rows[0].id]);
    return rows[0];
  });
  res.status(201).json({ data: comment });
});

commentRoutes.delete('/:id', async (req, res) => {
  const commentId = id(req.params.id);
  const deleted = await transaction(async (client) => {
    const result = await client.query('DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING post_id', [commentId, req.userId]);
    if (!result.rowCount) {
      const found = await client.query('SELECT id FROM comments WHERE id = $1', [commentId]);
      if (!found.rowCount) throw new HttpError(404, 'This comment could not be found.');
      throw new HttpError(403, 'You can only delete your own comments.');
    }
    return { id: commentId, post_id: result.rows[0].post_id, deleted: true };
  });
  res.json({ data: deleted });
});

topicRoutes.get('/', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT '#' || lower(matches.tag[1]) AS topic, count(DISTINCT p.id)::int AS posts_count FROM posts p CROSS JOIN LATERAL regexp_matches(p.content, '#([a-zA-Z][a-zA-Z0-9_]{1,29})', 'g') AS matches(tag) WHERE p.created_at > now() - interval '90 days' GROUP BY lower(matches.tag[1]) ORDER BY posts_count DESC, topic ASC LIMIT 6",
  );
  res.json({ data: rows });
});

