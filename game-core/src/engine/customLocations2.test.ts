import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { CardInstance, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { locationScore } from './locations';

/** Fan Locations batch 2: loc-009 Lord Spencer's Study, loc-010 Lounge,
 *  loc-011 Mansion Bathroom, loc-012 Materials Room, loc-013 Mirror Corridor. */

const NEW_IDS = ['loc-009', 'loc-010', 'loc-011', 'loc-012', 'loc-013'] as const;

let counter = 0;

function game(over: Partial<PlayerState> = {}, seats = 2): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? 'ch-002' : 'ch-001',
  }));
  const s = setup(
    { seed: 11, players, locationsMode: true },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function onlyLocation(s: GameState, cardId: string): GameState {
  const id = `${cardId}#only${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } } as GameState['cards'];
  return { ...s, cards, locationDeck: [id], locations: [] };
}

/** Reveal the location and dismiss every prompt it raises. */
function revealAndAck(s: GameState, cardId: string): GameState {
  let out = onlyLocation(s, cardId);
  out = applyAction(out, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  for (let guard = 0; guard < 20 && out.prompts.length > 0; guard++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

function defOf(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

describe('Locations batch 2 — data', () => {
  it('defines the five new cards with the printed kind and cost', () => {
    expect(defOf('loc-009')).toEqual(expect.objectContaining({ id: 'loc-009', name: "Lord Spencer's Study", locationKind: 'invest', locationCosts: [30] }));
    expect(defOf('loc-010')).toEqual(expect.objectContaining({ id: 'loc-010', name: 'Lounge', locationKind: 'invest', locationCosts: [10] }));
    expect(defOf('loc-011')).toEqual(expect.objectContaining({ id: 'loc-011', name: 'Mansion Bathroom', locationKind: 'invest', locationCosts: [10] }));
    expect(defOf('loc-012')).toEqual(expect.objectContaining({ id: 'loc-012', name: 'Materials Room', locationKind: 'global', locationCosts: [20] }));
    expect(defOf('loc-013')).toEqual(expect.objectContaining({ id: 'loc-013', name: 'Mirror Corridor', locationKind: 'global', locationCosts: [20] }));
  });

  it('ships card art for all five', () => {
    for (const id of NEW_IDS) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });

  it('ships card art for Lesson Space (loc-008)', () => {
    // Batch-1 art drop (2026-11-19): normalized to the LOC convention,
    // 320x436 palette PNG like LOC-009..023.
    expect(existsSync('src/data/CARD-ART/LOC-008.png')).toBe(true);
  });

  it('keeps every location id unique', () => {
    for (const id of NEW_IDS) {
      expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
    }
  });
});

describe("Lord Spencer's Study", () => {
  it('is an investment card: reveal heals everyone 5, the cube pays XP per trash', () => {
    let s = game({ level: 1, exploresLeft: 1, hp: 60, maxHp: 100, turnGold: 100, buysLeft: 2 });
    s = {
      ...s,
      seats: s.seats.map((p, i) => (i === 1 ? { ...p, hp: 60, maxHp: 100 } : p)),
    };
    s = revealAndAck(s, 'loc-009');
    expect((s.seats[0] as PlayerState).hp).toBe(65);
    expect((s.seats[1] as PlayerState).hp).toBe(65);
    // No cube yet -> no XP on trash.
    const loc = (s.locations ?? [])[0];
    expect(loc).toBeDefined();
    expect(validateAction(s, { type: 'investLocation', seat: 0, instanceId: loc!.instanceId }).ok).toBe(true);
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: loc!.instanceId });
    expect((s.seats[0] as PlayerState).turnGold).toBe(70);  // 100 - 30 for the cube
    // A trash now pays 1 XP. Use a REAL trash: give the seat AC-003 Shattered
    // Memories ("Trash up to 2 cards from your discard pile") plus a discard
    // card, then play it and answer the prompt.
    const xpBefore = (s.seats[0] as PlayerState).xp ?? 0;
    const victim = `am-001#study${++counter}`;
    const memo = `ac-003#study${++counter}`;
    s = {
      ...s,
      cards: {
        ...s.cards,
        [victim]: { instanceId: victim, cardId: 'am-001', location: { zone: 'discard', index: 0, seat: 0 } },
        [memo]: { instanceId: memo, cardId: 'ac-003', location: { zone: 'hand', index: 0, seat: 0 } },
      } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0
        ? { ...p, discard: [...p.discard, victim], hand: [...p.hand, memo] }
        : p)),
    };
    let out = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: memo });
    const trashPrompt = out.prompts.find(p => p.payload?.kind === 'trashUpToTwoFromDiscard');
    if (trashPrompt === undefined) throw new Error('no trash prompt raised');
    out = applyAction(out, { type: 'chooseOption', seat: 0, promptId: trashPrompt.id, option: 0 });
    expect(out.removed).toContain(victim);
    expect((out.seats[0] as PlayerState).xp ?? 0).toBe(xpBefore + 1);
  });
});

