import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createGameServer } from './ws';
import type { GameServer } from './ws';
import type { RoomSnapshot, ServerMessage } from './protocol';
import {
  connect,
  open,
  waitFor,
  drain,
  isRoomState,
  isStateSync,
  isGameStarted,
  isError,
  isWelcome,
  handVisible,
} from './testHelpers';

/**
 * M5-T03: reconnect torture suite.
 *
 * M3-T05 covered a single lobby-phase reconnect. This suite attacks the
 * resume path itself: invalid tokens, tokens whose player left, mid-game
 * resume with a live view, a stale socket holding the SAME identity (the
 * duplicate-token hole), rapid connect/disconnect churn, and spectators.
 *
 * The invariant under test: a reconnect token identifies a PLAYER, and only
 * one live socket may speak for that player. A stale socket must neither act
 * as the player nor be able to mark them disconnected.
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

const waitForClose = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
  });

const roomStateWhere = (pred: (room: RoomSnapshot) => boolean) =>
  (m: ServerMessage): m is Extract<ServerMessage, { kind: 'roomState' }> => isRoomState(m) && pred(m.room);

const isPong = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'pong' }> => m.kind === 'pong';

/** Create a room and return its code, the creator's reconnect token, and the creator's socket. */
async function createRoomWithToken(
  server: GameServer,
  name = 'Manny',
): Promise<{ code: string; token: string; client: ReturnType<typeof connect> }> {
  const c = connect(server);
  await open(c);
  const welcome = await waitFor(c, isWelcome, 10000, 'welcome');
  c.send({ kind: 'createRoom', playerName: name, scenario: 'firstTimer', partnerMode: false });
  const room = await waitFor(c, isRoomState, 10000, 'createRoom');
  return { code: room.room.roomCode, token: welcome.reconnectToken, client: c };
}

