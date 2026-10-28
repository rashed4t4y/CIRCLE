import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import request from 'supertest';
import { io as connect } from 'socket.io-client';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error('Timed out waiting for ' + name)); }, 4000);
    function receive(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, receive);
  });
}
test('Private messaging: persistence, isolation, concurrency, and real-time sessions', {
  skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL is required.',
}, async t => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { app } = await import('../src/app.js');
  const { pool } = await import('../src/db.js');
  const { createSession, tokenHash } = await import('../src/services/session.js');
  const { attachRealtime } = await import('../src/services/realtime.js');
  const server = createServer(app);
  const realtime = attachRealtime(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const users = [], cookies = [], tokens = [], sockets = [];
  const send = (index, method, path, body) => {
    const req = request(app)[method]('/api/conversations' + path).set('Origin', origin);
    if (index !== null) req.set('Cookie', cookies[index]);
    return req.send(body);
  };
  const ok = (res, statuses = [200]) => { assert.ok(statuses.includes(res.status), JSON.stringify(res.body)); return res.body.data; };
  const message = (index, conversation, content, client_id = randomUUID()) => send(index, 'post', '/' + conversation + '/messages', { content, client_id, sender_id: users[2] });
  const socket = (index, extra = {}) => {
    const instance = connect(url, {
      autoConnect: false, forceNew: true, reconnection: false, timeout: 2000,
      transports: ['websocket'], extraHeaders: { Origin: origin, ...(index !== null ? { Cookie: cookies[index] } : {}), ...extra },
    });
    sockets.push(instance); return instance;
  };
  let conversation, first, last, recipientSocket, senderSocket, strangerSocket;
  try {
    for (let index = 0; index < 3; index++) {
      const tag = 'msg_' + randomBytes(6).toString('hex');
      const { rows } = await pool.query("INSERT INTO users(full_name, username, email, password_hash) VALUES($1,$1,$2,'test-only') RETURNING id", [tag, tag + '@circle.example']);
      users.push(rows[0].id);
      const session = await createSession(pool, rows[0].id);
      tokens.push(session.token); cookies.push('circle_session=' + session.token);
    }
    await t.test('empty inbox and unauthenticated access', async () => {
      assert.deepEqual(ok(await send(0, 'get', '')), []);
      assert.equal(ok(await send(0, 'get', '/unread')).count, 0);
      assert.equal((await send(null, 'get', '')).status, 401);
      assert.equal((await send(0, 'post', '', { user_id: users[0] })).status, 400);
    });
    await t.test('opposite concurrent requests reuse exactly one conversation', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, (_, index) => send(index % 2, 'post', '', { user_id: users[1 - index % 2] })));
      const ids = results.map(result => ok(result, [200, 201]).id);
      assert.equal(new Set(ids).size, 1);
      assert.equal(results.filter(result => result.status === 201).length, 1);
      conversation = ids[0];
      assert.deepEqual(ok(await send(0, 'get', '/' + conversation + '/messages')), []);
      assert.equal(ok(await send(0, 'get', '/' + conversation)).participant.id, users[1]);
    });
    await t.test('all conversation reads and writes enforce membership', async () => {
      for (const path of ['/' + conversation, '/' + conversation + '/messages']) assert.equal((await send(2, 'get', path)).status, 404);
      assert.equal((await message(2, conversation, 'intrusion')).status, 404);
      assert.equal((await send(2, 'patch', '/' + conversation + '/read', { through_id: 1 })).status, 404);
      assert.deepEqual(ok(await send(2, 'get', '')), []);
    });
    await t.test('rejects empty, long, invalid-id and foreign-origin messages', async () => {
      for (const content of ['', '  ', 'x'.repeat(4001)]) assert.equal((await message(0, conversation, content)).status, 400);
      assert.equal((await send(0, 'post', '/' + conversation + '/messages', { content: 'hello', client_id: 'invalid' })).status, 400);
      assert.equal((await send(0, 'get', '/' + conversation + '/messages?before=oops')).status, 400);
      assert.equal((await send(0, 'get', '/' + conversation + '/messages?limit=51')).status, 400);
      assert.equal((await request(app).post('/api/conversations/' + conversation + '/messages').set('Cookie', cookies[0]).set('Origin', 'https://evil.example').send({ content: 'x', client_id: randomUUID() })).status, 403);
    });
    await t.test('polling accepts verified same-origin requests and rejects missing or foreign provenance', async () => {
      const endpoint = '/socket.io/?EIO=4&transport=polling';
      assert.equal((await request(server).get(endpoint)).status, 403);
      assert.equal((await request(server).get(endpoint).set('Sec-Fetch-Site', 'cross-site').set('Host', new URL(origin).host)).status, 403);
      assert.equal((await request(server).get(endpoint).set('Sec-Fetch-Site', 'same-origin').set('Host', 'evil.example')).status, 403);
      assert.equal((await request(server).get(endpoint).set('Sec-Fetch-Site', 'same-origin').set('Host', new URL(origin).host)).status, 200);
    });
    await t.test('socket authentication rejects missing, forged, expired and wrong-origin sessions', async () => {
      for (const [index, headers] of [[null, {}], [null, { Cookie: 'circle_session=' + 'a'.repeat(64) }], [0, { Origin: 'https://evil.example' }]]) {
        const client = socket(index, headers), rejected = event(client, 'connect_error');
        client.connect(); await rejected; assert.equal(client.connected, false); client.disconnect();
      }
      const expired = await createSession(pool, users[2]);
      await pool.query("UPDATE sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE token_hash=$1", [tokenHash(expired.token)]);
      const client = socket(null, { Cookie: 'circle_session=' + expired.token }), rejected = event(client, 'connect_error');
      client.connect(); await rejected; client.disconnect();
      for (const index of [0, 1, 2]) {
        const client = socket(index), ready = event(client, 'connect');
        client.connect(); await ready;
        if (index === 0) senderSocket = client;
        if (index === 1) recipientSocket = client;
        if (index === 2) strangerSocket = client;
      }
    });
    await t.test('persists before private delivery; sender identity cannot be spoofed; retries are idempotent', async () => {
      let leaked = 0; strangerSocket.on('conversation:changed', () => leaked++);
      const received = event(recipientSocket, 'conversation:changed');
      const clientId = randomUUID();
      const results = await Promise.all([message(0, conversation, 'Hello privately', clientId), message(0, conversation, 'Hello privately', clientId)]);
      first = ok(results[0], [200, 201]);
      assert.equal(first.sender_id, users[0]); assert.equal(first.recipient_id, users[1]);
      assert.equal(ok(results[1], [200, 201]).id, first.id);
      assert.deepEqual(await received, { conversation_id: conversation });
      assert.equal(ok(await send(1, 'get', '/' + conversation + '/messages'))[0].content, 'Hello privately');
      assert.equal((await message(0, conversation, 'different text', clientId)).status, 409);
      await delay(80); assert.equal(leaked, 0);
      assert.equal(ok(await send(1, 'get', '/unread')).count, 1);
      assert.equal(ok(await send(0, 'get', '/unread')).count, 0);
      assert.equal(ok(await send(1, 'get', ''))[0].unread_count, 1);
    });
    await t.test('cursor history is chronological and read cursors do not consume later messages', async () => {
      for (let i = 0; i < 5; i++) last = ok(await message(0, conversation, 'History ' + i), [201]);
      let before, collected = [];
      do {
        const response = await send(1, 'get', '/' + conversation + '/messages?limit=2' + (before ? '&before=' + before : ''));
        const data = ok(response);
        assert.ok(data.length <= 2);
        if (data.length === 2) assert.ok(data[0].id < data[1].id);
        collected = [...data, ...collected];
        before = response.body.pagination.has_more ? response.body.pagination.before : null;
      } while (before);
      assert.equal(collected.length, 6); assert.equal(new Set(collected.map(m => m.id)).size, 6);
      const readEvent = event(senderSocket, 'conversation:changed');
      ok(await send(1, 'patch', '/' + conversation + '/read', { through_id: first.id, user_id: users[0] }));
      await readEvent;
      assert.equal(ok(await send(1, 'get', '/unread')).count, 5);
      ok(await send(0, 'patch', '/' + conversation + '/read', { through_id: last.id, user_id: users[1] }));
      assert.equal(ok(await send(1, 'get', '/unread')).count, 5);
      await Promise.all([send(1, 'patch', '/' + conversation + '/read', { through_id: last.id }).then(ok), message(0, conversation, 'Arriving during read').then(r => ok(r, [201]))]);
      assert.equal(ok(await send(1, 'get', '/unread')).count, 1);
      const history = ok(await send(0, 'get', '/' + conversation + '/messages'));
      assert.ok(history[0].read_at); assert.equal(history.at(-1).read_at, null);
    });
    await t.test('foreign read cursor is rejected; activity sorting follows latest message', async () => {
      const other = ok(await send(0, 'post', '', { user_id: users[2] }), [201]).id;
      const otherMessage = ok(await message(0, other, 'Other chat'), [201]);
      assert.equal((await send(1, 'patch', '/' + conversation + '/read', { through_id: otherMessage.id })).status, 400);
      assert.equal(ok(await send(0, 'get', ''))[0].id, other);
      ok(await message(1, conversation, 'Latest activity'), [201]);
      assert.equal(ok(await send(0, 'get', ''))[0].id, conversation);
      const page = await send(0, 'get', '?limit=1');
      assert.equal(ok(page).length, 1); assert.equal(page.body.pagination.has_more, true);
    });
    await t.test('reconnect retrieves missed messages from PostgreSQL', async () => {
      recipientSocket.disconnect();
      const missed = ok(await message(0, conversation, 'Sent while disconnected'), [201]);
      const ready = event(recipientSocket, 'connect');
      recipientSocket.connect(); await ready;
      assert.ok(ok(await send(1, 'get', '/' + conversation + '/messages')).some(m => m.id === missed.id));
    });
    await t.test('revoked sockets are disconnected before any further delivery', async () => {
      let received = 0; recipientSocket.on('conversation:changed', () => received++);
      const response = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookies[1]);
      assert.equal(response.status, 200);
      const disconnected = event(recipientSocket, 'disconnect');
      ok(await message(0, conversation, 'After logout'), [201]);
      await disconnected; assert.equal(received, 0);
      assert.equal((await send(1, 'get', '/' + conversation + '/messages')).status, 401);
    });
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => realtime.close(resolve));
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    await pool.end();
  }
});
