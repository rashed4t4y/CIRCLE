import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export function createDatabasePool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL first.');
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
}

// Validate before migrations or seeds perform any writes. Windows PostgreSQL
// defaults may otherwise reject emoji and multilingual content.
export async function connectDatabase(pool) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SHOW server_encoding');
    if (rows[0].server_encoding !== 'UTF8') {
      throw new Error(`Database encoding is ${rows[0].server_encoding}; CIRCLE requires UTF8. Create a new UTF8 database using TEMPLATE template0, then update DATABASE_URL. Existing data has not been changed.`);
    }
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}
