import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { locationScore } from './locations';

/**
 * Fan Locations batch 9 (Manny, 2026-11-19): loc-035 Tea Room, loc-036 Study,
 * loc-037 Stuffed Deer Room, loc-038 Suspended Ceiling Room, loc-039 Taxidermy
 * Room. (Terrace is loc-014, already implemented.) RULINGS: Stuffed Deer plays
 * the revealed action for FREE (no Action); Tea Room's skill is a RANDOM
 * Mercenaries catalogue skill (like Parlor).
 */

let counter = 0;
const POOL = [...PREMIER_CARDS, ...CUSTOM_CARDS];
const actionDef = POOL.find(c => c.type === 'action')!;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-002' }, { name: 'B', controller: 'human', characterCardId: 'ch-001' }], locationsMode: true },
    POOL, FIRST_TIMER_PILES, STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function putLocation(s: GameState, cardId: string, cubes: Record<number, number>): GameState {
  const id = `${cardId}#b9-${++counter}`;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } },
    locations: [{ instanceId: id, cubes, revealedBy: 0 }],
  };
}

function reg(s: GameState, id: string, cardId: string, zone: 'hand' | 'discard' | 'inventory' | 'mansionDeck' | 'supply', seat?: number): GameState {
  return { ...s, cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, ...(seat !== undefined ? { seat } : {}) } } } };
}

function revealOnly(s: GameState, cardId: string): GameState {
  const id = `${cardId}#rev-${++counter}`;
  let out: GameState = { ...reg(s, id, cardId, 'supply'), locationDeck: [id], locations: [] };
  out = applyAction(out, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  for (let i = 0; i < 8 && out.prompts.length > 0; i++) {
    const p = out.prompts[0]!;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

const byKind = (s: GameState, kind: string) => s.prompts.filter(p => p.payload?.kind === kind);

describe('Locations batch 9 — data + art', () => {
  it('defines the five new rooms', () => {
    const expectDef = (id: string, name: string, costs: readonly number[]) => {
      const d = CUSTOM_CARDS.find(c => c.id === id);
      expect(d).toEqual(expect.objectContaining({ id, name, type: 'location', locationKind: 'invest', locationCosts: costs }));
    };
    expectDef('loc-035', 'Tea Room', [30, 30, 30]);
    expectDef('loc-036', 'Study', [100]);
    expectDef('loc-037', 'Stuffed Deer Room', [60]);
    expectDef('loc-038', 'Suspended Ceiling Room', [60]);
    expectDef('loc-039', 'Taxidermy Room', [80]);
  });
  it('has normalized art for all five', () => {
    for (const id of ['loc-035', 'loc-036', 'loc-037', 'loc-038', 'loc-039']) {
      expect(existsSync(`src/data/CARD-ART/${id.toUpperCase()}.png`)).toBe(true);
    }
  });
});

describe('Tea Room (loc-035)', () => {
  it('turn start offers draw-2 / skill / decline based on cubes', () => {
    const s = startTurn(putLocation(game(), 'loc-035', { 0: 2 }));
    const p = byKind(s, 'teaRoomChoice')[0]!;
    expect(p.options).toEqual(['Draw 2 (remove 1)', 'Gain skill (remove 2)', 'Decline']);
    const one = startTurn(putLocation(game(), 'loc-035', { 0: 1 }));
    expect(byKind(one, 'teaRoomChoice')[0]?.options).toEqual(['Draw 2 (remove 1)', 'Decline']);
    const none = startTurn(putLocation(game(), 'loc-035', { 0: 0 }));
    expect(byKind(none, 'teaRoomChoice')).toEqual([]);
  });
  it('Draw 2 removes one cube and draws two cards', () => {
    const s = startTurn(putLocation(game(), 'loc-035', { 0: 2 }));
    const p = byKind(s, 'teaRoomChoice')[0]!;
    const before = s.seats[0]!.hand.length;
    const out = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(out.locations?.[0]?.cubes[0]).toBe(1);
    expect(out.seats[0]!.hand.length).toBe(before + 2);
  });
  it('Gain skill removes two cubes and gains a catalogue skill', () => {
    const s = startTurn(putLocation(game(), 'loc-035', { 0: 2 }));
    const p = byKind(s, 'teaRoomChoice')[0]!;
    const out = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    expect(out.locations?.[0]?.cubes[0]).toBe(0);
    expect(out.seats[0]?.skills?.length).toBe(1);
    const inst = out.cards[out.seats[0]!.skills![0]!]!;
    expect(out.cardDefs[inst.cardId]?.type).toBe('skill');
  });
});

describe('Study (loc-036)', () => {
  it('scores 1 decoration per action card the investor holds', () => {
    const a1 = `act#s1-${++counter}`;
    const a2 = `act#s2-${++counter}`;
    let s = putLocation(game(), 'loc-036', { 0: 1 });
    s = reg(s, a1, actionDef.id, 'hand', 0);
    s = reg(s, a2, actionDef.id, 'discard', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [a1], discard: [a2] } : p)) };
    expect(locationScore(s, 0)).toBe(2);
    expect(locationScore(s, 1)).toBe(0); // not invested
  });
  it('On Reveal: every living player gains 20 Gold', () => {
    const out = revealOnly(game({ turnGold: 5 }), 'loc-036');
    expect(out.seats[0]?.turnGold).toBe(25);
    expect(out.seats[1]?.turnGold).toBe(20);
  });
});

