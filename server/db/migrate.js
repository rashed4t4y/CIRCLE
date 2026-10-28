import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDatabasePool, connectDatabase } from './connection.js';

// Add new SQL migration files here. Never edit an already-applied migration.
const migrations = [
  { version: '001_initial', file: new URL('./schema.sql', import.meta.url) },
  { version: '002_profile_media', file: new URL('./002_profile_media.sql', import.meta.url) },
  { version: '003_messaging', file: new URL('./003_messaging.sql', import.meta.url) },
];
let pool;
let client;

try {
  pool = createDatabasePool();
  client = await connectDatabase(pool);
  await client.query('BEGIN');
  // Prevent two processes from applying migrations at the same time.
  await client.query('SELECT pg_advisory_xact_lock($1)', [67192341]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  for (const migration of migrations) {
    const sql = await readFile(migration.file, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [migration.version]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) {
        throw new Error(`Migration ${migration.version} changed after it was applied. Restore it and add a new migration.`);
      }
      console.log(`Already applied: ${migration.version}`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [migration.version, checksum]);
    console.log(`Applied: ${migration.version}`);
  }
  await client.query('COMMIT');
  console.log('CIRCLE database migrations complete.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  if (pool) await pool.end();
}

