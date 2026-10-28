import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool, transaction } from '../db.js';
import { HttpError, bodyObject, id, textField, pagination, listResult } from '../services/validation.js';
import { conversationFor, otherParticipant, unreadCount } from '../services/messaging.js';
import { publishConversation } from '../services/realtime.js';

export const messageRoutes = Router();
const writeLimit = rateLimit({
  windowMs: 60_000, limit: 60, keyGenerator: req => String(req.userId),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { message: 'You are sending too quickly. Please pause for a moment.' } },
});
messageRoutes.get('/unread', async (req, res) => res.json({ data: { count: await unreadCount(req.userId) } }));
messageRoutes.get('/', async (req, res) => {
  const paging = pagination(req.query);
  const { rows } = await pool.query([
    'SELECT c.id, c.created_at, c.updated_at,',
    "json_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name, 'avatar_url', u.avatar_url) AS participant,",
    '(SELECT row_to_json(last_message) FROM (SELECT m.content, m.created_at, m.sender_id FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message) AS latest_message,',
    '(SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.recipient_id=$1 AND m.read_at IS NULL) AS unread_count',
    'FROM conversations c JOIN users u ON u.id=CASE WHEN c.user_low=$1 THEN c.user_high ELSE c.user_low END',
    'WHERE c.user_low=$1 OR c.user_high=$1 ORDER BY c.updated_at DESC, c.id DESC LIMIT $2 OFFSET $3',
  ].join(' '), [req.userId, paging.limit + 1, paging.offset]);
  res.json(listResult(rows, paging));
});
messageRoutes.post('/', writeLimit, async (req, res) => {
  const target = id(bodyObject(req.body).user_id);
  if (target === req.userId) throw new HttpError(400, 'Choose another person to message.');
  const low = Math.min(target, req.userId), high = Math.max(target, req.userId);
  const result = await transaction(async client => {
    const exists = await client.query('SELECT id FROM users WHERE id=$1 FOR KEY SHARE', [target]);
    if (!exists.rowCount) throw new HttpError(404, 'This person could not be found.');
    const inserted = await client.query('INSERT INTO conversations(user_low,user_high) VALUES($1,$2) ON CONFLICT(user_low,user_high) DO NOTHING RETURNING *', [low, high]);
    const conversation = inserted.rows[0] || (await client.query('SELECT * FROM conversations WHERE user_low=$1 AND user_high=$2', [low, high])).rows[0];
    return { conversation, created: Boolean(inserted.rowCount) };
  });
  await publishConversation(result.conversation);
  res.status(result.created ? 201 : 200).json({ data: { id: result.conversation.id } });
});
messageRoutes.get('/:id', async (req, res) => {
  const conversation = await conversationFor(req.userId, id(req.params.id));
  const { rows } = await pool.query('SELECT id, username, full_name, avatar_url FROM users WHERE id=$1', [otherParticipant(conversation, req.userId)]);
  res.json({ data: { id: conversation.id, participant: rows[0] } });
});
messageRoutes.get('/:id/messages', async (req, res) => {
  const conversationId = id(req.params.id);
  await conversationFor(req.userId, conversationId);
  const before = req.query.before === undefined ? null : id(req.query.before);
  const limit = req.query.limit === undefined ? 30 : id(req.query.limit);
  if (limit > 50) throw new HttpError(400, 'Use a limit from 1 to 50.');
  const { rows } = await pool.query('SELECT id, conversation_id, sender_id, recipient_id, content, created_at, read_at, client_id FROM messages WHERE conversation_id=$1 AND ($2::int IS NULL OR id<$2) ORDER BY id DESC LIMIT $3', [conversationId, before, limit + 1]);
  const messages = rows.slice(0, limit).reverse();
  res.json({ data: messages, pagination: { has_more: rows.length > limit, before: messages[0]?.id || null } });
});
messageRoutes.post('/:id/messages', writeLimit, async (req, res) => {
  const conversationId = id(req.params.id), body = bodyObject(req.body);
  const content = textField(body.content, 'message', { max: 4000 });
  if (typeof body.client_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.client_id)) throw new HttpError(400, 'Supply a valid message client_id UUID.');
  const result = await transaction(async client => {
    const conversation = await conversationFor(req.userId, conversationId, client, true);
    const inserted = await client.query('INSERT INTO messages(conversation_id,sender_id,recipient_id,content,client_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(conversation_id,sender_id,client_id) DO NOTHING RETURNING *', [conversationId, req.userId, otherParticipant(conversation, req.userId), content, body.client_id]);
    const message = inserted.rows[0] || (await client.query('SELECT * FROM messages WHERE conversation_id=$1 AND sender_id=$2 AND client_id=$3', [conversationId, req.userId, body.client_id])).rows[0];
    if (message.content !== content) throw new HttpError(409, 'This message identifier was already used.');
    if (inserted.rowCount) await client.query('UPDATE conversations SET updated_at=clock_timestamp() WHERE id=$1', [conversationId]);
    return { conversation, message, created: Boolean(inserted.rowCount) };
  });
  await publishConversation(result.conversation);
  res.status(result.created ? 201 : 200).json({ data: result.message });
});
messageRoutes.patch('/:id/read', async (req, res) => {
  const conversationId = id(req.params.id), through = id(bodyObject(req.body).through_id);
  const result = await transaction(async client => {
    const conversation = await conversationFor(req.userId, conversationId, client, true);
    const target = await client.query('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2', [through, conversationId]);
    if (!target.rowCount) throw new HttpError(400, 'Read cursor is not in this conversation.');
    const updated = await client.query('UPDATE messages SET read_at=clock_timestamp() WHERE conversation_id=$1 AND recipient_id=$2 AND id<=$3 AND read_at IS NULL', [conversationId, req.userId, through]);
    return { conversation, changed: updated.rowCount };
  });
  if (result.changed) await publishConversation(result.conversation);
  res.json({ data: { count: await unreadCount(req.userId) } });
});
