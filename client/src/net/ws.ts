import { encodeMessage, decodeMessage } from '@re/server';
import type { ClientMessage, ServerMessage } from '@re/server';

/**
 * M4-T01: WebSocket client for the @re/server protocol.
 *
 * Responsibilities:
 * - connect to a URL and surface decoded ServerMessages
 * - auto-reconnect with exponential backoff after an unexpected drop
 * - restore the session after reconnect by replaying the reconnect token
 * - queue sends made while disconnected and flush them on (re)connect
 * - persist the reconnect token (localStorage by default) so a page reload
 *   can restore the same room
 *
 * Pure browser-safe TS: no Node imports. Tests run against the real server
 * in Node (global WebSocket exists in Node 22+).
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface GameSocketOptions {
  readonly url: string;
  readonly onMessage: (msg: ServerMessage) => void;
  readonly onStatusChange?: (status: ConnectionStatus) => void;
  /** Token persistence — defaults to localStorage under the given app key. */
  readonly tokenKey?: string;
  /** Seed token to restore a session (e.g. from a deep link). */
  readonly initialToken?: string | null;
  readonly maxReconnectDelayMs?: number;
  readonly maxQueue?: number;
}

export interface GameSocket {
  readonly connect: () => void;
  /** Terminate the connection and never auto-reconnect. */
  readonly close: () => void;
  /** Enqueue (and later send) a message. Returns false if the queue is full. */
  readonly send: (msg: ClientMessage) => boolean;
  readonly status: () => ConnectionStatus;
}

export function createGameSocket(opts: GameSocketOptions): GameSocket {
  const tokenKey = opts.tokenKey ?? 're-deck-builder:reconnectToken';
  const maxReconnectDelayMs = opts.maxReconnectDelayMs ?? 15000;
  const maxQueue = opts.maxQueue ?? 64;

  let ws: WebSocket | null = null;
  let status: ConnectionStatus = 'disconnected';
  let manuallyClosed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let queue: ClientMessage[] = [];
  let token = opts.initialToken ?? readToken();
  let reconnectingWithToken = false;

  function readToken(): string | null {
    try {
      return localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  }

  function setToken(t: string | null): void {
    token = t;
    try {
      if (t === null) localStorage.removeItem(tokenKey);
      else localStorage.setItem(tokenKey, t);
    } catch {
      /* storage unavailable (SSR/privacy mode) — keep in-memory token */
    }
  }

  function setStatus(s: ConnectionStatus): void {
    if (status === s) return;
    status = s;
    opts.onStatusChange?.(s);
  }

  function flushQueue(): void {
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    for (const msg of batch) {
      ws.send(encodeMessage(msg));
    }
  }

  function scheduleReconnect(): void {
    if (manuallyClosed) return;
    if (reconnectTimer !== null) return;
    const delay = Math.min(500 * 2 ** reconnectAttempts, maxReconnectDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
    setStatus('connecting'); // reconnecting is "connecting" to the UI
  }

  function connect(): void {
    if (ws !== null) {
      return; // an attempt is already in flight
    }
    manuallyClosed = false;
    setStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(opts.url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      setStatus('connected');
      reconnectAttempts = 0;
      // Restore the session if we have a token (reconnect or page reload).
      // The welcome token issued for this connection is NOT the restore token;
      // keep the stored one so a future reconnect can restore again.
      reconnectingWithToken = token !== null;
      if (token !== null) {
        send({ kind: 'reconnect', token });
      }
      flushQueue();
    };

    socket.onmessage = (ev: MessageEvent<string>) => {
      const decoded = decodeMessage(ev.data);
      if (!decoded.ok) {
        // Not a protocol error from the server — ignore malformed frames.
        return;
      }
      const msg = decoded.msg as ServerMessage;
      if (msg.kind === 'welcome') {
        // On a fresh (non-restoring) connect, adopt the server-issued token.
        if (!reconnectingWithToken) {
          setToken(msg.reconnectToken);
        }
      }
      if (msg.kind === 'error' && msg.message === 'invalid reconnect token') {
        setToken(null);
      }
      opts.onMessage(msg);
    };

    socket.onerror = () => {
      /* close follows; reconnection is driven by onclose */
    };

    socket.onclose = () => {
      ws = null;
      if (manuallyClosed) {
        setStatus('disconnected');
        return;
      }
      scheduleReconnect();
    };
  }

  function close(): void {
    manuallyClosed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws !== null) {
      ws.close();
      ws = null;
    }
    queue = [];
    setStatus('disconnected');
  }

  function send(msg: ClientMessage): boolean {
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage(msg));
      return true;
    }
    if (queue.length >= maxQueue) {
      return false;
    }
    queue.push(msg);
    return true;
  }

  return { connect, close, send, status: () => status };
}