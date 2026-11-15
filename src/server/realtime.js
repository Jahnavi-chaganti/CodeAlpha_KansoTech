import { WebSocketServer, WebSocket } from 'ws';
import { parseCookies, verifyAuthToken } from './auth.js';
import { db } from './db.js';

let wss = null;
const clientMeta = new WeakMap();

function resolveLiveUser(verifiedToken) {
  if (!verifiedToken?.userId) {
    return { userId: null, role: 'guest' };
  }
  const row = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(verifiedToken.userId);
  if (!row) {
    return { userId: null, role: 'guest' };
  }
  return { userId: row.id, role: row.role || 'customer' };
}

export function setupRealtimeServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const tokenParam = url.searchParams.get('token');
    const guestParam = url.searchParams.get('guest');
    const cookies = parseCookies(req.headers.cookie);

    const auth = verifyAuthToken(tokenParam) || verifyAuthToken(cookies.kanso_auth);
    const liveUser = resolveLiveUser(auth);
    const guestSessionId =
      typeof guestParam === 'string' && guestParam.length >= 8
        ? guestParam
        : cookies.kanso_guest || null;

    clientMeta.set(socket, {
      userId: liveUser.userId,
      role: liveUser.role,
      guestSessionId,
      watchingSlug: null,
    });

    sendJson(socket, {
      type: 'connection:ready',
      payload: {
        activeShoppers: getActiveClientCount(),
      },
    });

    broadcastPresence();

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const meta = clientMeta.get(socket);
        if (!meta) return;

        if (msg.type === 'session:identify') {
          const verified = verifyAuthToken(msg.payload?.token) || verifyAuthToken(cookies.kanso_auth);
          const nextUser = resolveLiveUser(verified);
          meta.userId = nextUser.userId;
          meta.role = nextUser.role;
          if (typeof msg.payload?.guestSessionId === 'string' && msg.payload.guestSessionId.length >= 8) {
            meta.guestSessionId = msg.payload.guestSessionId;
          }
        } else if (msg.type === 'product:watch') {
          const prevSlug = meta.watchingSlug;
          meta.watchingSlug = msg.payload?.slug ? String(msg.payload.slug).slice(0, 120) : null;
          if (prevSlug) broadcastProductViewers(prevSlug);
          if (meta.watchingSlug) broadcastProductViewers(meta.watchingSlug);
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    socket.on('close', () => {
      const meta = clientMeta.get(socket);
      const prevSlug = meta?.watchingSlug;
      if (prevSlug) broadcastProductViewers(prevSlug);
      broadcastPresence();
    });
  });

  return wss;
}

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function getActiveClientCount() {
  if (!wss) return 0;
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) count += 1;
  }
  return count;
}

function broadcastPresence() {
  broadcastAll('presence:updated', {
    activeShoppers: getActiveClientCount(),
  });
}

function broadcastProductViewers(slug) {
  if (!wss || !slug) return;
  let viewers = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      const meta = clientMeta.get(client);
      if (meta?.watchingSlug === slug) viewers += 1;
    }
  }
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      const meta = clientMeta.get(client);
      if (meta?.watchingSlug === slug) {
        sendJson(client, {
          type: 'product:viewers',
          payload: { slug, viewers },
        });
      }
    }
  }
}

export function broadcastAll(type, payload) {
  if (!wss) return;
  for (const client of wss.clients) {
    sendJson(client, { type, payload });
  }
}

export function broadcastToOwner(userId, guestSessionId, type, payload) {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(client);
    if (!meta) continue;
    const matchesUser = userId && meta.userId === userId;
    const matchesGuest = !userId && guestSessionId && meta.guestSessionId === guestSessionId;
    if (matchesUser || matchesGuest) {
      sendJson(client, { type, payload });
    }
  }
}

export function broadcastOrderEvent(type, order) {
  if (!wss || !order) return;
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(client);
    if (!meta) continue;

    const isAdmin = meta.role === 'admin';
    const isOwningUser = Boolean(order.userId && meta.userId && meta.userId === order.userId);
    const isOwningGuest = Boolean(
      !order.userId && order.sessionId && meta.guestSessionId && meta.guestSessionId === order.sessionId
    );

    if (isAdmin || isOwningUser || isOwningGuest) {
      sendJson(client, { type, payload: order });
    }
  }
}