describe('Lounge', () => {
  it('scores 1 decoration per card held from a now-empty pile', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-010');
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 100, buysLeft: 1 } : p)) };
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    // Empty one pile and give seat 0 two cards of that def.
    const pile = Object.values(s.marketPiles).find(p => p.cards.length >= 2)!;
    const cid = s.cards[pile.cards[0] ?? '']?.cardId;
    if (cid === undefined) throw new Error('pile has no cardId');
    // Empty THIS pile's instances out of the market.
    const emptied = { ...pile, cards: [] };
    const mk = (n: number) => {
      for (let i = 0; i < n; i++) {
        const id = `${cid}#lounge${++counter}`;
        s = {
          ...s,
          cards: { ...s.cards, [id]: { instanceId: id, cardId: cid!, location: { zone: 'discard', index: 0, seat: 0 } } } as GameState['cards'],
          seats: s.seats.map((p, i) => (i === 0 ? { ...p, discard: [...p.discard, id] } : p)),
        };
      }
    };
    mk(2);
    s = {
      ...s,
      marketPiles: { ...s.marketPiles, [pile.pileId]: emptied },
    };
    // Two cards from the emptied pile are counted (the seat may already
    // hold others of that def, so assert the score reflects at least them).
    expect(locationScore(s, 0)).toBeGreaterThanOrEqual(2);
  });

  it('On Reveal removes the revealing seat\'s top Infected and counters', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    // Give seat 0 an attached Infected and a counter.
    const infId = `ma-005#lounge${++counter}`;
    const counterId = `ex-009#lounge${++counter}`;
    s = {
      ...s,
      cardDefs: { ...s.cardDefs, 'ex-009': { ...(s.cardDefs['ex-009'] ?? { id: 'ex-009', name: 'Poison', type: 'counter', set: 'custom', text: '', copies: 1 }) } } as GameState['cardDefs'],
      cards: {
        ...s.cards,
        [infId]: { instanceId: infId, cardId: 'ma-005', location: { zone: 'attached', index: 0, seat: 0 } },
        [counterId]: { instanceId: counterId, cardId: 'ex-009', location: { zone: 'skillArea', index: 0 } },
      } as Record<string, CardInstance>,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: [...p.attached, infId], counters: [...(p.counters ?? []), counterId] } : p)),
    };
    const before = s.removed.length;
    s = revealAndAck(s, 'loc-010');
    const seat = s.seats[0] as PlayerState;
    expect(seat.attached).not.toContain(infId);
    expect(seat.counters ?? []).not.toContain(counterId);
    expect(s.removed.slice(before).sort()).toEqual([counterId, infId].sort());
  });
});

describe('Mansion Bathroom', () => {
  it('scores per copy of the 2nd most common weapon NAME held', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-011');
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 100, buysLeft: 1 } : p)) };
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    // Seat 0 holds 3x Combat Knife (we-004) and 2x Handgun (we-001).
    const give = (cid: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const id = `${cid}#bath${++counter}`;
        s = {
          ...s,
          cards: { ...s.cards, [id]: { instanceId: id, cardId: cid, location: { zone: 'inventory', index: 0, seat: 0 } } } as GameState['cards'],
          seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: [...p.inventory, id] } : p)),
        };
      }
    };
    give('we-004', 3);
    give('we-001', 2);
    // 2nd most common name is the Handgun with 2 copies.
    expect(locationScore(s, 0)).toBe(2);
  });

  it('returns 0 with fewer than two distinct weapon names', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-011');
    const id = `we-004#bath${++counter}`;
    s = {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId: 'we-004', location: { zone: 'inventory', index: 0, seat: 0 } } } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: [...p.inventory, id] } : p)),
    };
    expect(locationScore(s, 0)).toBe(0);
  });
});

describe('Materials Room', () => {
  it('penalises 1 decoration per Inventory card beyond 18', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-012');
    // A starting inventory is under 18 -> no penalty yet. Push it over and
    // confirm the penalty is per card beyond 18.
    const base = (s.seats[0] as PlayerState).inventory.length;
    expect(locationScore(s, 0)).toBe(0);
    const extra = Math.max(0, 19 - base);
    for (let i = 0; i < extra; i++) {
      const id = `am-001#mat${++counter}`;
      s = {
        ...s,
        cards: { ...s.cards, [id]: { instanceId: id, cardId: 'am-001', location: { zone: 'inventory', index: 0, seat: 0 } } } as GameState['cards'],
        seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: [...p.inventory, id] } : p)),
      };
    }
    expect(locationScore(s, 0)).toBe(-(Math.max(0, base + extra - 18)));
  });
});

describe('Mirror Corridor', () => {
  it('penalises 1 decoration per singleton Inventory card', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-013');
    const inv = (s.seats[0] as PlayerState).inventory;
    const counts = new Map<string, number>();
    for (const id of inv) {
      const name = s.cardDefs[s.cards[id]?.cardId ?? '']?.name;
      if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let singletons = 0;
    for (const c of counts.values()) if (c === 1) singletons += 1;
    expect(locationScore(s, 0)).toBe(-singletons);
  });

  it('On Reveal arms a -10 HP (min 5) reduction for the rest of the turn', () => {
    let s = game({ level: 1, hp: 200, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-013');
    expect(s.infectedHpReductionThisTurn).toEqual({ amount: 10, min: 5 });
    // ...and it is gone next turn.
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    const next = startTurn(ended);
    expect(next.infectedHpReductionThisTurn).toBeUndefined();
  });
});
