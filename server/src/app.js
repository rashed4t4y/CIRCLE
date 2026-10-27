import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { pool } from './db.js';
import { config } from './config.js';
import { protectOrigin, requireAuth, errorHandler } from './middleware/security.js';
import { HttpError } from './services/validation.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { postRoutes, commentRoutes, topicRoutes } from './routes/posts.js';
import { notificationRoutes } from './routes/notifications.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'https:', 'http:', 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", config.clientOrigin, config.serverOrigin],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.production ? [] : null,
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use('/api', protectOrigin);
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please pause and try again.' } },
}));
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ data: { status: 'ok', database: 'connected' } });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/posts', requireAuth, postRoutes);
app.use('/api/comments', requireAuth, commentRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/topics', requireAuth, topicRoutes);
app.use('/api', (req, res, next) => next(new HttpError(404, 'API endpoint not found.')));

const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory, { index: false }));
  app.get('/{*path}', (req, res) => res.sendFile('index.html', { root: clientDirectory }));
}
app.use((req, res, next) => next(new HttpError(404, 'Page not found. Start the Vite frontend or run npm run build.')));
app.use(errorHandler);

export default app;

