import { pool } from '../db.js';
import { HttpError } from './validation.js';

export async function conversationFor(userId, conversationId, client = pool, lock = false) {
  const { rows } = await client.query(
    'SELECT * FROM conversations WHERE id=$1 AND (user_low=$2 OR user_high=$2)' + (lock ? ' FOR UPDATE' : ''),
    [conversationId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Conversation not found.');
  return rows[0];
}
export const otherParticipant = (conversation, userId) => conversation.user_low === userId ? conversation.user_high : conversation.user_low;
export async function unreadCount(userId) {
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM messages WHERE recipient_id=$1 AND read_at IS NULL', [userId]);
  return rows[0].count;
}
