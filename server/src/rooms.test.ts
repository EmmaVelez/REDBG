import { describe, it, expect } from 'vitest';
import { createRoomStore } from './rooms';
import type { Room } from './rooms';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function alphChar(p: number): string {
  // ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' (32 chars)
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return ALPHABET[Math.floor(p * ALPHABET.length)] ?? 'A';
}

describe('createRoomStore', () => {
  it('createRoom returns a lobby room with a 6-char code and the creator at seat 0', () => {
    const store = createRoomStore(() => 0.2);
    const room = store.createRoom('c1', 'Manny');
    expect(room.roomCode).toMatch(CODE_RE);
    expect(room.phase).toBe('lobby');
    expect(room.maxSeats).toBe(4);
    expect(room.players).toHaveLength(1);
    const player = room.players[0];
    expect(player?.clientId).toBe('c1');
    expect(player?.name).toBe('Manny');
    expect(player?.seat).toBe(0);
    expect(player?.isBot).toBe(false);
  });

  it('code generation is deterministic for a fixed rand', () => {
    const a = createRoomStore(() => 0.5).createRoom('c1', 'A');
    const b = createRoomStore(() => 0.5).createRoom('c1', 'B');
    expect(a.roomCode).toBe(b.roomCode);
    expect(a.roomCode).toMatch(CODE_RE);
    expect(alphChar(0.5)).toBe('S'); // sanity: 0.5 lands on 'S' — matches floor(0.5*32)=16
  });

  it('collides -> regenerates; constant colliding rand -> throws after 10 tries', () => {
    // constant 0.5 always produces the same code -> second createRoom exhausts retries
    const store = createRoomStore(() => 0.5);
    store.createRoom('c1', 'A');
    expect(() => store.createRoom('c2', 'B')).toThrow(/could not allocate room code/);
  });

  it('collision retry succeeds when the rand stream eventually differs', () => {
    // Sequence: first 6 draws (createRoom #1) = 0.5 -> 'SSSSSS'; then the next
    // 6 draws (createRoom #2 attempt 1) collide; a different draw follows.
    const draws = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9];
    let n = 0;
    const store = createRoomStore(() => draws[Math.min(n++, draws.length - 1)] ?? 0.5);
    const r1 = store.createRoom('c1', 'A');
    const r2 = store.createRoom('c2', 'B');
    expect(r1.roomCode).toBe('SSSSSS');
    expect(r2.roomCode).not.toBe(r1.roomCode);
    expect(r2.roomCode).toMatch(CODE_RE);
  });

  it('joinRoom adds an unseated player; guards not-found/duplicate/full', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    expect(() => store.joinRoom('ZZZZZZ', 'c2', 'A')).toThrow('not found');

    const j1 = store.joinRoom(room.roomCode, 'c2', 'Ada');
    expect(j1.players).toHaveLength(2);
    expect(j1.players[1]?.seat).toBe(-1);
    expect(j1.players[1]?.name).toBe('Ada');

    expect(() => store.joinRoom(room.roomCode, 'c2', 'Ada')).toThrow('already in room');

    store.joinRoom(room.roomCode, 'c3', 'Barry');
    store.joinRoom(room.roomCode, 'c4', 'Claire');
    expect(() => store.joinRoom(room.roomCode, 'c5', 'Dave')).toThrow('room is full');
  });

  it('selectSeat assigns a free seat; guards taken/invalid/not-in-room/playing', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    store.joinRoom(room.roomCode, 'c2', 'Ada');
    const seated = store.selectSeat(room.roomCode, 'c2', 2);
    expect(seated.players[1]?.seat).toBe(2);

    expect(() => store.selectSeat(room.roomCode, 'c2', 2)).toThrow('seat taken');
    expect(() => store.selectSeat(room.roomCode, 'c2', 4)).toThrow('invalid seat');
    expect(() => store.selectSeat(room.roomCode, 'c2', -1)).toThrow('invalid seat');
    expect(() => store.selectSeat(room.roomCode, 'nobody', 1)).toThrow('not in room');

    store.startGame(room.roomCode, 'c1');
    expect(() => store.selectSeat(room.roomCode, 'c2', 3)).toThrow('game already started');
  });

  it('addBot fills the first free seat by default or an explicit seat; host-only', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    const withBot = store.addBot(room.roomCode, 'c1');
    const bot = withBot.players[1];
    expect(bot?.isBot).toBe(true);
    expect(bot?.seat).toBe(1);
    expect(bot?.clientId).toMatch(/^bot-\d+$/);

    const explicit = store.addBot(room.roomCode, 'c1', 3);
    expect(explicit.players[2]?.seat).toBe(3);

    expect(() => store.addBot(room.roomCode, 'not-host')).toThrow('not the host');
    expect(() => store.addBot(room.roomCode, 'c1', 3)).toThrow('seat taken');
    expect(() => store.addBot(room.roomCode, 'c1', 9)).toThrow('invalid seat');

    // fill the last free seat (2): host 0, bots 1+3, then 2 -> all 4 full
    store.addBot(room.roomCode, 'c1', 2);
    expect(() => store.addBot(room.roomCode, 'c1')).toThrow('no free seats');
  });

  it('removeBot removes only actual bots; host-only', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    store.joinRoom(room.roomCode, 'c2', 'Ada');
    store.selectSeat(room.roomCode, 'c2', 1);
    const withBot = store.addBot(room.roomCode, 'c1', 2);
    const bot = withBot.players.find(p => p.isBot);
    expect(bot).toBeDefined();
    if (bot === undefined) return;

    const removed = store.removeBot(room.roomCode, 'c1', 2);
    expect(removed.players.find(p => p.clientId === bot.clientId)).toBeUndefined();

    expect(() => store.removeBot(room.roomCode, 'c1', 1)).toThrow('not a bot'); // human at 1
    expect(() => store.removeBot(room.roomCode, 'nobody', 2)).toThrow('not the host');
  });

  it('startGame flips phase; guards host/already-started', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    expect(() => store.startGame(room.roomCode, 'someone-else')).toThrow('not the host');
    const playing = store.startGame(room.roomCode, 'c1');
    expect(playing.phase).toBe('playing');
    expect(() => store.startGame(room.roomCode, 'c1')).toThrow('game already started');
  });

  it('leaveRoom removes the player; host transfers to the lowest seated remaining', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host'); // c1 host at seat 0
    store.joinRoom(room.roomCode, 'c2', 'B');
    store.joinRoom(room.roomCode, 'c3', 'C');
    store.selectSeat(room.roomCode, 'c2', 1);
    store.selectSeat(room.roomCode, 'c3', 2);

    // non-host leaves: host unchanged
    const afterBLeaf = store.leaveRoom(room.roomCode, 'c2');
    expect(afterBLeaf?.players.map(p => p.clientId)).toEqual(['c1', 'c3']);
    // c1 is still host: can add a bot at the free seat 1
    const withBot = store.addBot(room.roomCode, 'c1', 1);
    const botSeat1 = withBot.players.find(p => p.seat === 1);
    expect(botSeat1?.isBot).toBe(true);
    store.removeBot(room.roomCode, 'c1', 1);

    // host leaves -> lowest-seat remaining (c3 at seat 2) becomes host
    const afterHostLeaves = store.leaveRoom(room.roomCode, 'c1');
    expect(afterHostLeaves?.players.map(p => p.clientId)).toEqual(['c3']);
    // c3 is now host: can add a bot; the ex-host c1 cannot
    expect(() => store.addBot(room.roomCode, 'c3')).not.toThrow();
    expect(() => store.addBot(room.roomCode, 'c1')).toThrow('not the host');
  });

  it('leaveRoom deletes an empty room', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    const r = store.leaveRoom(room.roomCode, 'c1');
    expect(r).toBeUndefined();
    expect(store.getRoom(room.roomCode)).toBeUndefined();
  });

  it('setScenario changes the scenario; guarded to host + lobby', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    expect(room.scenario).toBe('firstTimer');
    const changed = store.setScenario(room.roomCode, 'c1', 'classicHorror');
    expect(changed.scenario).toBe('classicHorror');
    // a non-host cannot change it
    expect(() => store.setScenario(room.roomCode, 'stranger', 'classicHorror')).toThrow('not the host');
  });

  it('toSnapshot matches the protocol RoomSnapshot shape', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    const snap = store.toSnapshot(room);
    expect(snap).toEqual({
      roomCode: room.roomCode,
      phase: 'lobby',
      maxSeats: 4,
      scenario: 'firstTimer',
      players: room.players,
      partnerMode: false,
      skillSystem: false,
      customCards: [],
      mansionAttachmentMode: 1,
    });
  });

  it('setCustomCards records the selection; guarded to host + lobby', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host', 'firstTimer', false, undefined, undefined, false, ['mx-001']);
    expect(room.customCards).toEqual(['mx-001']);

    const changed = store.setCustomCards(room.roomCode, 'c1', []);
    expect(changed.customCards).toEqual([]);
    expect(store.toSnapshot(changed).customCards).toEqual([]);

    expect(() => store.setCustomCards(room.roomCode, 'stranger', ['mx-001'])).toThrow('not the host');
    store.startGame(room.roomCode, 'c1');
    expect(() => store.setCustomCards(room.roomCode, 'c1', ['mx-001'])).toThrow('game already started');
  });

  it('rejects a main-only character (ch-008) as a partner', () => {
    const store = createRoomStore(() => 0.3);
    expect(() => store.createRoom('c1', 'Host', 'firstTimer', true, 'ch-001', 'ch-008')).toThrow(/cannot be a partner/);

    const room = store.createRoom('c1', 'Host', 'firstTimer', true, 'ch-001', 'ch-002');
    expect(room.players[0]?.mainCharacterId).toBe('ch-001');
    expect(room.players[0]?.partnerCharacterId).toBe('ch-002');

    expect(() => store.setCharacterSelection(room.roomCode, 'c1', 'ch-001', 'ch-008')).toThrow(/cannot be a partner/);
    // a legal partner selection still works
    const changed = store.setCharacterSelection(room.roomCode, 'c1', 'ch-001', 'ch-003');
    expect(changed.players[0]?.partnerCharacterId).toBe('ch-003');
  });

  it('setConnected flips a player connection flag; guards unknown players', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('c1', 'Host');
    let latest = store.setConnected(room.roomCode, 'c1', false);
    expect(latest.players[0]?.connected).toBe(false);
    latest = store.setConnected(room.roomCode, 'c1', true);
    expect(latest.players[0]?.connected).toBe(true);
    expect(() => store.setConnected(room.roomCode, 'stranger', true)).toThrow('not in room');
  });

  it('two stores are fully isolated, including bot counters', () => {
    const s1 = createRoomStore(() => 0.3);
    const s2 = createRoomStore(() => 0.3);
    const r1 = s1.createRoom('c1', 'A');
    expect(s2.getRoom(r1.roomCode)).toBeUndefined();
    expect(s2.rooms.size).toBe(0);

    const b1 = s1.addBot(r1.roomCode, 'c1');
    const other = s2.createRoom('c2', 'B');
    const b2 = s2.addBot(other.roomCode, 'c2');
    // both start their bot counters at bot-1
    expect(b1.players.find(p => p.isBot)?.clientId).toBe('bot-1');
    expect(b2.players.find(p => p.isBot)?.clientId).toBe('bot-1');
  });
});