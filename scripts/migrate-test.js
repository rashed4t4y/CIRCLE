import dotenv from '../server/node_modules/dotenv/lib/main.js';
import { spawnSync } from 'node:child_process';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('Configure a separate TEST_DATABASE_URL before migrating tests.');
}
const result = spawnSync(process.execPath, ['server/db/migrate.js'], {
  cwd: new URL('../', import.meta.url), stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});
process.exitCode = result.status ?? 1;
