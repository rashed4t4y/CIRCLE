import { app } from './app.js';
import { pool } from './db.js';
import { config, validateConfig } from './config.js';

let server;
try {
  validateConfig();
  await pool.query('SELECT 1');
  // A schema check gives a useful startup error before anyone signs in.
  await pool.query('SELECT id FROM users LIMIT 0');
  await pool.query('SELECT token_hash FROM sessions LIMIT 0');
  server = app.listen(config.port, () => {
    console.log('CIRCLE API: http://localhost:' + config.port);
    console.log('PostgreSQL connected. Frontend: ' + config.clientOrigin);
  });
  server.on('error', async (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'Port ' + config.port + ' is already in use. Change PORT and the Vite proxy configuration.' : 'Could not start the CIRCLE server.');
    await pool.end();
    process.exitCode = 1;
  });
} catch (error) {
  if (error.code === '42P01') console.error('Database schema is missing. Run npm run db:migrate before starting CIRCLE.');
  else if (error.code) console.error('Could not connect to PostgreSQL (' + error.code + '). Check DATABASE_URL and whether PostgreSQL is running.');
  else console.error(error.message);
  await pool.end();
  process.exitCode = 1;
}

function shutdown() {
  if (!server) return;
  server.close(async () => {
    await pool.end();
    process.exitCode = 0;
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);


