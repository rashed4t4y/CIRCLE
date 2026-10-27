import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import request from 'supertest';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
const applicationUrl = process.env.DATABASE_URL;
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// This suite requires the explicitly designated, separately migrated test database.
// It never resets tables or falls back to the development database.
test('CIRCLE concurrent writes and session security', {
  skip: !testUrl && 'Set TEST_DATABASE_URL to a separate migrated PostgreSQL database.',
}, async t => {
  assert.notEqual(testUrl, applicationUrl, 'TEST_DATABASE_URL must differ from DATABASE_URL');
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';
  const { app } = await import('../src/app.js');
  const { pool: applicationPool } = await import('../src/db.js');
  const pool = new pg.Pool({
    connectionString: testUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  const tag = randomBytes(6).toString('hex');
  const password = 'Security-' + randomBytes(12).toString('hex');
  const accounts = [
    { full_name: 'Security Author', username: 'sec_a_' + tag, email: 'sec_a_' + tag + '@circle.example', password },
    { full_name: 'Security Actor', username: 'sec_b_' + tag, email: 'sec_b_' + tag + '@circle.example', password },
  ];
  const send = (cookie, method, path, body) => {
    const req = request(app)[method](path).set('Origin', origin);
    if (cookie) req.set('Cookie', cookie);
    return req.send(body);
  };
  const ok = (response, allowed = [200]) => {
    assert.ok(allowed.includes(response.status), response.status + ': ' + JSON.stringify(response.body));
    return response.body.data;
  };
  const cookieFrom = response => {
    const value = response.headers['set-cookie']?.find(cookie => cookie.startsWith('circle_session='));
    assert.ok(value, 'A session cookie must be set.');
    return value.split(';', 1)[0];
  };
  let author, actor, authorCookie, actorCookie, post;

  try {
    for (const [index, account] of accounts.entries()) {
      const response = await send(null, 'post', '/api/auth/register', account);
      const user = ok(response, [201]);
      const cookie = cookieFrom(response);
      if (index === 0) { author = user; authorCookie = cookie; }
      else { actor = user; actorCookie = cookie; }
    }
    post = ok(await send(authorCookie, 'post', '/api/posts', { content: 'Concurrency fixture ' + tag }), [201]);

    await t.test('parallel likes create one relationship and one notification', async () => {
      const responses = await Promise.all(Array.from({ length: 8 }, () =>
        send(actorCookie, 'post', '/api/posts/' + post.id + '/like')));
      responses.forEach(response => ok(response, [200, 201]));
      assert.equal(responses.filter(response => response.status === 201).length, 1);
      const stored = await pool.query(
        "SELECT (SELECT count(*)::int FROM likes WHERE post_id=$1 AND user_id=$2) AS likes, (SELECT count(*)::int FROM notifications WHERE post_id=$1 AND actor_id=$2 AND recipient_id=$3 AND type='like') AS notifications",
        [post.id, actor.id, author.id],
      );
      assert.deepEqual(stored.rows[0], { likes: 1, notifications: 1 });
      const response = await send(actorCookie, 'get', '/api/posts/' + post.id);
      assert.equal(ok(response).likes_count, 1);
    });

    await t.test('parallel follows create one relationship and one notification', async () => {
      const responses = await Promise.all(Array.from({ length: 8 }, () =>
        send(actorCookie, 'post', '/api/users/' + author.id + '/follow')));
      responses.forEach(response => ok(response, [200, 201]));
      assert.equal(responses.filter(response => response.status === 201).length, 1);
      const stored = await pool.query(
        "SELECT (SELECT count(*)::int FROM follows WHERE follower_id=$1 AND following_id=$2) AS follows, (SELECT count(*)::int FROM notifications WHERE actor_id=$1 AND recipient_id=$2 AND type='follow') AS notifications",
        [actor.id, author.id],
      );
      assert.deepEqual(stored.rows[0], { follows: 1, notifications: 1 });
    });

    await t.test('racing follow and unfollow keep notifications consistent', async () => {
      const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        send(actorCookie, index % 2 ? 'post' : 'delete', '/api/users/' + author.id + '/follow')));
      responses.forEach(response => ok(response, [200, 201]));
      const stored = await pool.query(
        "SELECT (SELECT count(*)::int FROM follows WHERE follower_id=$1 AND following_id=$2) AS follows, (SELECT count(*)::int FROM notifications WHERE actor_id=$1 AND recipient_id=$2 AND type='follow') AS notifications",
        [actor.id, author.id],
      );
      assert.ok([0, 1].includes(stored.rows[0].follows));
      assert.equal(stored.rows[0].notifications, stored.rows[0].follows);
      // Restore a known relationship before verifying post deletion isolation.
      ok(await send(actorCookie, 'post', '/api/users/' + author.id + '/follow'), [200, 201]);
    });

    await t.test('malformed JSON and foreign origins fail without changing content', async () => {
      const malformed = await request(app).post('/api/posts')
        .set('Origin', origin).set('Cookie', authorCookie)
        .set('Content-Type', 'application/json').send('{"content":');
      assert.equal(malformed.status, 400);
      assert.deepEqual(malformed.body, { error: { message: 'The request contains invalid JSON.' } });
      const hostile = await request(app).patch('/api/posts/' + post.id)
        .set('Origin', 'https://untrusted.example').set('Cookie', authorCookie)
        .send({ content: 'CSRF changed this post' });
      assert.equal(hostile.status, 403);
      assert.equal(ok(await send(authorCookie, 'get', '/api/posts/' + post.id)).content, post.content);
      const stored = await pool.query('SELECT count(*)::int AS count FROM posts WHERE user_id=$1', [author.id]);
      assert.equal(stored.rows[0].count, 1);
    });

    await t.test('deleting a post cascades through comments, likes, and related notifications', async () => {
      const comment = ok(await send(actorCookie, 'post', '/api/posts/' + post.id + '/comments', { content: 'Cascade fixture' }), [201]);
      const before = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE post_id=$1', [post.id]);
      assert.equal(before.rows[0].count, 2);
      ok(await send(authorCookie, 'delete', '/api/posts/' + post.id));
      const stored = await pool.query(
        'SELECT (SELECT count(*)::int FROM posts WHERE id=$1) AS posts, (SELECT count(*)::int FROM likes WHERE post_id=$1) AS likes, (SELECT count(*)::int FROM comments WHERE id=$2 OR post_id=$1) AS comments, (SELECT count(*)::int FROM notifications WHERE post_id=$1 OR comment_id=$2) AS notifications',
        [post.id, comment.id],
      );
      assert.deepEqual(stored.rows[0], { posts: 0, likes: 0, comments: 0, notifications: 0 });
      const graph = await pool.query(
        "SELECT (SELECT count(*)::int FROM follows WHERE follower_id=$1 AND following_id=$2) AS follows, (SELECT count(*)::int FROM notifications WHERE actor_id=$1 AND recipient_id=$2 AND type='follow') AS notifications",
        [actor.id, author.id],
      );
      assert.deepEqual(graph.rows[0], { follows: 1, notifications: 1 });
      assert.equal((await send(actorCookie, 'get', '/api/posts/' + post.id)).status, 404);
    });

    await t.test('sessions store only token hashes and logout revokes replayed cookies', async () => {
      const rawToken = authorCookie.slice('circle_session='.length);
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');
      const before = await pool.query('SELECT token_hash FROM sessions WHERE user_id=$1', [author.id]);
      assert.equal(before.rowCount, 1);
      assert.equal(before.rows[0].token_hash, expectedHash);
      assert.notEqual(before.rows[0].token_hash, rawToken);
      ok(await send(authorCookie, 'post', '/api/auth/logout'));
      // Use the original cookie explicitly; this tests revocation, not just client deletion.
      assert.equal((await send(authorCookie, 'get', '/api/auth/me')).status, 401);
      const after = await pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1', [expectedHash]);
      assert.equal(after.rowCount, 0);
    });

    await t.test('signing in rotates the current token and expired sessions cannot authenticate', async () => {
      const first = await send(null, 'post', '/api/auth/login', { email: accounts[0].email, password });
      ok(first);
      const firstCookie = cookieFrom(first);
      const second = await send(firstCookie, 'post', '/api/auth/login', { email: accounts[0].email, password });
      ok(second);
      const secondCookie = cookieFrom(second);
      assert.notEqual(secondCookie, firstCookie);
      assert.equal((await send(firstCookie, 'get', '/api/auth/me')).status, 401);
      assert.equal(ok(await send(secondCookie, 'get', '/api/auth/me')).id, author.id);
      const hash = createHash('sha256').update(secondCookie.slice('circle_session='.length)).digest('hex');
      await pool.query("UPDATE sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE token_hash=$1 AND user_id=$2", [hash, author.id]);
      assert.equal((await send(secondCookie, 'get', '/api/auth/me')).status, 401);
    });
  } finally {
    // Remove only this run's randomly named fictional accounts and their FK descendants.
    try {
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[]) AND username = ANY($2::text[])', [
        accounts.map(account => account.email),
        accounts.map(account => account.username),
      ]);
    } finally {
      await pool.end();
      await applicationPool.end();
    }
  }
});

