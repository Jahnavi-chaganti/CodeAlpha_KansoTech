import { getOrCreateGuestKey, getStoredToken } from './api.js';

export function createRealtimeClient({ onEvent, onStatusChange }) {
  let socket = null;
  let closedByUser = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let currentWatchingSlug = null;

  function buildUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    const token = getStoredToken();
    if (token) params.set('token', token);
    params.set('guest', getOrCreateGuestKey());
    return `${protocol}//${window.location.host}/ws?${params.toString()}`;
  }

  function send(type, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }

  function connect() {
    if (closedByUser) return;
    onStatusChange?.('connecting');

    try {
      socket = new WebSocket(buildUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      reconnectAttempts = 0;
      onStatusChange?.('connected');
      if (currentWatchingSlug) {
        send('product:watch', { slug: currentWatchingSlug });
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.type) {
          onEvent?.(parsed.type, parsed.payload);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.addEventListener('close', () => {
      onStatusChange?.('disconnected');
      if (!closedByUser) {
        scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      socket?.close();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    const delayMs = Math.min(10000, 800 * Math.pow(1.6, reconnectAttempts));
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => {
      connect();
    }, delayMs);
  }

  connect();

  return {
    identifySession() {
      send('session:identify', {
        token: getStoredToken(),
        guestSessionId: getOrCreateGuestKey(),
      });
    },
    watchProduct(slug) {
      currentWatchingSlug = slug || null;
      send('product:watch', { slug: currentWatchingSlug });
    },
    close() {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
