/**
 * Thin wrapper around go-librespot's REST API (localhost:3678)
 * Docs: https://github.com/devgianlu/go-librespot
 */

import WebSocket from 'ws';

const BASE = process.env.LIBRESPOT_API || 'http://localhost:3678';

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, options);
    if (!res.ok) throw new Error(`go-librespot API error: ${res.status} on ${path}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('[librespot]', err.message);
    return null;
  }
}

/** Get current playback status (track, position, paused, volume) */
export async function getStatus() {
  return apiFetch('/status');
}

/** Resume playback */
export async function play() {
  return apiFetch('/player/play', { method: 'POST' });
}

/** Pause playback */
export async function pause() {
  return apiFetch('/player/pause', { method: 'POST' });
}

/** Skip to next track */
export async function next() {
  return apiFetch('/player/next', { method: 'POST' });
}

/** Go to previous track */
export async function prev() {
  return apiFetch('/player/prev', { method: 'POST' });
}

/**
 * Set volume
 * @param {number} pct - 0 to 100
 */
export async function setVolume(pct) {
  const vol = Math.round(Math.max(0, Math.min(100, pct)) / 100 * 65535);
  return apiFetch('/player/volume', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volume: vol }),
  });
}

/**
 * Load and play a Spotify URI
 * @param {string} uri - e.g. "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
 */
export async function loadTrack(uri) {
  return apiFetch('/player/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri, paused: false }),
  });
}

/**
 * Subscribe to real-time playback events via WebSocket
 * @param {Function} onEvent - called with each parsed event object
 * @returns Object with .close() function
 */
export async function subscribeEvents(onEvent) {
  const wsUrl = BASE.replace(/^http/, 'ws') + '/events';
  let ws = new WebSocket(wsUrl);

  const connect = () => {
    ws.on('message', (data) => {
      try {
        onEvent(JSON.parse(data.toString()));
      } catch {
        // ignore malformed events
      }
    });

    ws.on('close', () => {
      console.warn('[librespot] WebSocket connection lost, will auto-reconnect in 5s...');
      setTimeout(() => {
        ws = new WebSocket(wsUrl);
        connect();
      }, 5000);
    });

    ws.on('error', () => {
      // Ignore errors; close event will handle reconnection
    });
  };

  connect();

  return {
    close: () => {
      ws.removeAllListeners();
      ws.close();
    },
  };
}

/**
 * Convert a Spotify share URL to a spotify: URI
 * e.g. https://open.spotify.com/track/xxx?si=yyy → spotify:track:xxx
 */
export function urlToUri(input) {
  if (input.startsWith('spotify:')) return input;
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/').filter(Boolean); // ['track', 'xxx']
    if (parts.length >= 2) return `spotify:${parts[0]}:${parts[1]}`;
  } catch {
    // not a URL
  }
  return null;
}
