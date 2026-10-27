import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
const rootUrl = process.env.DATABASE_URL;
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Integration tests never fall back to the application's database.
test('CIRCLE REST API against PostgreSQL', { skip: !testUrl && 'Set TEST_DATABASE_URL to a separate migrated PostgreSQL database.' }, async t => {
  assert.notEqual(testUrl, rootUrl, 'TEST_DATABASE_URL must differ from DATABASE_URL');
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';
  const { app } = await import('../src/app.js');
  const pool = new pg.Pool({ connectionString: testUrl });
  const alice = request.agent(app);
  const bob = request.agent(app);
  const tag = randomBytes(5).toString('hex');
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const userA = { full_name: 'API Alice', username: `alice_${tag}`, email: `alice_${tag}@circle.example`, password, confirm_password: password };
  const userB = { full_name: 'API Bob', username: `bob_${tag}`, email: `bob_${tag}@circle.example`, password, confirm_password: password };
  let a, b, post, comment;
  const send = (agent, method, path, body) => agent[method](path).set('Origin', origin).send(body);
  const ok = (res, code = 200) => { assert.equal(res.status, code, JSON.stringify(res.body)); return res.body.data; };
  try {
    await t.test('health checks the database and protected routes reject anonymous users', async () => {
      ok(await request(app).get('/api/health'));
      assert.equal((await request(app).get('/api/posts')).status, 401);
    });
    await t.test('registration validates inputs and establishes a secure cookie session', async () => {
      const bad = await send(alice, 'post', '/api/auth/register', {...userA, email:'invalid',password:'short'});
      assert.equal(bad.status,400);
      const response = await send(alice, 'post', '/api/auth/register', userA);
      a = ok(response,201);
      const cookies = response.headers['set-cookie'].join(';');
      assert.match(cookies,/HttpOnly/i); assert.match(cookies,/SameSite=Lax/i);
      assert.equal(a.username,userA.username); assert.equal(a.password_hash,undefined);
      b = ok(await send(bob,'post','/api/auth/register',userB),201);
      assert.equal(ok(await alice.get('/api/auth/me')).id,a.id);
      const stored = await pool.query('SELECT password_hash FROM users WHERE id=$1',[a.id]);
      assert.match(stored.rows[0].password_hash,/^\$2[aby]\$/);
      assert.notEqual(stored.rows[0].password_hash,password);
    });
    await t.test('duplicate username and email are case-insensitively rejected', async () => {
      assert.equal((await send(request(app),'post','/api/auth/register',{...userA,email:`other_${tag}@circle.example`,username:userA.username.toUpperCase()})).status,409);
      assert.equal((await send(request(app),'post','/api/auth/register',{...userA,username:`other_${tag}`,email:userA.email.toUpperCase()})).status,409);
    });
    await t.test('CSRF origin protection rejects foreign and absent origins', async () => {
      assert.equal((await alice.post('/api/posts').send({content:'No origin'})).status,403);
      assert.equal((await alice.post('/api/posts').set('Origin','https://evil.example').send({content:'Bad origin'})).status,403);
    });
    await t.test('creates a post, validates lengths and URLs, ignores supplied identity', async () => {
      assert.equal((await send(alice,'post','/api/posts',{content:'x'.repeat(501)})).status,400);
      assert.equal((await send(alice,'post','/api/posts',{content:'hello',image_url:'javascript:alert(1)'})).status,400);
      post = ok(await send(alice,'post','/api/posts',{content:`A thoughtful #design post ${tag}`,user_id:b.id}),201);
      assert.equal(post.user_id,a.id); assert.equal(post.author.username,a.username);
      assert.equal(ok(await bob.get(`/api/posts/${post.id}`)).content,post.content);
    });
    await t.test('feed pagination, search and profile filtering use real records', async () => {
      const feed = await bob.get('/api/posts?limit=1'); ok(feed);
      assert.equal(feed.body.data.length,1); assert.equal(feed.body.pagination.limit,1);
      const own = ok(await bob.get(`/api/posts?username=${a.username}`)); assert.ok(own.some(p=>p.id===post.id));
      const search = ok(await bob.get(`/api/users/search?q=${a.username}`)); assert.ok(search.some(u=>u.id===a.id));
      ok(await bob.get('/api/users/search').query({q:"' OR 1=1 --"}));
      assert.equal((await bob.get('/api/posts?page=-1')).status,400);
    });
    await t.test('only the author can edit and delete a post', async () => {
      assert.equal((await send(bob,'patch',`/api/posts/${post.id}`,{content:'Hijacked'})).status,403);
      assert.equal((await send(bob,'delete',`/api/posts/${post.id}`)).status,403);
      const edited = ok(await send(alice,'patch',`/api/posts/${post.id}`,{content:`Updated #design ${tag}`}));
      assert.match(edited.content,/Updated/);
    });
    await t.test('like and unlike are idempotent and persisted', async () => {
      ok(await send(bob,'post',`/api/posts/${post.id}/like`),201);
      ok(await send(bob,'post',`/api/posts/${post.id}/like`));
      let viewed=ok(await bob.get(`/api/posts/${post.id}`)); assert.equal(viewed.likes_count,1); assert.equal(viewed.is_liked,true);
      ok(await send(bob,'delete',`/api/posts/${post.id}/like`));
      ok(await send(bob,'delete',`/api/posts/${post.id}/like`));
      viewed=ok(await bob.get(`/api/posts/${post.id}`)); assert.equal(viewed.likes_count,0); assert.equal(viewed.is_liked,false);
      ok(await send(bob,'post',`/api/posts/${post.id}/like`),201);
    });
    await t.test('follow graph rejects self-follows and supports both lists and following feed', async () => {
      assert.equal((await send(bob,'post',`/api/users/${b.id}/follow`)).status,400);
      ok(await send(bob,'post',`/api/users/${a.id}/follow`),201);
      ok(await send(bob,'post',`/api/users/${a.id}/follow`));
      assert.ok(ok(await bob.get('/api/posts/following')).some(p=>p.id===post.id));
      assert.ok(ok(await bob.get(`/api/users/${b.username}/following`)).some(u=>u.id===a.id));
      assert.ok(ok(await bob.get(`/api/users/${a.username}/followers`)).some(u=>u.id===b.id));
      assert.equal(ok(await bob.get(`/api/users/${a.username}`)).followers_count,1);
    });
    await t.test('comments validate content, enforce ownership and update counts', async () => {
      assert.equal((await send(bob,'post',`/api/posts/${post.id}/comments`,{content:'x'.repeat(1001)})).status,400);
      comment=ok(await send(bob,'post',`/api/posts/${post.id}/comments`,{content:'Love this idea.'}),201);
      assert.ok(ok(await alice.get(`/api/posts/${post.id}/comments`)).some(c=>c.id===comment.id));
      assert.equal(ok(await alice.get(`/api/posts/${post.id}`)).comments_count,1);
      assert.equal((await send(alice,'delete',`/api/comments/${comment.id}`)).status,403);
    });
    await t.test('profile updates validate fields and do not expose private emails', async () => {
      assert.equal((await send(alice,'patch','/api/users/me',{bio:'x'.repeat(241)})).status,400);
      const changed=ok(await send(alice,'patch','/api/users/me',{full_name:'Alice Updated',bio:'Making thoughtful things.',avatar_url:''}));
      assert.equal(changed.full_name,'Alice Updated');
      const viewed=ok(await bob.get(`/api/users/${a.username}`)); assert.equal(viewed.email,undefined); assert.equal(viewed.password_hash,undefined);
    });
    await t.test('persistent notifications track likes, follows and comments; read controls are scoped', async () => {
      const response=await alice.get('/api/notifications'); const notes=ok(response);
      for(const type of ['like','follow','comment']) assert.ok(notes.some(n=>n.type===type),`${type} notification missing`);
      assert.ok(response.body.unread_count>=3);
      assert.equal((await send(bob,'patch',`/api/notifications/${notes[0].id}/read`)).status,404);
      ok(await send(alice,'patch',`/api/notifications/${notes[0].id}/read`));
      ok(await send(alice,'patch','/api/notifications/read-all'));
      assert.equal((await alice.get('/api/notifications')).body.unread_count,0);
    });
    await t.test('deleting comments, unfollowing and deleting posts persist cleanly', async () => {
      ok(await send(bob,'delete',`/api/comments/${comment.id}`));
      assert.equal(ok(await alice.get(`/api/posts/${post.id}`)).comments_count,0);
      ok(await send(bob,'delete',`/api/users/${a.id}/follow`));
      assert.equal(ok(await bob.get(`/api/users/${a.username}`)).is_following,false);
      ok(await send(alice,'delete',`/api/posts/${post.id}`));
      assert.equal((await bob.get(`/api/posts/${post.id}`)).status,404);
    });
    await t.test('logout revokes sessions and login rejects incorrect credentials', async () => {
      ok(await send(alice,'post','/api/auth/logout'));
      assert.equal((await alice.get('/api/auth/me')).status,401);
      assert.equal((await send(alice,'post','/api/auth/login',{email:userA.email,password:'incorrect-password'})).status,401);
      ok(await send(alice,'post','/api/auth/login',{email:userA.email,password}));
      assert.equal(ok(await alice.get('/api/auth/me')).id,a.id);
      ok(await send(alice,'post','/api/auth/logout'));
    });
  } finally {
    // Only this run's fictional accounts are removed; cascading FKs remove their test records.
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])',[[userA.email,userB.email,`other_${tag}@circle.example`]]);
    await pool.end();
    const database=await import('../src/db.js').catch(()=>null);
    if(database?.pool) await database.pool.end();
  }
});
