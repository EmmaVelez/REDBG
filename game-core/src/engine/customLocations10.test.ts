import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { locationScore, cardXp, xpTokenPiles } from './locations';

/**
 * Fan Locations batch 10 (Manny, 2026-11-19): loc-040 Firearms Room,
 * loc-041 Garden, loc-042 Greenhouse, loc-043 Helipad Lookout,
 * loc-044 Hidden Library, loc-045 Exhibition Room.
 * RULINGS: Setup XP fires on reveal/entering play; Greenhouse/Helipad are invest
 * rooms whose abilities spend the card's XP pool; Exhibition takes ALL card XP
 * on >20 explore damage; Garden is a 0-cost invest room spending personal XP.
 */

let counter = 0;
const POOL = [...PREMIER_CARDS, ...CUSTOM_CARDS];
const knifeDef = POOL.find(c => c.type === 'weapon' && (c.weaponTags ?? []).includes('knife'))!;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-002' }, { name: 'B', controller: 'human', characterCardId: 'ch-001' }], locationsMode: true },
    POOL, FIRST_TIMER_PILES, STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function putLocation(s: GameState, cardId: string, cubes: Record<number, number>): GameState {
  const id = `${cardId}#b10-${++counter}`;
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
const locId = (s: GameState, cardId: string) => (s.locations ?? []).find(l => s.cards[l.instanceId]?.cardId === cardId)?.instanceId;

describe('Locations batch 10 — data + art', () => {
  it('defines the six new rooms', () => {
    const expectDef = (id: string, name: string, kind: string, costs: readonly number[]) => {
      const d = CUSTOM_CARDS.find(c => c.id === id);
      expect(d).toEqual(expect.objectContaining({ id, name, type: 'location', locationKind: kind, locationCosts: costs }));
    };
    expectDef('loc-040', 'Firearms Room', 'global', [3]);
    expectDef('loc-041', 'Garden', 'invest', [0]);
    expectDef('loc-042', 'Greenhouse', 'invest', [10]);
    expectDef('loc-043', 'Helipad Lookout', 'invest', [30]);
    expectDef('loc-044', 'Hidden Library', 'global', [3]);
    expectDef('loc-045', 'Exhibition Room', 'global', [3]);
  });
  it('has normalized art for all six', () => {
    for (const id of ['loc-040', 'loc-041', 'loc-042', 'loc-043', 'loc-044', 'loc-045']) {
      expect(existsSync(`src/data/CARD-ART/${id.toUpperCase()}.png`)).toBe(true);
    }
  });
});

describe('Firearms Room (loc-040)', () => {
  it('GLOBAL: -1 decoration per ammo other than 10 ammo', () => {
    const a20 = `am-002#f-${++counter}`;
    const a10 = `am-001#f-${++counter}`;
    let s = putLocation(game(), 'loc-040', {});
    s = reg(s, a20, 'am-002', 'hand', 0);
    s = reg(s, a10, 'am-001', 'hand', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [a20, a10] } : p)) };
    expect(locationScore(s, 0)).toBe(-1); // am-002 counts, am-001 excluded
    expect(locationScore(s, 1)).toBe(0);
  });
});