describe('M5-T03 reconnect torture', () => {
  it('rejects an invalid reconnect token', async () => {
    const server = startServer();
    const c = connect(server);
    await open(c);
    await c.next(); // welcome

    c.send({ kind: 'reconnect', token: 'not-a-real-token' });
    const err = await waitFor(c, isError, 5000, 'invalid token');
    expect(err.message).toBe('invalid reconnect token');
    c.ws.close();
  });

  it('rejects a token whose player left the room', async () => {
    const server = startServer();
    const { token, client: creator } = await createRoomWithToken(server);

    // leave; an empty room is deleted, so the token resolves to nothing
    creator.send({ kind: 'leaveRoom' });
    creator.ws.close();
    await waitForClose(creator.ws);

    const stranger = connect(server);
    await open(stranger);
    await stranger.next(); // welcome
    stranger.send({ kind: 'reconnect', token });
    const err = await waitFor(stranger, isError, 5000, 'token after leave');
    expect(err.message).toBe('no room for token');
    stranger.ws.close();
  });

  it('rejects a spectator token (spectators are not room players)', async () => {
    const server = startServer();
    const { code } = await createRoomWithToken(server);

    const watcher = connect(server);
    await open(watcher);
    const welcome = await waitFor(watcher, isWelcome, 10000, 'watcher welcome');
    watcher.send({ kind: 'spectate', roomCode: code });
    await waitFor(watcher, isRoomState, 10000, 'spectator roomState');
    watcher.ws.close();

    const resumed = connect(server);
    await open(resumed);
    await resumed.next();
    resumed.send({ kind: 'reconnect', token: welcome.reconnectToken });
    const err = await waitFor(resumed, isError, 5000, 'spectator reconnect');
    expect(err.message).toBe('no room for token');
    resumed.ws.close();
  });

  it('restores a mid-game session: live view, own hand, same turn, and the seat can act', async () => {
    const server = startServer();
    const host = connect(server);
    await open(host);
    const welcome = await waitFor(host, isWelcome, 10000, 'host welcome');

    host.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false });
    const room = await waitFor(host, isRoomState, 10000, 'createRoom');

    host.send({ kind: 'addBot', seat: 1 });
    await waitFor(host, isRoomState, 10000, 'addBot');
    host.send({ kind: 'startGame' });
    await waitFor(host, isGameStarted, 10000, 'gameStarted');

    const view = await waitFor(host, (m): m is Extract<ServerMessage, { kind: 'stateSync' }> => isStateSync(m) && m.view.state.activeSeat === 0, 10000, 'host turn');
    const turnBefore = view.view.state.turnNumber;
    const handBefore = view.view.state.seats[0]?.hand.length ?? 0;
    expect(handBefore).toBeGreaterThan(0);
    expect(handVisible(view.view.state, 0)).toBe(true);

    // drop the connection mid-turn
    host.ws.close();
    await waitForClose(host.ws);

    // resume with the SAME token
    const resumed = connect(server);
    await open(resumed);
    await resumed.next(); // fresh welcome
    resumed.send({ kind: 'reconnect', token: welcome.reconnectToken });

    const roomState = await waitFor(resumed, roomStateWhere((r) => r.roomCode === room.room.roomCode), 10000, 'resume roomState');
    expect(roomState.room.players.some((p) => p.name === 'Manny' && p.connected && !p.isBot)).toBe(true);

    const resumedView = await waitFor(resumed, (m): m is Extract<ServerMessage, { kind: 'stateSync' }> => isStateSync(m) && m.view.seat === 0, 10000, 'resume stateSync');
    // the turn was NOT lost or handed to the bot while the socket was down
    expect(resumedView.view.state.activeSeat).toBe(0);
    expect(resumedView.view.state.turnNumber).toBe(turnBefore);
    expect(handVisible(resumedView.view.state, 0)).toBe(true);

    // and the seat can still act
    resumed.send({ kind: 'sendAction', action: { type: 'endTurn', seat: 0 } });
    // 2-seat game (host + one bot): the turn comes back to seat 0 after the
    // bot steps, so assert the turn ADVANCED rather than that the seat changed.
    const after = await waitFor(resumed, (m): m is Extract<ServerMessage, { kind: 'stateSync' }> => isStateSync(m) && m.view.state.turnNumber > turnBefore, 10000, 'turn advanced after resume');
    expect(after.view.state.turnNumber).toBeGreaterThan(turnBefore);
    expect(handVisible(after.view.state, 0)).toBe(true);
    resumed.ws.close();
  });

  it('replaces a stale socket for the same identity (stale socket cannot act or disconnect the player)', async () => {
    const server = startServer();
    const { token } = await createRoomWithToken(server);

    // two live sockets holding the SAME identity
    const first = connect(server);
    await open(first);
    await first.next();
    first.send({ kind: 'reconnect', token });
    await waitFor(first, isRoomState, 10000, 'first reconnect');

    const second = connect(server);
    await open(second);
    await second.next();
    second.send({ kind: 'reconnect', token });
    await waitFor(second, isRoomState, 10000, 'second reconnect');

    // the server must retire the stale socket
    await waitForClose(first.ws);
    expect(first.ws.readyState).toBe(WebSocket.CLOSED);

    // closing the stale socket must NOT mark the player disconnected: the
    // live socket keeps working and no "connected:false" broadcast arrives.
    second.send({ kind: 'ping', ts: 1234 });
    const pong = await waitFor(second, isPong, 5000, 'live socket still routed');
    expect(pong.ts).toBe(1234);

    const noise = await drain(second, 150);
    const disconnectBroadcasts = noise.filter(isRoomState).filter((m) => m.room.players.some((p) => !p.connected && !p.isBot));
    expect(disconnectBroadcasts).toHaveLength(0);

    // the live socket still speaks for the player
    second.send({ kind: 'selectSeat', seat: 2 });
    const seated = await waitFor(second, roomStateWhere((r) => r.players.some((p) => p.seat === 2)), 10000, 'seat change after stale close');
    expect(seated.room.players.filter((p) => !p.isBot)).toHaveLength(1);
    second.ws.close();
  });

  it('survives rapid reconnect churn without duplicating the player', async () => {
    const server = startServer();
    const { code, token } = await createRoomWithToken(server);

    let live = connect(server);
    await open(live);
    await live.next();
    live.send({ kind: 'reconnect', token });
    await waitFor(live, isRoomState, 10000, 'initial reconnect');

    for (let i = 0; i < 20; i++) {
      const next = connect(server);
      await open(next);
      await next.next();
      next.send({ kind: 'reconnect', token });
      await waitFor(next, isRoomState, 10000, `churn ${i}`);
      live.ws.close();
      live = next;
    }

    // exactly one human player, still connected, token still valid
    const spectator = connect(server);
    await open(spectator);
    await spectator.next();
    spectator.send({ kind: 'spectate', roomCode: code });
    const snap = await waitFor(spectator, isRoomState, 10000, 'post-churn roomState');
    const humans = snap.room.players.filter((p) => !p.isBot);
    expect(humans).toHaveLength(1);
    expect(humans[0]?.connected).toBe(true);

    // the identity is still resumable after all that churn
    live.ws.close();
    await waitForClose(live.ws);
    const again = connect(server);
    await open(again);
    await again.next();
    again.send({ kind: 'reconnect', token });
    await waitFor(again, isRoomState, 10000, 'resume after churn');
    again.ws.close();
    spectator.ws.close();
  });

  it('keeps the seat active (no silent bot takeover) while the player is disconnected', async () => {
    const server = startServer();
    const host = connect(server);
    await open(host);
    await waitFor(host, isWelcome, 10000, 'host welcome');
    host.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false });
    const room = await waitFor(host, isRoomState, 10000, 'createRoom');
    host.send({ kind: 'addBot', seat: 1 });
    await waitFor(host, isRoomState, 10000, 'addBot');
    host.send({ kind: 'startGame' });
    await waitFor(host, isGameStarted, 10000, 'gameStarted');
    const view = await waitFor(host, (m): m is Extract<ServerMessage, { kind: 'stateSync' }> => isStateSync(m) && m.view.state.activeSeat === 0, 10000, 'host turn');
    expect(view.view.state.activeSeat).toBe(0);

    // disconnect: the seat must stay where it is (the player can reconnect),
    // not be silently reassigned to the bot.
    host.ws.close();
    await waitForClose(host.ws);
    await new Promise((r) => setTimeout(r, 250));

    // a spectator sees the public board (activeSeat included, hands hidden)
    const spectator = connect(server);
    await open(spectator);
    await spectator.next();
    spectator.send({ kind: 'spectate', roomCode: room.room.roomCode });
    await waitFor(spectator, isRoomState, 10000, 'spectator roomState');
    const board = await waitFor(spectator, isStateSync, 10000, 'spectator board');
    expect(board.view.state.activeSeat).toBe(0);
    spectator.ws.close();
  });
});