describe('Stuffed Deer Room (loc-037)', () => {
  it('turn start reveals the top Inventory action and plays it for free', () => {
    const top = `act#top-${++counter}`;
    let s = putLocation(game({ turnGold: 100, buysLeft: 1, actionsLeft: 1 }), 'loc-037', { 0: 1 });
    // A full hand (no turn-start draw) leaves the action as the deck top that
    // Stuffed Deer reveals and arms for a free play.
    const fillers = [0, 1, 2, 3, 4].map(i => `am-001#f${i}-${counter}`);
    for (const f of fillers) s = reg(s, f, 'am-001', 'hand', 0);
    s = reg(s, top, actionDef.id, 'inventory', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: fillers, inventory: [top] } : p)) };
    // startTurn arms the free play; the next action's wrapper consumes it.
    s = startTurn(s);
    expect(s.seats[0]?.pendingStuffedDeerPlayId).toBe(top);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 100, buysLeft: 1 } : p)) };
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect(out.seats[0]?.playArea).toContain(top);
    expect(out.seats[0]?.actionsLeft).toBe(1); // free play spent no Action
  });
  it('On Reveal: every player takes 10 damage', () => {
    const base = game();
    const hp0 = base.seats[0]!.hp;
    const hp1 = base.seats[1]!.hp;
    const out = revealOnly(base, 'loc-037');
    expect(out.seats[0]?.hp).toBe(hp0 - 10);
    expect(out.seats[1]?.hp).toBe(hp1 - 10);
  });
});

describe('Suspended Ceiling Room (loc-038)', () => {
  it('draws a card when ANOTHER player defeats an Infected', () => {
    const w1 = `we-009#c1-${++counter}`;
    const w2 = `we-009#c2-${++counter}`;
    const ma = `ma-001#c-${++counter}`;
    let s = putLocation(game(), 'loc-038', { 0: 1 });
    s = reg(s, w1, 'we-009', 'hand', 1);
    s = reg(s, w2, 'we-009', 'hand', 1);
    s = reg(s, ma, 'ma-001', 'mansionDeck');
    s = {
      ...s, activeSeat: 1, locationDeck: [], mansionDeck: [ma, ...s.mansionDeck],
      seats: s.seats.map((p, i) => (i === 1 ? { ...p, hand: [w1, w2], exploresLeft: 1, turnAmmo: 50 } : p)),
    };
    const before = s.seats[0]!.hand.length;
    const out = applyAction(s, { type: 'explore', seat: 1, weapons: [w1, w2], exploreCount: 1 });
    expect(out.seats[1]?.attached).toContain(ma); // seat 1 defeated it
    expect(out.seats[0]!.hand.length).toBe(before + 1); // seat 0 drew
  });
  it('On Reveal caps the revealer health loss at 10 for the turn', () => {
    let s = putLocation(game({ turnGold: 100, buysLeft: 1 }), 'loc-038', { 0: 1 });
    s = { ...s, healthLossCapThisTurn: { seat: 0, baseline: 50, cap: 10 }, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 25 } : p)) };
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect(out.seats[0]?.hp).toBe(40); // clamped to baseline - cap
  });
});

describe('Taxidermy Room (loc-039)', () => {
  it('turn start grants +1 Action', () => {
    const base = startTurn(game());
    const withRoom = startTurn(putLocation(game(), 'loc-039', { 0: 1 }));
    expect(withRoom.seats[0]!.actionsLeft).toBe(base.seats[0]!.actionsLeft + 1);
  });
  it('On Reveal blocks the revealer from playing action cards this turn', () => {
    const act = `act#tax-${++counter}`;
    let s = reg(game(), act, actionDef.id, 'hand', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [act], actionsLeft: 3 } : p)) };
    const out = revealOnly(s, 'loc-039');
    expect(out.seats[0]?.blockedActionPlaysThisTurn).toBe(true);
    expect(validateAction(out, { type: 'playActionCard', seat: 0, instanceId: act }).ok).toBe(false);
  });
});