describe('Garden (loc-041)', () => {
  it('post-buy with 30+ gold offers the 1-XP infection choice', () => {
    const s = putLocation(game({ turnGold: 100, buysLeft: 1, xp: 1 }), 'loc-041', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' }); // 100-30=70 left
    const p = byKind(out, 'gardenOffer')[0]!;
    expect(p.options).toEqual(['Spend 1 XP', 'Decline']);
    const spent = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(spent.seats[0]?.xp).toBe(0);
    const target = byKind(spent, 'gardenTarget')[0]!;
    expect(target.options).toContain('Remove from self');
  });
  it('gives an Infection to the chosen player', () => {
    let s = putLocation(game({ turnGold: 100, buysLeft: 1, xp: 1 }), 'loc-041', { 0: 1 });
    s = { ...s, infectionDeck: ['inf#a', 'inf#b'] };
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const p = byKind(out, 'gardenOffer')[0]!;
    const spent = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    const target = byKind(spent, 'gardenTarget')[0]!;
    const idx = target.options.indexOf('1');
    const given = applyAction(spent, { type: 'chooseOption', seat: 0, promptId: target.id, option: idx });
    expect(given.seats[1]?.infectionCards ?? []).toEqual(['inf#a']);
  });
  it('no offer below 30 gold leftover', () => {
    const s = putLocation(game({ turnGold: 30, buysLeft: 1, xp: 1 }), 'loc-041', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' }); // 0 left
    expect(byKind(out, 'gardenOffer')).toEqual([]);
  });
});

describe('Greenhouse (loc-042)', () => {
  it('Setup adds 3 XP per player on reveal', () => {
    const out = revealOnly(game(), 'loc-042');
    const id = locId(out, 'loc-042')!;
    expect(cardXp(out, id)).toBe(6); // 3 x 2 players
  });
  it('forfeit a Buy discards 1 card XP and arms +20 first-explore damage', () => {
    let s = putLocation(game({ buysLeft: 1 }), 'loc-042', { 0: 1 });
    const id = locId(s, 'loc-042')!;
    s = { ...s, locationXp: { [id]: 6 } };
    const out = applyAction(s, { type: 'forfeitBuy', seat: 0 });
    expect(out.seats[0]?.buysLeft).toBe(0);
    expect(cardXp(out, id)).toBe(5);
    expect(out.greenhouseDamageBonus).toEqual({ seat: 0, amount: 20 });
  });
});

describe('Helipad Lookout (loc-043)', () => {
  it('Setup adds 3 XP per player on reveal', () => {
    const out = revealOnly(game(), 'loc-043');
    expect(cardXp(out, locId(out, 'loc-043')!)).toBe(6);
  });
  it('on defeat offers +30 Gold or Skill+Infection for 1 card XP', () => {
    const w1 = `we-009#h1-${++counter}`;
    const w2 = `we-009#h2-${++counter}`;
    const ma = `ma-001#h-${++counter}`;
    let s = putLocation(game(), 'loc-043', { 0: 1 });
    const id = locId(s, 'loc-043')!;
    s = reg(s, w1, 'we-009', 'hand', 0);
    s = reg(s, w2, 'we-009', 'hand', 0);
    s = reg(s, ma, 'ma-001', 'mansionDeck');
    s = { ...s, locationXp: { [id]: 6 }, locationDeck: [], mansionDeck: [ma, ...s.mansionDeck], seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [w1, w2], exploresLeft: 1, turnAmmo: 50, turnGold: 0 } : p)) };
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 1 });
    const p = byKind(out, 'helipadOffer')[0]!;
    expect(p.options).toEqual(['+30 Gold', 'Skill + Infection', 'Decline']);
    const gold = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(gold.seats[0]?.turnGold).toBe(30);
    expect(cardXp(gold, id)).toBe(5);
  });
});

describe('Hidden Library (loc-044)', () => {
  it('GLOBAL: 5 decorations for 4 knives', () => {
    let s = putLocation(game(), 'loc-044', {});
    const knives = [0, 1, 2, 3].map(i => `knife#${i}-${counter}`);
    for (const k of knives) s = reg(s, k, knifeDef.id, 'hand', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: knives } : p)) };
    expect(locationScore(s, 0)).toBe(5);
    expect(locationScore(s, 1)).toBe(0);
  });
  it('On Reveal: every other player may discard hand and draw 5', () => {
    const id = `loc-044#rev-${++counter}`;
    let s: GameState = { ...reg(game(), id, 'loc-044', 'supply'), locationDeck: [id], locations: [] };
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    const p = byKind(s, 'hiddenLibraryDraw').find(x => x.seat === 1)!;
    expect(p.options).toEqual(['Discard & Draw', 'Decline']);
    const drew = applyAction(s, { type: 'chooseOption', seat: 1, promptId: p.id, option: 0 });
    expect(drew.seats[1]?.hand.length).toBe(5);
  });
});

describe('Exhibition Room (loc-045)', () => {
  it('Setup puts 1 XP on every action and weapon pile', () => {
    const out = revealOnly(game(), 'loc-045');
    expect(xpTokenPiles(out)).toContain('foyer'); // ac-001 action pile
  });
  it('buying an action/weapon moves its pile XP to the card', () => {
    let s = putLocation(game({ turnGold: 100, buysLeft: 1 }), 'loc-045', {});
    s = { ...s, xpTokens: ['foyer'] };
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const id = locId(out, 'loc-045')!;
    expect(cardXp(out, id)).toBe(1);
    expect(xpTokenPiles(out)).not.toContain('foyer');
  });
  it('taking >20 explore damage takes ALL the card XP', () => {
    const ma = `ma-006#e-${++counter}`; // Licker, attack 30
    let s = putLocation(game(), 'loc-045', {});
    const id = locId(s, 'loc-045')!;
    s = reg(s, ma, 'ma-006', 'mansionDeck');
    s = { ...s, locationXp: { [id]: 3 }, locationDeck: [], mansionDeck: [ma, ...s.mansionDeck], seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 50, maxHp: 50, exploresLeft: 1, turnAmmo: 0, xp: 0 } : p)) };
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(out.seats[0]?.xp).toBeGreaterThanOrEqual(3); // took all 3 stored XP
    expect(cardXp(out, id)).toBe(0); // card emptied
  });
});
