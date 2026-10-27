import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load the root .env even when npm starts this package from server/.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const port = Number(process.env.PORT || 3001);
export const config = {
  port,
  production: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  serverOrigin: process.env.SERVER_ORIGIN || 'http://localhost:' + port,
  sessionDays: Number(process.env.SESSION_DAYS || 7),
};

export function validateConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL.');
  if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!Number.isInteger(config.sessionDays) || config.sessionDays < 1 || config.sessionDays > 30) throw new Error('SESSION_DAYS must be between 1 and 30.');
  for (const origin of [config.clientOrigin, config.serverOrigin]) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('CLIENT_ORIGIN and SERVER_ORIGIN must be exact origins without a trailing slash.');
    if (config.production && parsed.protocol !== 'https:') throw new Error('Production origins must use HTTPS so secure session cookies work.');
  }
}

