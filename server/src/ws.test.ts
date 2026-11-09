import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createGameServer } from './ws';
import type { GameServer } from './ws';
import { encodeMessage, decodeMessage } from './protocol';
import type { ServerMessage } from './protocol';

const servers: GameServer[] = [];

function startServer(opts: { tokenSeq?: string[]; rand?: () => number } = {}): GameServer {
  let ti = 0;
  const seq = opts.tokenSeq;
  const server = createGameServer({
    port: 0,
    heartbeatMs: 0,
    // tokens are unique by default (per connection); tokenSeq pins them in order
    tokenFn: seq !== undefined ? () => {
      const t = seq[Math.min(ti++, seq.length - 1)];
      return t ?? 'tok';
    } : () => `tok-${ti++}`,
    rand: opts.rand ?? (() => 0.5),
  });
  servers.push(server);
  return server;
}

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** Connect a client and return {ws, next, sent}. */
function connect(server: GameServer): { ws: WebSocket; next: () => Promise<ServerMessage>; send: (m: unknown) => void } {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port()}`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(m: ServerMessage) => void> = [];
  ws.on('message', data => {
    const m = decodeMessage((data as Buffer).toString());
    if (m.ok) {
      const msg = m.msg as ServerMessage;
      const w = waiters.shift();
      if (w !== undefined) w(msg);
      else queue.push(msg);
    }
  });
  return {
    ws,
    next: () =>
      new Promise<ServerMessage>(resolve => {
        const q = queue.shift();
        if (q !== undefined) resolve(q);
        else waiters.push(resolve);
      }),
    send: m => ws.send(encodeMessage(m as never)),
  };
}

const open = (c: ReturnType<typeof connect>): Promise<void> =>
  new Promise(resolve => c.ws.on('open', resolve));

describe('game server over WebSocket', () => {
  it('welcome arrives after connection', async () => {
    const server = startServer({ tokenSeq: ['t1'] });
    const c = connect(server);
    await open(c);
    const msg = await c.next();
    expect(msg.kind).toBe('welcome');
    if (msg.kind === 'welcome') {
      expect(msg.clientId).toMatch(/^client-\d+$/);
      expect(msg.reconnectToken).toBe('t1');
    }
    c.ws.close();
  });

  it('createRoom -> welcome + roomState with 6-char code', async () => {
    const server = startServer({ tokenSeq: ['tok-a'] });
    const c = connect(server);
    await open(c);
    await c.next(); // welcome
    c.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false });
    const roomState = await c.next();
    expect(roomState.kind).toBe('roomState');
    if (roomState.kind === 'roomState') {
      expect(roomState.room.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(roomState.room.phase).toBe('lobby');
      expect(roomState.room.players[0]?.name).toBe('Manny');
    }
    c.ws.close();
  });

  it('joinRoom broadcasts to both players', async () => {
    const server = startServer({ tokenSeq: ['tok-a', 'tok-b'] });
    const host = connect(server);
    await open(host);
    await host.next(); // welcome
    host.send({ kind: 'createRoom', playerName: 'Host', scenario: 'firstTimer', partnerMode: false });
    const hostRoom = await host.next();
    const roomCode = hostRoom.kind === 'roomState' ? hostRoom.room.roomCode : '';

    const guest = connect(server);
    await open(guest);
    await guest.next(); // welcome
    guest.send({ kind: 'joinRoom', roomCode, playerName: 'Guest' });
    const guestState = await guest.next();
    expect(guestState.kind).toBe('roomState');
    if (guestState.kind === 'roomState') expect(guestState.room.players).toHaveLength(2);
    // host also gets a roomState broadcast on join
    const hostUpdate = await host.next();
    expect(hostUpdate.kind).toBe('roomState');
    host.ws.close();
    guest.ws.close();
  });

  it('setScenario updates the room and broadcasts; non-host rejected', async () => {
    const server = startServer({ tokenSeq: ['tok-a', 'tok-b'] });
    const host = connect(server);
    await open(host);
    await host.next(); // welcome
    host.send({ kind: 'createRoom', playerName: 'Host', scenario: 'firstTimer', partnerMode: false });
    const hostRoom = await host.next();
    const roomCode = hostRoom.kind === 'roomState' ? hostRoom.room.roomCode : '';

    host.send({ kind: 'setScenario', scenario: 'classicHorror' });
    const hostUpdate = await host.next();
    expect(hostUpdate.kind).toBe('roomState');
    if (hostUpdate.kind === 'roomState') expect(hostUpdate.room.scenario).toBe('classicHorror');

    // a guest cannot change the scenario
    const guest = connect(server);
    await open(guest);
    await guest.next(); // welcome
    guest.send({ kind: 'joinRoom', roomCode, playerName: 'Guest' });
    await guest.next(); // roomState
    await host.next(); // host join broadcast
    guest.send({ kind: 'setScenario', scenario: 'firstTimer' });
    const guestError = await guest.next();
    expect(guestError.kind).toBe('error');

    host.ws.close();
    guest.ws.close();
  });

  it('reconnect restores the session with a token', async () => {
    const server = startServer({ tokenSeq: ['tok-x', 'tok-y'] });
    const c1 = connect(server);
    await open(c1);
    const welcome = await c1.next();
    const token = welcome.kind === 'welcome' ? welcome.reconnectToken : '';
    c1.send({ kind: 'createRoom', playerName: 'Traveler', scenario: 'firstTimer', partnerMode: false });
    await c1.next();
    c1.ws.close();

    const c2 = connect(server);
    await open(c2);
    await c2.next(); // new welcome
    c2.send({ kind: 'reconnect', token });
    const restored = await c2.next();
    expect(restored.kind).toBe('roomState');
    if (restored.kind === 'roomState') expect(restored.room.players[0]?.name).toBe('Traveler');
    c2.ws.close();
  });

  it('reconnect rejects an unknown token', async () => {
    const server = startServer();
    const c = connect(server);
    await open(c);
    await c.next();
    c.send({ kind: 'reconnect', token: 'bogus' });
    const msg = await c.next();
    expect(msg.kind).toBe('error');
    if (msg.kind === 'error') expect(msg.message).toBe('invalid reconnect token');
    c.ws.close();
  });

  it('spectate receives roomState and all-hidden stateSync after start', async () => {
    const server = startServer({ tokenSeq: ['a', 'b', 'c'] });
    const host = connect(server);
    await open(host);
    await host.next();
    host.send({ kind: 'createRoom', playerName: 'Host', scenario: 'firstTimer', partnerMode: false });
    const hostRoom = await host.next();
    const roomCode = hostRoom.kind === 'roomState' ? hostRoom.room.roomCode : '';
    host.send({ kind: 'startGame' });
    const started = await host.next();
    expect(started.kind).toBe('gameStarted');
    // host gets a stateSync after start (turn 1)
    const hostView = await host.next();
    expect(hostView.kind).toBe('stateSync');

    const watcher = connect(server);
    await open(watcher);
    await watcher.next();
    watcher.send({ kind: 'spectate', roomCode });
    const watchState = await watcher.next();
    expect(watchState.kind).toBe('roomState');
    const watchView = await watcher.next();
    expect(watchView.kind).toBe('stateSync');
    if (watchView.kind === 'stateSync') {
      // hand + inventory hidden for every seat (spectator view); the discard
      // and play area stay public
      for (const seat of watchView.view.state.seats) {
        expect(seat?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
        expect(seat?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
      }
    }
    host.ws.close();
    watcher.ws.close();
  });

  it('sendAction updates views and bounces illegal actions to the sender only', async () => {
    const server = startServer({ tokenSeq: ['p1', 'p2'] });
    const p1 = connect(server);
    await open(p1);
    await p1.next();
    p1.send({ kind: 'createRoom', playerName: 'P1', scenario: 'firstTimer', partnerMode: false });
    const p1Room = await p1.next();
    const roomCode = p1Room.kind === 'roomState' ? p1Room.room.roomCode : '';

    const p2 = connect(server);
    await open(p2);
    await p2.next();
    p2.send({ kind: 'joinRoom', roomCode, playerName: 'P2' });
    await p2.next(); // p2 roomState
    p2.send({ kind: 'selectSeat', seat: 1 });
    await p2.next(); // p2 updated roomState
    await p1.next(); // p1 sees the join broadcast
    await p1.next(); // p1 sees the seat broadcast

    p1.send({ kind: 'startGame' });
    const started = await p1.next();
    expect(started.kind).toBe('gameStarted');
    const p1view = await p1.next();
    expect(p1view.kind).toBe('stateSync');

    // p2 also receives gameStarted + its own stateSync broadcast
    const p2started = await p2.next();
    expect(p2started.kind).toBe('gameStarted');
    const p2view = await p2.next();
    expect(p2view.kind).toBe('stateSync');

    // p2 tries to act out of turn
    p2.send({ kind: 'sendAction', action: { type: 'endTurn', seat: 1 } });
    const rejected = await p2.next();
    expect(rejected.kind).toBe('actionRejected');
    if (rejected.kind === 'actionRejected') expect(rejected.reason).toContain('not your turn');

    // p1 plays a legal ammo and both get a fresh stateSync
    const s = p1view.kind === 'stateSync' ? p1view.view.state : undefined;
    const ammo = s?.seats[0]?.hand.find(id => id !== undefined && s.cardDefs[id.split('#')[0] ?? '']?.type === 'ammunition');
    p1.send({ kind: 'sendAction', action: { type: 'playAmmo', seat: 0, instanceId: ammo } });
    const updated = await p1.next();
    expect(updated.kind).toBe('stateSync');
    // p2 also received the same update broadcast
    const p2update = await p2.next();
    expect(p2update.kind).toBe('stateSync');
    p1.ws.close();
    p2.ws.close();
  });

  it('chat broadcasts to the whole room', async () => {
    const server = startServer({ tokenSeq: ['a', 'b'] });
    const p1 = connect(server);
    await open(p1);
    await p1.next();
    p1.send({ kind: 'createRoom', playerName: 'P1', scenario: 'firstTimer', partnerMode: false });
    const p1Room = await p1.next();
    const roomCode = p1Room.kind === 'roomState' ? p1Room.room.roomCode : '';

    const p2 = connect(server);
    await open(p2);
    await p2.next();
    p2.send({ kind: 'joinRoom', roomCode, playerName: 'P2' });
    await p2.next();
    await p1.next(); // join broadcast

    p1.send({ kind: 'sendChat', text: 'hello' });
    const chat1 = await p1.next();
    expect(chat1.kind).toBe('chat');
    if (chat1.kind === 'chat') expect(chat1.text).toBe('hello');
    const chat2 = await p2.next();
    expect(chat2.kind).toBe('chat');
    if (chat2.kind === 'chat') expect(chat2.seat).toBe(0);
    p1.ws.close();
    p2.ws.close();
  });

  it('ping gets a pong', async () => {
    const server = startServer();
    const c = connect(server);
    await open(c);
    await c.next();
    c.send({ kind: 'ping', ts: 42 });
    const msg = await c.next();
    expect(msg.kind).toBe('pong');
    if (msg.kind === 'pong') expect(msg.ts).toBe(42);
    c.ws.close();
  });

  it('leaveRoom marks the session as roomless and broadcasts', async () => {
    const server = startServer({ tokenSeq: ['a', 'b'] });
    const p1 = connect(server);
    await open(p1);
    await p1.next();
    p1.send({ kind: 'createRoom', playerName: 'P1', scenario: 'firstTimer', partnerMode: false });
    const p1Room = await p1.next();
    const roomCode = p1Room.kind === 'roomState' ? p1Room.room.roomCode : '';

    const p2 = connect(server);
    await open(p2);
    await p2.next();
    p2.send({ kind: 'joinRoom', roomCode, playerName: 'P2' });
    await p2.next();
    await p1.next();

    p2.send({ kind: 'leaveRoom' });
    const p1Update = await p1.next();
    expect(p1Update.kind).toBe('roomState');
    if (p1Update.kind === 'roomState') expect(p1Update.room.players).toHaveLength(1);
    p1.ws.close();
    p2.ws.close();
  });

  it('disconnect marks the player connected:false for the rest of the room', async () => {
    const server = startServer({ tokenSeq: ['a', 'b'] });
    const p1 = connect(server);
    await open(p1);
    await p1.next();
    p1.send({ kind: 'createRoom', playerName: 'P1', scenario: 'firstTimer', partnerMode: false });
    const p1Room = await p1.next();
    const roomCode = p1Room.kind === 'roomState' ? p1Room.room.roomCode : '';

    const p2 = connect(server);
    await open(p2);
    await p2.next();
    p2.send({ kind: 'joinRoom', roomCode, playerName: 'P2' });
    await p2.next();
    await p1.next(); // join broadcast roomState

    // p2 drops -> p1 should receive a roomState with connected:false
    p2.ws.close();
    const disconnectMsg = await p1.next();
    expect(disconnectMsg.kind).toBe('roomState');
    if (disconnectMsg.kind === 'roomState') {
      expect(disconnectMsg.room.players.find(p => p.name === 'P2')?.connected).toBe(false);
    }
    p1.ws.close();
  }, 5000);
});