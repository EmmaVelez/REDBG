import { describe, it, expect } from 'vitest';
import { createRoomStore } from './rooms';
import { createHost } from './host';
import { sanitize, pilesForScenario, seatAwaitingAction } from '@re/game-core';
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
  it('start builds the scenario piles the room selected', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('host-1', 'Host', 'classicHorror');
    store.joinRoom(room.roomCode, 'p2', 'Player2');
    store.selectSeat(room.roomCode, 'p2', 1);
    const latest = store.getRoom(room.roomCode) as NonNullable<ReturnType<typeof store.getRoom>>;
    const host = createHost(latest);
    const s = host.start(7);
    const pileIds = Object.keys(s.marketPiles);
    expect(latest.scenario).toBe('classicHorror');
    expect(pileIds).toContain('itemmgmt');
    expect(pileIds).toContain('spray');
    expect(pileIds).toContain('longbow');
    expect(pileIds).not.toContain('merc');
    expect(pileIds).not.toContain('six');
    // A 2-player room on a seeded run: characters must stay unique too.
    const chars = s.seats.map(p => p.characterInstanceId.split('#')[0] ?? '');
    expect(new Set(chars).size).toBe(chars.length);
  });
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
      scenario: 'firstTimer',
      players: [],
      partnerMode: false,
      skillSystem: false,
      customCards: [],
    };
    const host = createHost(lonely);
    expect(() => host.start(1)).toThrow('no seated players');
  });

  it('viewFor hides other players hand/inventory but leaves the rest of the table public', () => {
    const { room } = makePlayingRoom();
    const host = createHost(room);
    host.start(7);
    const mine = host.viewFor('host-1');
    expect(mine).toBeDefined();
    if (mine === undefined) return;
    const raw = host.state;
    expect(raw).toBeDefined();
    if (raw === undefined) return;

    expect(mine.seat).toBe(0);
    const mySeat = mine.state.seats[0];
    const otherSeat = mine.state.seats[1];
    // my cards are visible (real ids, non-hidden)
    for (const id of mySeat?.hand ?? []) {
      expect(id.startsWith('hidden-')).toBe(false);
    }
    // other players' face-down zones are hidden placeholders preserving length
    expect(otherSeat?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(otherSeat?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
    // their discard and play area stay public, exactly as across a real table
    expect(otherSeat?.discard).toEqual(raw.seats[1]?.discard);
    expect(otherSeat?.playArea).toEqual(raw.seats[1]?.playArea);
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

describe('Skill Draft with bots', () => {
  it('bot seats are stepped through the whole draft instead of stalling it', () => {
    const store = createRoomStore(() => 0.3);
    const room = store.createRoom('h1', 'Human', 'firstTimer', false, undefined, undefined, true);
    store.addBot(room.roomCode, 'h1', 1);
    store.addBot(room.roomCode, 'h1', 2);
    const latest = store.getRoom(room.roomCode) as NonNullable<ReturnType<typeof store.getRoom>>;
    const host = createHost(latest);

    let state = host.start(11);
    expect(state.phase).toBe('skillDraft');
    expect(state.prompts[0]?.payload?.kind).toBe('skillDraftPick');
    expect(state.prompts[0]?.seat).toBe(0);

    // Alternate: step every bot seat, answer every human prompt.
    let guard = 0;
    while (state.phase === 'skillDraft' && guard++ < 500) {
      const waiting = seatAwaitingAction(state);
      const sitter = latest.players.find(p => p.seat === waiting);
      if (sitter?.isBot === true) {
        const r = host.stepBot(11);
        if (r === undefined || !r.ok) break;
        state = r.state;
        continue;
      }
      const prompt = state.prompts.find(p => p.seat === waiting);
      if (prompt === undefined) break;
      const r = host.apply('h1', { type: 'chooseOption', seat: waiting, promptId: prompt.id, option: 0 });
      if (!r.ok) break;
      state = r.state;
    }

    expect(state.phase).toBe('main');
    expect(state.skillDraft).toBeUndefined();
    expect(state.seats[0]?.skills).toHaveLength(3);
    expect(state.seats[1]?.skills).toHaveLength(3);
    expect(state.seats[2]?.skills).toHaveLength(3);
  });
});

describe('sanitize integration (public log across real host play)', () => {
  it('keeps the action log public for every viewer while hands stay hidden', () => {
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

    // Every viewer — including a spectator — sees BOTH plays with their real
    // instance ids: what a player did is public once done, as across a table.
    for (const viewer of [0, 1, -1]) {
      const view = sanitize(raw, viewer);
      const plays = view.log.filter(e => e.action.type === 'playAmmo');
      expect(plays).toHaveLength(2);
      const ids = plays.map(e => (e.action.type === 'playAmmo' ? e.action.instanceId : ''));
      expect(ids).toContain(ammo0);
      expect(ids).toContain(ammo1);
    }

    // But each viewer still sees only their OWN face-down zones...
    const view0 = sanitize(raw, 0);
    expect(view0.seats[0]?.hand).toEqual(raw.seats[0]?.hand);
    expect(view0.seats[1]?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(view0.seats[1]?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
    // ...while the other seat's play area stays public.
    expect(view0.seats[1]?.playArea).toEqual(raw.seats[1]?.playArea);
  });
});