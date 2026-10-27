import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { createDatabasePool, connectDatabase } from './connection.js';

let pool;
let client;

try {
  pool = createDatabasePool();
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set DEMO_PASSWORD to your own 10–72 byte development password in .env before seeding.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  client = await connectDatabase(pool);
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)', [67192342]);
  // A transaction-local setting passes the hash safely into seed.sql.
  await client.query("SELECT set_config('circle.demo_password_hash', $1, true)", [passwordHash]);
  await client.query(await readFile(new URL('./seed.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('CIRCLE demo data ready. Login: maya@circle.example with your configured DEMO_PASSWORD.');
  console.log('Existing demo passwords, edited records, and user data have been preserved.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  if (pool) await pool.end();
}

