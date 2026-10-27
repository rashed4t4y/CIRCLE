import { pool } from '../db.js';
import { HttpError } from './validation.js';

// Internal SQL fragments only. All user-supplied values use SQL parameters.
// Counts are subqueries in one database round trip, not per-user API calls.
export const userColumns = `u.id, u.full_name, u.username, u.bio, u.avatar_url, u.created_at,
  (SELECT count(*)::int FROM posts p WHERE p.user_id = u.id) AS posts_count,
  (SELECT count(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
  (SELECT count(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
  EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following`;

export const postColumns = `p.id, p.user_id, p.content, p.image_url, p.created_at, p.updated_at,
  json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username, 'avatar_url', u.avatar_url) AS author,
  (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) AS likes_count,
  (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS comments_count,
  EXISTS (SELECT 1 FROM likes l WHERE l.user_id = $1 AND l.post_id = p.id) AS is_liked`;

export const commentColumns = `c.id, c.post_id, c.user_id, c.content, c.created_at, c.updated_at,
  json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username, 'avatar_url', u.avatar_url) AS author`;

export async function getUser(viewerId, userId, client = pool, includeEmail = false) {
  const { rows } = await client.query('SELECT ' + userColumns + (includeEmail ? ', u.email' : '') + ' FROM users u WHERE u.id = $2', [viewerId, userId]);
  if (!rows[0]) throw new HttpError(404, 'This person could not be found.');
  return rows[0];
}

export async function getPost(viewerId, postId, client = pool) {
  const { rows } = await client.query('SELECT ' + postColumns + ' FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = $2', [viewerId, postId]);
  if (!rows[0]) throw new HttpError(404, 'This post could not be found.');
  return rows[0];
}

export async function lockPost(postId, client) {
  const { rows } = await client.query('SELECT id, user_id FROM posts WHERE id = $1 FOR UPDATE', [postId]);
  if (!rows[0]) throw new HttpError(404, 'This post could not be found.');
  return rows[0];
}

export async function notify(client, { recipientId, actorId, type, postId = null, commentId = null }) {
  if (recipientId === actorId) return;
  await client.query('INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id) VALUES ($1, $2, $3, $4, $5)', [recipientId, actorId, type, postId, commentId]);
}

