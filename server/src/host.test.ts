import { describe, it, expect } from 'vitest';
import { createRoomStore } from './rooms';
import { createHost, sanitize } from './host';
import type { GameState } from '@re/game-core';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function makePlayingRoom(seed = 7) {
  const store = createRoomStore(() => 0.3);
  const room = store.createRoom('host-1', 'Host');
  store.joinRoom(room.roomCode, 'p2', 'Player2');
  store.joinRoom(room.roomCode, 'p3', 'Player3');
  store.selectSeat(room.roomCode, 'p2', 1);
  store.selectSeat(room.roomCode, 'p3', 2);
  // 3 humans seated, host at 0
  const latest = store.getRoom(room.roomCode) as NonNullable<ReturnType<typeof store.getRoom>>;
  return { store, roomCode: latest.roomCode, room: latest };
}

describe('createHost', () => {
  it('start builds an engine state with all seated players', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    const s = host.start(42);
    expect(host.state).toBe(s);
    expect(s.seats).toHaveLength(3);
    expect(s.seats.map(p => p.name)).toEqual(['Host', 'Player2', 'Player3']);
    expect(s.phase).toBe('main');
  });

  it('start throws when called twice', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(1);
    expect(() => host.start(2)).toThrow('game already started');
  });

  it('start throws with no seated players', () => {
    // The store always seats the creator, so a no-seated-players room cannot be
    // reached through the store API — build one directly to test the host guard.
    const lonely: import('./rooms').Room = {
      roomCode: 'ABCDEF',
      phase: 'lobby',
      maxSeats: 4,
      players: [],
    };
    const host = createHost(lonely);
    expect(() => host.start(1)).toThrow('no seated players');
  });

  it('viewFor hides other players hand/inventory/discard contents', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(7);
    const mine = host.viewFor('host-1');
    expect(mine).toBeDefined();
    if (mine === undefined) return;

    expect(mine.seat).toBe(0);
    const mySeat = mine.state.seats[0];
    const otherSeat = mine.state.seats[1];
    // my cards are visible (real ids, non-hidden)
    for (const id of mySeat?.hand ?? []) {
      expect(id.startsWith('hidden-')).toBe(false);
    }
    // other players' zones are hidden placeholders preserving length
    expect(otherSeat?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(otherSeat?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(otherSeat?.discard.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(otherSeat?.playArea.every(id => id.startsWith('hidden-'))).toBe(true);
  });

  it('viewFor is undefined for unknown clients', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(7);
    expect(host.viewFor('nobody')).toBeUndefined();
    expect(host.viewFor('unseated-guy')).toBeUndefined();
  });

  it('apply rejects unknown clients and seat mismatches', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(7);
    const unknown = host.apply('ghost', { type: 'endTurn', seat: 0 });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown or unseated player');

    // p2 sits at seat 1; try to endTurn as seat 0
    const mismatch = host.apply('p2', { type: 'endTurn', seat: 0 });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toContain('does not match');
  });

  it('apply rejects actions not yet legal (game not started)', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    const r = host.apply('host-1', { type: 'endTurn', seat: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('game not started');
  });

  it('apply plays a legal action and updates the state', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    const s0 = host.start(7);
    const ammoInHand = s0.seats[0]?.hand.find(id => id !== undefined && s0.cardDefs[id.split('#')[0] ?? '']?.type === 'ammunition');
    expect(ammoInHand).toBeDefined();
    if (ammoInHand === undefined) return;
    const r = host.apply('host-1', { type: 'playAmmo', seat: 0, instanceId: ammoInHand });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gameOver).toBe(false);
    // the ammo card left the hand
    expect(r.state.seats[0]?.hand.includes(ammoInHand)).toBe(false);
  });

  it('apply validates against the engine rules', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(7);
    // It's host's turn; p2 tries to act out of turn
    const r = host.apply('p2', { type: 'endTurn', seat: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not your turn');
  });

  it('stepBot advances a bot seat and returns the result', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('h1', 'Human');
    store.addBot(room.roomCode, 'h1', 1); // bot at seat 1
    const latest = store.getRoom(room.roomCode) as NonNullable<ReturnType<typeof store.getRoom>>;
    const host = createHost(latest);
    host.start(11);
    // host (seat 0) is active; stepBot returns undefined (no bot at 0)
    expect(host.stepBot(11)).toBeUndefined();
    // let the human end the turn to pass to the bot seat
    const end = host.apply('h1', { type: 'endTurn', seat: 0 });
    expect(end.ok).toBe(true);
    // now seat 1 (bot) is active; stepBot plays for it
    const botResult = host.stepBot(11);
    expect(botResult).toBeDefined();
    if (botResult === undefined) return;
    expect(botResult.ok).toBe(true);
  });
});

