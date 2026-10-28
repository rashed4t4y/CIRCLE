import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import request from 'supertest';
import sharp from 'sharp';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
test('Profile media persists, validates content, and enforces ownership', {
  skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL is required.',
}, async t => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const directory = await mkdtemp(path.join(tmpdir(), 'circle-media-'));
  process.env.UPLOAD_DIR = directory;
  const { app } = await import('../src/app.js');
  const { pool } = await import('../src/db.js');
  const { createSession } = await import('../src/services/session.js');
  const users = [];
  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#8977cc' } }).png().toBuffer();
  let cookie, otherCookie, avatar;
  const upload = () => request(app).post('/api/users/me/media').set('Origin', origin).set('Cookie', cookie);
  try {
    for (let i = 0; i < 2; i++) {
      const tag = 'media_' + randomBytes(6).toString('hex');
      const { rows } = await pool.query("INSERT INTO users(full_name, username, email, password_hash) VALUES($1,$1,$2,'test-only') RETURNING id", [tag, tag + '@circle.example']);
      users.push(rows[0].id);
      const session = await createSession(pool, rows[0].id);
      if (i === 0) cookie = 'circle_session=' + session.token;
      else otherCookie = 'circle_session=' + session.token;
    }
    await t.test('uploads both decoded images, saves relative paths, and serves them safely', async () => {
      const response = await upload().field('bio', 'Photo test').attach('avatar', png, 'misleading.txt').attach('cover', png, 'cover.png');
      assert.equal(response.status, 200);
      avatar = response.body.data.avatar_url;
      assert.match(avatar, /^\/uploads\/[a-f0-9-]+\.webp$/);
      assert.match(response.body.data.cover_url, /\.webp$/);
      const served = await request(app).get(avatar);
      assert.equal(served.status, 200); assert.match(served.headers['content-type'], /image\/webp/);
      const profile = await pool.query('SELECT avatar_url, cover_url FROM users WHERE id=$1', [users[0]]);
      assert.equal(profile.rows[0].avatar_url, avatar);
      assert.ok(profile.rows[0].cover_url);
    });
    await t.test('rejects spoofed, truncated, unsupported, oversized and unexpected files', async () => {
      for (const bytes of [Buffer.from('<svg></svg>'), Buffer.from('not an image'), png.subarray(0, 30)]) {
        assert.equal((await upload().attach('avatar', bytes, { filename: 'fake.png', contentType: 'image/png' })).status, 400);
      }
      assert.equal((await upload().attach('avatar', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.png')).status, 413);
      assert.equal((await upload().attach('unexpected', png, 'x.png')).status, 400);
      assert.equal((await upload().field('remove_cover', 'false')).status, 400);
    });
    await t.test('requires authentication and origin; cannot target another profile', async () => {
      assert.equal((await request(app).post('/api/users/me/media').set('Origin', origin).attach('avatar', png, 'x.png')).status, 401);
      assert.equal((await request(app).post('/api/users/me/media').set('Cookie', cookie).attach('avatar', png, 'x.png')).status, 403);
      assert.equal((await upload().field('user_id', String(users[1])).attach('avatar', png, 'x.png')).status, 400);
      assert.equal((await request(app).post('/api/users/' + users[0] + '/media').set('Origin', origin).set('Cookie', otherCookie).attach('avatar', png, 'x.png')).status, 404);
    });
    await t.test('replacement removes the old file, removal restores null, missing files return 404', async () => {
      const replaced = await upload().attach('avatar', png, 'new.png');
      assert.equal(replaced.status, 200); assert.notEqual(replaced.body.data.avatar_url, avatar);
      await assert.rejects(access(path.join(directory, path.basename(avatar))));
      assert.equal((await request(app).get(avatar)).status, 404);
      const removed = await upload().field('remove_avatar', 'true').field('remove_cover', 'true');
      assert.equal(removed.status, 200);
      assert.equal(removed.body.data.avatar_url, null); assert.equal(removed.body.data.cover_url, null);
      const { readdir } = await import('node:fs/promises');
      assert.deepEqual(await readdir(directory), []);
    });
  } finally {
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
