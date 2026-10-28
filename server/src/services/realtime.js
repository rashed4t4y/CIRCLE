import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import { config } from '../config.js';
import { pool } from '../db.js';
import { cookieName, tokenHash } from './session.js';
import { conversationFor } from './messaging.js';

let activeIO;
async function validSession(socket) {
  const { rows } = await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()', [socket.data.sessionHash]);
  return rows[0]?.user_id === socket.data.userId;
}
export function attachRealtime(server) {
  const allowed = new Set([config.clientOrigin, config.serverOrigin]);
  const hosts = new Set([...allowed].map(origin => new URL(origin).host));
  const io = new Server(server, {
    cors: { origin: [...allowed], credentials: true },
    allowRequest: (req, done) => {
      // Same-origin browser polling GETs omit Origin. Fetch Metadata and the
      // exact configured Host permit those requests without accepting cross-site handshakes.
      const origin = req.headers.origin;
      const sameOriginPolling = !origin && req.headers['sec-fetch-site'] === 'same-origin' && hosts.has(req.headers.host);
      done(null, origin ? allowed.has(origin) : sameOriginPolling);
    },
    maxHttpBufferSize: 4096,
  });
  activeIO = io;
  io.use(async (socket, next) => {
    try {
      const req = socket.request;
      await new Promise((resolve, reject) => cookieParser()(req, {}, error => error ? reject(error) : resolve()));
      const token = req.cookies?.[cookieName];
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return next(new Error('Please sign in.'));
      socket.data.sessionHash = tokenHash(token);
      const { rows } = await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()', [socket.data.sessionHash]);
      if (!rows[0]) return next(new Error('Session expired.'));
      socket.data.userId = rows[0].user_id;
      next();
    } catch { next(new Error('Unable to verify session.')); }
  });
  // Sockets carry invalidations only. Content reads and mutations use the
  // authenticated REST API. No client-selected rooms or messaging commands.
  io.on('connection', socket => {
    const timer = setInterval(async () => {
      try { if (!await validSession(socket)) socket.disconnect(true); }
      catch { socket.disconnect(true); }
    }, 30_000);
    timer.unref();
    socket.on('disconnect', () => clearInterval(timer));
  });
  return io;
}
export async function publishConversation(conversation) {
  if (!activeIO) return;
  const recipients = new Set([conversation.user_low, conversation.user_high]);
  await Promise.all([...activeIO.sockets.sockets.values()].filter(socket => recipients.has(socket.data.userId)).map(async socket => {
    try {
      if (!await validSession(socket)) { socket.disconnect(true); return; }
      await conversationFor(socket.data.userId, conversation.id);
      socket.emit('conversation:changed', { conversation_id: conversation.id });
    } catch { socket.disconnect(true); }
  }));
}
