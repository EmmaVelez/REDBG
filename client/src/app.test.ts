import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createGameServer } from '@re/server/ws';
import type { GameServer } from '@re/server/ws';
import { useGameStore } from './store';
import { createGameSocket } from './net/ws';

/**
 * M4 seam test: the real app wiring — socket.onMessage feeds the store and
 * store.dispatch sends through the socket. Proves the loop the App mounts
 * (bindSocket + handleServerMessage + dispatch) without a DOM.
 */

const servers: GameServer[] = [];

function startServer(): GameServer {
  const server = createGameServer({ port: 0, heartbeatMs: 0 });
  servers.push(server);
  return server;
}

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

beforeEach(() => {
  useGameStore.setState({
    status: 'disconnected',
    clientId: null,
    room: null,
    view: null,
    chat: [],
    lastError: null,
    gameOver: null,
    mySeat: -1,
  });
});

function bindRealSocket(server: GameServer): ReturnType<typeof createGameSocket> {
  const socket = createGameSocket({
    url: `ws://127.0.0.1:${server.port()}`,
    onMessage: m => useGameStore.getState().handleServerMessage(m),
    onStatusChange: s => useGameStore.getState().setStatus(s),
  });
  useGameStore.getState().bindSocket(socket);
  return socket;
}

const waitFor = (pred: () => boolean, label: string, timeoutMs = 3000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const iv = setInterval(() => {
      if (pred()) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(iv);
        reject(new Error(`${label} — timed out`));
      }
    }, 10);
  });

describe('app wiring (socket <-> store)', () => {
  it('createRoom through the store reaches the server and comes back as room state', async () => {
    const server = startServer();
    const socket = bindRealSocket(server);
    expect(useGameStore.getState().dispatch({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer' })).toBe(true);
    await waitFor(() => useGameStore.getState().room !== null, 'roomState');
    const room = useGameStore.getState().room;
    expect(room?.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room?.players[0]?.name).toBe('Manny');
    expect(room?.scenario).toBe('firstTimer');
    expect(useGameStore.getState().clientId).toMatch(/^client-\d+$/); // welcome processed
    socket.close();
  });

  it('a server-rejected action surfaces in the store as lastError', async () => {
    const server = startServer();
    const socket = bindRealSocket(server);
    useGameStore.getState().dispatch({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer' });
    await waitFor(() => useGameStore.getState().room !== null, 'roomState');
    // send an action before the game started -> server rejects it
    useGameStore.getState().dispatch({ kind: 'sendAction', action: { type: 'endTurn', seat: 0 } });
    await waitFor(() => useGameStore.getState().lastError !== null, 'actionRejected');
    expect(useGameStore.getState().lastError).toBe('game not started');
    socket.close();
  });

  it('chat sent from the store appears in the store chat log', async () => {
    const server = startServer();
    const socket = bindRealSocket(server);
    useGameStore.getState().dispatch({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer' });
    await waitFor(() => useGameStore.getState().room !== null, 'roomState');
    useGameStore.getState().dispatch({ kind: 'sendChat', text: 'glhf' });
    await waitFor(() => useGameStore.getState().chat.length === 1, 'chat echo');
    expect(useGameStore.getState().chat[0]?.text).toBe('glhf');
    expect(useGameStore.getState().chat[0]?.seat).toBe(0);
    socket.close();
  });
});