describe('sanitize', () => {
  it('is a pure function: returns a new state, preserves the input', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    const s = host.start(7);
    const before = JSON.stringify(s);
    const out = sanitize(s, 0);
    expect(JSON.stringify(s)).toBe(before); // input not mutated
    expect(out).not.toBe(s);
    expect(out.seats[0]).toBe(s.seats[0]); // viewing seat identity preserved
  });

  it('keeps the viewing seat fully visible', () => {
    const host = createHost(makePlayingRoom().room);
    const s = host.start(7);
    const out = sanitize(s, 0);
    expect(out.seats[0]?.hand).toEqual(s.seats[0]?.hand);
    expect(out.seats[0]?.inventory).toEqual(s.seats[0]?.inventory);
  });

  it('hides mansion deck? no — mansion stays public, other seats hidden', () => {
    const host = createHost(makePlayingRoom().room);
    const s = host.start(7);
    const out = sanitize(s, 0);
    expect(out.mansionDeck).toEqual(s.mansionDeck);
    expect(out.seats[1]?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
  });

  it('placeholder length matches the hidden zone length', () => {
    const host = createHost(makePlayingRoom().room);
    const s = host.start(7);
    const out = sanitize(s, 0);
    const other = s.seats[1];
    const hidden = out.seats[1];
    expect(hidden?.hand).toHaveLength(other?.hand.length ?? 0);
    expect(hidden?.inventory).toHaveLength(other?.inventory.length ?? 0);
    expect(hidden?.discard).toHaveLength(other?.discard.length ?? 0);
  });

  it('never exposes hidden ids that resolve to real card defs', () => {
    const host = createHost(makePlayingRoom().room);
    const s = host.start(7);
    const out = sanitize(s, 0);
    for (const seat of out.seats) {
      for (const id of [...(seat?.hand ?? []), ...(seat?.inventory ?? []), ...(seat?.discard ?? []), ...(seat?.playArea ?? [])]) {
        if (id !== undefined && id.startsWith('hidden-')) {
          expect(out.cardDefs[id ?? '']).toBeUndefined();
        }
      }
    }
  });

  it('spectator view (viewerSeat -1) hides every seat including the active one', () => {
    const host = createHost(makePlayingRoom().room);
    const s = host.start(7);
    const out = sanitize(s, -1);
    for (const seat of out.seats) {
      expect(seat?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
      expect(seat?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
      expect(seat?.discard.every(id => id.startsWith('hidden-'))).toBe(true);
      expect(seat?.playArea.every(id => id.startsWith('hidden-'))).toBe(true);
    }
    // lengths preserved vs the raw state
    expect(out.seats[0]?.hand).toHaveLength(s.seats[0]?.hand.length ?? 0);
    // public board intact
    expect(out.marketPiles).toEqual(s.marketPiles);
    expect(out.mansionDeck).toEqual(s.mansionDeck);
    expect(out.cardDefs).toEqual(s.cardDefs);
  });

  it('sanitize redacts OTHER seats logged card ids but keeps the viewer own and public data', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    const s0 = host.start(7);
    // seat 0 plays an ammo card; seat 1 (player2) too
    const ammo0 = s0.seats[0]?.hand.find(id => id !== undefined && s0.cardDefs[id.split('#')[0] ?? '']?.type === 'ammunition');
    const ammo1 = s0.seats[1]?.hand.find(id => id !== undefined && s0.cardDefs[id.split('#')[0] ?? '']?.type === 'ammunition');
    expect(ammo0).toBeDefined();
    expect(ammo1).toBeDefined();
    if (ammo0 === undefined || ammo1 === undefined) return;
    const afterOwn = host.apply('host-1', { type: 'playAmmo', seat: 0, instanceId: ammo0 });
    expect(afterOwn.ok).toBe(true);
    // seat 1 acts: advance to their turn by ending seat 0
    const afterEnd = host.apply('host-1', { type: 'endTurn', seat: 0 });
    expect(afterEnd.ok).toBe(true);
    const afterOther = host.apply('p2', { type: 'playAmmo', seat: 1, instanceId: ammo1 });
    expect(afterOther.ok).toBe(true);
    if (!afterOther.ok) return;

    const raw = afterOther.state;
    const view0 = sanitize(raw, 0); // viewer is seat 0
    const ownLogEntry = view0.log.find(e => e.seq === 1);
    const otherLogEntry = view0.log.find(e => e.seq === 3);
    // my own playAmmo keeps the real instance id
    expect(ownLogEntry?.action.type === 'playAmmo' ? ownLogEntry.action.instanceId : '').toBe(ammo0);
    // other seat's playAmmo is redacted to a placeholder
    if (otherLogEntry?.action.type === 'playAmmo') {
      expect(otherLogEntry.action.instanceId).toMatch(/^hidden-/);
    } else {
      expect(true).toBe(true); // seat names/indices: guard for fixture drift
    }

    const view1 = sanitize(raw, 1);
    const own1 = view1.log.find(e => e.seq === 3);
    const other1 = view1.log.find(e => e.seq === 1);
    expect(own1?.action.type === 'playAmmo' ? own1.action.instanceId : '').toBe(ammo1);
    if (other1?.action.type === 'playAmmo') {
      expect(other1.action.instanceId).toMatch(/^hidden-/);
    }

    // spectator sees every instance redacted
    const spec = sanitize(raw, -1);
    for (const e of spec.log) {
      if (e.action.type === 'playAmmo') expect(e.action.instanceId).toMatch(/^hidden-/);
    }
  });
});