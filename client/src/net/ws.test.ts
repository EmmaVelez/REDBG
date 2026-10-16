import { describe, it, expect, afterEach, vi } from 'vitest';
import { createGameServer } from '@re/server/ws';
import type { GameServer } from '@re/server/ws';
import type { ServerMessage, ClientMessage } from '@re/server';
import { createGameSocket } from './ws';
import type { GameSocket, GameSocketOptions } from './ws';

/**
 * M4-T01: the browser WS client driven against the REAL server on an
 * ephemeral port, using Node's global WebSocket (WHATWG, same API as the
 * browser). Covers: welcome/token flow, queue-while-offline flush, session
 * restore via reconnect token, auto-reconnect after a server restart on the
 * same port, manual close semantics.
 */

const servers: GameServer[] = [];

function startServer(port = 0): GameServer {
  const server = createGameServer({ port, heartbeatMs: 0, tokenFn: () => Math.random().toString(36).slice(2) });
  servers.push(server);
  return server;
}

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

function makeSocket(server: GameServer, extra: Partial<GameSocketOptions> = {}): {
  socket: GameSocket;
  received: ServerMessage[];
  statuses: string[];
} {
  const received: ServerMessage[] = [];
  const statuses: string[] = [];
  const socket = createGameSocket({
    url: `ws://127.0.0.1:${server.port()}`,
    onMessage: m => received.push(m),
    onStatusChange: s => statuses.push(s),
    ...extra,
  });
  return { socket, received, statuses };
}

const open = (s: GameSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 2000);
    const iv = setInterval(() => {
      if (s.status() === 'connected') {
        clearInterval(iv);
        clearTimeout(t);
        resolve();
      }
    }, 10);
  });

function waitFor<T extends ServerMessage>(received: ServerMessage[], pred: (m: ServerMessage) => m is T, timeoutMs = 2000): Promise<T> {
  const existing = received.find(pred);
  if (existing !== undefined) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('message timeout')), timeoutMs);
    const iv = setInterval(() => {
      const f = received.find(pred);
      if (f !== undefined) {
        clearInterval(iv);
        clearTimeout(t);
        resolve(f);
      }
    }, 10);
  });
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'welcome' }> => m.kind === 'welcome';
const isRoomState = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'roomState' }> => m.kind === 'roomState';
const isError = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'error' }> => m.kind === 'error';

describe('game socket (M4-T01) against real server', () => {
  it('connects, receives welcome with clientId + reconnectToken', async () => {
    const server = startServer();
    const { socket, received } = makeSocket(server);
    socket.connect();
    await open(socket);
    const welcome = await waitFor(received, isWelcome);
    expect(welcome.clientId).toMatch(/^client-\d+$/);
    expect(welcome.reconnectToken.length).toBeGreaterThan(0);
    expect(socket.status()).toBe('connected');
    socket.close();
  });

  it('createRoom produces a roomState with a 6-char code', async () => {
    const server = startServer();
    const { socket, received } = makeSocket(server);
    socket.connect();
    await open(socket);
    socket.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer' });
    const rs = await waitFor(received, isRoomState);
    expect(rs.room.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(rs.room.players[0]?.name).toBe('Manny');
    expect(rs.room.phase).toBe('lobby');
    expect(rs.room.scenario).toBe('firstTimer');
    socket.close();
  });

  it('sends made before open are queued and flushed after welcome', async () => {
    const server = startServer();
    const { socket, received } = makeSocket(server);
    // send while offline — must be queued, not lost
    expect(socket.send({ kind: 'createRoom', playerName: 'Queued', scenario: 'firstTimer' })).toBe(true);
    socket.connect();
    await open(socket);
    const rs = await waitFor(received, isRoomState);
    expect(rs.room.players[0]?.name).toBe('Queued');
    socket.close();
  });

  it('reconnect token restores the session on a fresh socket (page reload)', async () => {
    const server = startServer();
    const first = makeSocket(server);
    first.socket.connect();
    const welcome = await waitFor(first.received, isWelcome);
    first.socket.send({ kind: 'createRoom', playerName: 'Traveler', scenario: 'firstTimer' });
    await waitFor(first.received, isRoomState);
    first.socket.close();

    // simulate reload: new socket, same token from storage, no room name typed
    const second = makeSocket(server, { initialToken: welcome.reconnectToken });
    second.socket.connect();
    await open(second.socket);
    const rs = await waitFor(second.received, isRoomState);
    expect(rs.room.players[0]?.name).toBe('Traveler');
    second.socket.close();
  });

  it('reconnects automatically after the server restarts on the same port', async () => {
    // fixed port so the replacement can bind the same address
    const port = 25000 + Math.floor(Math.random() * 10000);
    const server1 = startServer(port);
    const { socket, received, statuses } = makeSocket(server1, {
      maxReconnectDelayMs: 300,
    });
    socket.connect();
    await open(socket);
    await waitFor(received, isWelcome);

    // kill the server — the socket should drop and start backing off
    server1.close();
    // bring a fresh server up on the SAME port (represents a restart)
    const deadline = Date.now() + 3000;
    let server2: GameServer | null = null;
    while (Date.now() < deadline && server2 === null) {
      try {
        server2 = startServer(port);
      } catch {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    expect(server2).not.toBeNull();

    // client must come back to connected by itself
    const back = await new Promise<boolean>(resolve => {
      const iv = setInterval(() => {
        if (socket.status() === 'connected') {
          clearInterval(iv);
          resolve(true);
        }
      }, 10);
      setTimeout(() => {
        clearInterval(iv);
        resolve(false);
      }, 3000);
    });
    expect(back).toBe(true);
    expect(statuses).toContain('connected');
    socket.close();
  }, 10000);

  it('manual close stays disconnected (no auto-reconnect)', async () => {
    const server = startServer();
    const { socket, received, statuses } = makeSocket(server, { maxReconnectDelayMs: 50 });
    socket.connect();
    await open(socket);
    await waitFor(received, isWelcome);
    socket.close();
    expect(socket.status()).toBe('disconnected');
    await new Promise(r => setTimeout(r, 20)); // let the close settle
    const count = statuses.length;
    await new Promise(r => setTimeout(r, 250)); // longer than the reconnect delay
    expect(statuses.length).toBe(count); // no reconnect attempt status changes
    expect(socket.status()).toBe('disconnected');
    socket.close();
  });

  it('invalid token is surfaced as an error message', async () => {
    const server = startServer();
    const { socket, received } = makeSocket(server, { initialToken: 'bogus-token' });
    socket.connect();
    await open(socket);
    const err = await waitFor(received, isError);
    expect(err.message).toContain('invalid reconnect token');
    socket.close();
  });

  it('queue is capped: sends beyond maxQueue while offline are refused', async () => {
    const server = startServer();
    const { socket } = makeSocket(server, { maxQueue: 2 });
    expect(socket.send({ kind: 'ping', ts: 1 })).toBe(true);
    expect(socket.send({ kind: 'ping', ts: 2 })).toBe(true);
    expect(socket.send({ kind: 'ping', ts: 3 })).toBe(false);
    socket.close();
  });
});