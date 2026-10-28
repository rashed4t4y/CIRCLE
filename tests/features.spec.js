import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from '../server/node_modules/dotenv/lib/main.js';
import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../server/package.json', import.meta.url))('sharp');

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
test.describe.configure({ mode: 'serial' });
let server, realtime, pool, url, directory, users = [], sessions = [], contexts = [], alice, bob, photo;
test.beforeAll(async ({ browser }) => {
  if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error('Configure a separate migrated TEST_DATABASE_URL.');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  directory = await mkdtemp(path.join(tmpdir(), 'circle-browser-'));
  process.env.UPLOAD_DIR = directory;
  server = createServer();
  await new Promise(resolve => server.listen(0, 'localhost', resolve));
  url = 'http://localhost:' + server.address().port;
  process.env.CLIENT_ORIGIN = url;
  process.env.SERVER_ORIGIN = url;
  const { app } = await import('../server/src/app.js');
  ({ pool } = await import('../server/src/db.js'));
  const { attachRealtime } = await import('../server/src/services/realtime.js');
  const { createSession } = await import('../server/src/services/session.js');
  server.on('request', app);
  realtime = attachRealtime(server);
  for (const [index, name] of ['Alice', 'Bob', 'Carol'].entries()) {
    const username = 'ui_' + randomBytes(6).toString('hex');
    const { rows } = await pool.query("INSERT INTO users(full_name,username,email,password_hash) VALUES($1,$2,$3,'test-only') RETURNING id, username, full_name", ['Browser ' + name, username, username + '@circle.example']);
    users.push(rows[0]);
    sessions.push(await createSession(pool, rows[0].id));
    if (index < 2) {
      const context = await browser.newContext({ viewport: index === 0 ? { width: 1440, height: 1000 } : { width: 390, height: 844 } });
      contexts.push(context);
      await context.addCookies([{ name: 'circle_session', value: sessions[index].token, url, httpOnly: true, sameSite: 'Lax' }]);
    }
  }
  alice = await contexts[0].newPage(); bob = await contexts[1].newPage();
  photo = { name: 'test.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 600, height: 300, channels: 3, background: '#6D5CE8' } }).png().toBuffer() };
});
test.afterAll(async () => {
  await Promise.all(contexts.map(context => context.close()));
  if (realtime) await new Promise(resolve => realtime.close(resolve));
  else if (server) await new Promise(resolve => server.close(resolve));
  if (pool) { await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users.map(user => user.id)]); await pool.end(); }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('profile previews, cancel, persisted images, replacement and removal', async () => {
  await alice.goto(url + '/u/' + users[0].username);
  await alice.getByRole('button', { name: 'Edit profile' }).click();
  await alice.getByLabel('Profile photo', { exact: true }).setInputFiles(photo);
  await alice.getByLabel('Cover photo', { exact: true }).setInputFiles(photo);
  await expect(alice.locator('.modal .avatar img')).toHaveAttribute('src', /^blob:/);
  await expect(alice.locator('.modal .profile-cover img')).toHaveAttribute('src', /^blob:/);
  await alice.getByRole('button', { name: 'Save changes' }).click();
  await expect(alice.getByRole('dialog')).toHaveCount(0);
  await expect(alice.locator('.profile-header .avatar img')).toHaveAttribute('src', /^\/uploads\//);
  await expect(alice.locator('.profile-header .profile-cover img')).toHaveAttribute('src', /^\/uploads\//);
  const old = await alice.locator('.profile-header .avatar img').getAttribute('src');
  await alice.reload();
  await expect(alice.locator('.profile-header .avatar img')).toHaveAttribute('src', old);
  await alice.getByRole('button', { name: 'Edit profile' }).click();
  await alice.getByRole('button', { name: 'Remove profile photo' }).click();
  await alice.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(alice.locator('.profile-header .avatar img')).toHaveAttribute('src', old);
  await alice.getByRole('button', { name: 'Edit profile' }).click();
  await alice.getByLabel('Profile photo', { exact: true }).setInputFiles(photo);
  await alice.getByRole('button', { name: 'Save changes' }).click();
  await expect(alice.getByRole('dialog')).toHaveCount(0);
  await expect(alice.locator('.profile-header .avatar img')).not.toHaveAttribute('src', old);
  await alice.screenshot({ path: 'test-results/profile-desktop.png', fullPage: true });
  await alice.getByRole('button', { name: 'Edit profile' }).click();
  await alice.getByRole('button', { name: 'Remove profile photo' }).click();
  await alice.getByRole('button', { name: 'Remove cover photo' }).click();
  await alice.getByRole('button', { name: 'Save changes' }).click();
  await expect(alice.getByRole('dialog')).toHaveCount(0);
  await expect(alice.locator('.profile-header img')).toHaveCount(0);
});

test('desktop and mobile messaging: empty inbox, live unread badge, read receipt, Enter and newline', async () => {
  await bob.goto(url + '/messages');
  await expect(bob.getByText('Say a little hello')).toBeVisible();
  await alice.goto(url + '/u/' + users[1].username);
  await alice.getByRole('button', { name: 'Message', exact: true }).click();
  await expect(alice).toHaveURL(/\/messages\/\d+$/);
  await expect(alice.getByText('Every connection starts somewhere')).toBeVisible();
  await alice.getByLabel('Your message').fill('Hello Bob');
  await alice.getByLabel('Your message').press('Shift+Enter');
  await alice.getByLabel('Your message').pressSequentially('A new line');
  await expect(alice.getByLabel('Your message')).toHaveValue('Hello Bob\nA new line');
  await alice.getByLabel('Your message').press('Enter');
  await expect(alice.locator('.chat-message p')).toHaveText('Hello Bob A new line');
  await expect(bob.locator('.conversation-row .message-unread')).toHaveText('1');
  await expect(bob.locator('.mobile-nav a[href="/messages"] .notification-badge')).toHaveText('1');
  await bob.locator('.conversation-row').click();
  await expect(bob.locator('.chat-message p')).toHaveText('Hello Bob A new line');
  await expect(alice.locator('.chat-message small')).toContainText('Read');
  await expect(bob.locator('.mobile-nav a[href="/messages"] .notification-badge')).toHaveCount(0);
  await bob.getByLabel('Your message').fill('Hi Alice!');
  await bob.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(alice.locator('.chat-message p').last()).toHaveText('Hi Alice!');
  await expect(bob.locator('.chat-message.own small')).toContainText('Read');
  await expect(bob.locator('.inbox')).not.toBeVisible();
  expect(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await bob.screenshot({ path: 'test-results/messages-mobile.png', fullPage: true });
  await alice.screenshot({ path: 'test-results/messages-desktop.png', fullPage: true });
});

test('older history, reload, and navigation to a different conversation', async () => {
  const conversation = Number(new URL(alice.url()).pathname.split('/').at(-1));
  for (let index = 0; index < 33; index++) {
    const response = await contexts[0].request.post(url + '/api/conversations/' + conversation + '/messages', {
      headers: { Origin: url }, data: { content: 'Older history ' + index, client_id: randomUUID() },
    });
    expect(response.status()).toBe(201);
  }
  await expect(alice.getByRole('button', { name: 'Load older messages' })).toBeVisible();
  await alice.getByRole('button', { name: 'Load older messages' }).click();
  await expect(alice.locator('.chat-message p').first()).toHaveText('Hello Bob A new line');
  await alice.reload();
  await expect(alice.locator('.chat-message p').last()).toHaveText('Older history 32');
  await alice.goto(url + '/u/' + users[2].username);
  await alice.getByRole('button', { name: 'Message', exact: true }).click();
  await expect(alice.getByText('Every connection starts somewhere')).toBeVisible();
  await expect(alice.locator('.chat-message')).toHaveCount(0);
  await expect(alice.getByLabel('Your message')).toHaveValue('');
});
