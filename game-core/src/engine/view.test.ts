import { describe, expect, it } from 'vitest';
import type { GameState, CardDef, CardInstance } from '../types';
import { sanitize, viewForSeat } from './view';
import { setup } from './game';

/** Minimal 2-seat playing state: deals characters + draws 5 each. */
function playingState(seed = 7): GameState {
  return setup(
    { seed, players: [
      { name: 'A', controller: 'human', characterCardId: undefined },
      { name: 'B', controller: 'human', characterCardId: undefined },
    ] },
    [
      { id: 'ch-1', name: 'Alpha', type: 'character', set: 'premier', copies: 1, hp: 8, maxHp: 8, abilities: [], text: '' },
      { id: 'ch-2', name: 'Beta', type: 'character', set: 'premier', copies: 1, hp: 9, maxHp: 9, abilities: [], text: '' },
      { id: 'w-1', name: 'Pistol', type: 'weapon', set: 'premier', copies: 4, cost: 10, ammoReq: 5, damage: 15, text: '' },
      { id: 'a-1', name: 'Ammo', type: 'ammunition', set: 'premier', copies: 6, cost: 5, bonuses: { ammo: 10 }, text: '' },
    ],
    [{ pileId: 'W', cardIds: ['w-1'] }, { pileId: 'A', cardIds: ['a-1'] }]
  );
}

describe('sanitize', () => {
  it('is a pure function: returns a new state, preserves the input', () => {
    const s = playingState();
    const before = JSON.stringify(s);
    const out = sanitize(s, 0);
    expect(JSON.stringify(s)).toBe(before); // input not mutated
    expect(out).not.toBe(s);
    expect(out.seats[0]).toBe(s.seats[0]); // viewing seat identity preserved
  });

  it('keeps the viewing seat fully visible', () => {
    const s = playingState();
    const out = sanitize(s, 0);
    expect(out.seats[0]?.hand).toEqual(s.seats[0]?.hand);
    expect(out.seats[0]?.inventory).toEqual(s.seats[0]?.inventory);
  });

  it("hides other seats' hand/inventory but keeps the rest of the table public", () => {
    const s = playingState();
    const out = sanitize(s, 0);
    expect(out.mansionDeck).toEqual(s.mansionDeck);
    expect(out.marketPiles).toEqual(s.marketPiles);
    expect(out.cardDefs).toEqual(s.cardDefs);
    expect(out.seats[1]?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
    expect(out.seats[1]?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
    // discard and play area are public, exactly as across a real table
    expect(out.seats[1]?.discard).toEqual(s.seats[1]?.discard);
    expect(out.seats[1]?.playArea).toEqual(s.seats[1]?.playArea);
  });

  it('placeholder length matches the hidden zone length', () => {
    const s = playingState();
    const out = sanitize(s, 0);
    const other = s.seats[1];
    const hidden = out.seats[1];
    expect(hidden?.hand).toHaveLength(other?.hand.length ?? 0);
    expect(hidden?.inventory).toHaveLength(other?.inventory.length ?? 0);
  });

  it('never exposes hidden ids that resolve to real card defs', () => {
    const s = playingState();
    const out = sanitize(s, 0);
    for (const seat of out.seats) {
      for (const id of [...(seat?.hand ?? []), ...(seat?.inventory ?? [])]) {
        if (id !== undefined && id.startsWith('hidden-')) {
          expect(out.cardDefs[id ?? '']).toBeUndefined();
        }
      }
    }
  });

  it('keeps the action log public: another seat keeps its real card ids', () => {
    const s = playingState();
    const played = Object.values(s.marketPiles)[0]?.cards[0];
    expect(played).toBeDefined();
    if (played === undefined) return;
    // a logged play by seat 0, viewed from seat 1
    const withLog: GameState = {
      ...s,
      log: [...s.log, { seq: (s.log.at(-1)?.seq ?? 0) + 1, action: { type: 'playActionCard', seat: 0, instanceId: played } }],
    };
    const out = sanitize(withLog, 1);
    const entry = out.log.find(e => e.action.type === 'playActionCard');
    expect(entry).toBeDefined();
    if (entry !== undefined && entry.action.type === 'playActionCard') {
      expect(entry.action.instanceId).toBe(played);
    }
  });

  it('spectator view (viewerSeat -1) hides every hand/inventory including the active one', () => {
    const s = playingState();
    const out = sanitize(s, -1);
    for (const seat of out.seats) {
      expect(seat?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
      expect(seat?.inventory.every(id => id.startsWith('hidden-'))).toBe(true);
    }
    // lengths preserved vs the raw state
    expect(out.seats[0]?.hand).toHaveLength(s.seats[0]?.hand.length ?? 0);
  });
});

describe('viewForSeat', () => {
  it('returns a PlayerView with the requested seat and its own sanitized state', () => {
    const s = playingState();
    const view = viewForSeat(s, 1);
    expect(view.seat).toBe(1);
    expect(view.state.seats[1]?.hand).toEqual(s.seats[1]?.hand);
    expect(view.state.seats[0]?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
  });
});

describe('engine card data sanity (used by view fixtures)', () => {
  it('fixture defs are real CardDefs', () => {
    const s = playingState();
    const defs = Object.values(s.cardDefs);
    const kind = (d: CardDef): void => { void d.id; };
    defs.forEach(kind);
    const inst = Object.values(s.cards)[0] as CardInstance | undefined;
    expect(inst?.cardId).toBeDefined();
  });
});