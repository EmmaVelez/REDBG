import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn, checkWin } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Fan Locations batch 8 (Manny, 2026-11-19): loc-029 Statue Corridor,
 * loc-030 Storeroom, loc-031 Researcher's Private Room, loc-032 Shed,
 * loc-033 Small Dining Room, loc-034 Stairway.
 * RULINGS: Storeroom rearrange = choose a weapon pile's new TOP card; the
 * extra turn = one final turn per living investor after the base game ends;
 * Stairway = spend 1 XP to reveal the top Location then free-invest a room
 * not yet cubed (no Buy).
 */

let counter = 0;
const POOL = [...PREMIER_CARDS, ...CUSTOM_CARDS];
const goldActionDef = POOL.find(c => c.type === 'action' && (c.bonuses?.gold ?? 0) > 0)!;
const plainActionDef = POOL.find(c => c.type === 'action' && (c.bonuses?.gold ?? 0) === 0)!;
const weaponDef = POOL.find(c => c.type === 'weapon')!;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-002' }, { name: 'B', controller: 'human', characterCardId: 'ch-001' }], locationsMode: true },
    POOL,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function putLocation(s: GameState, cardId: string, cubes: Record<number, number>): GameState {
  const id = `${cardId}#b8-${++counter}`;
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
  for (let i = 0; i < 6 && out.prompts.length > 0; i++) {
    const p = out.prompts[0]!;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

const byKind = (s: GameState, kind: string) => s.prompts.filter(p => p.payload?.kind === kind);

describe('Locations batch 8 — data + art', () => {
  it('defines the six new rooms', () => {
    const expectDef = (id: string, name: string, costs: readonly number[]) => {
      const d = CUSTOM_CARDS.find(c => c.id === id);
      expect(d).toEqual(expect.objectContaining({ id, name, type: 'location', locationKind: 'invest', locationCosts: costs }));
    };
    expectDef('loc-029', 'Statue Corridor', [70]);
    expectDef('loc-030', 'Storeroom', [50]);
    expectDef('loc-031', "Researcher's Private Room", [40]);
    expectDef('loc-032', 'Shed', [40]);
    expectDef('loc-033', 'Small Dining Room', [30]);
    expectDef('loc-034', 'Stairway', [10]);
  });

  it('has normalized art for all six', () => {
    for (const id of ['loc-029', 'loc-030', 'loc-031', 'loc-032', 'loc-033', 'loc-034']) {
      expect(existsSync(`src/data/CARD-ART/${id.toUpperCase()}.png`)).toBe(true);
    }
  });
});

describe('Statue Corridor (loc-029)', () => {
  it('On Reveal: the revealer loses 3 XP (floor 0)', () => {
    const out = revealOnly(game({ xp: 5 }), 'loc-029');
    expect(out.seats[0]?.xp).toBe(2);
    const low = revealOnly(game({ xp: 1 }), 'loc-029');
    expect(low.seats[0]?.xp).toBe(0);
  });

  it('gold-icon action cards cost no actions when invested', () => {
    const gid = `gold#h-${++counter}`;
    let s = putLocation(game({ actionsLeft: 0 }), 'loc-029', { 0: 1 });
    s = { ...reg(s, gid, goldActionDef.id, 'hand', 0), seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [gid] } : p)) };
    expect(validateAction(s, { type: 'playActionCard', seat: 0, instanceId: gid }).ok).toBe(true);
    const out = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: gid });
    expect(out.seats[0]?.actionsLeft).toBe(0); // not spent
    expect(out.seats[0]?.playArea).toContain(gid);
  });

  it('non-gold actions still cost an action; without investment gold costs one too', () => {
    const pid = `plain#h-${++counter}`;
    let s = putLocation(game({ actionsLeft: 0 }), 'loc-029', { 0: 1 });
    s = { ...reg(s, pid, plainActionDef.id, 'hand', 0), seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [pid] } : p)) };
    expect(validateAction(s, { type: 'playActionCard', seat: 0, instanceId: pid }).ok).toBe(false);
    const gid = `gold#n-${++counter}`;
    let n = game({ actionsLeft: 0 });
    n = { ...reg(n, gid, goldActionDef.id, 'hand', 0), seats: n.seats.map((p, i) => (i === 0 ? { ...p, hand: [gid] } : p)) };
    expect(validateAction(n, { type: 'playActionCard', seat: 0, instanceId: gid }).ok).toBe(false);
  });
});

describe("Researcher's Private Room (loc-031)", () => {
  it('turn start offers +1 Buy or +1 Explore', () => {
    const s = startTurn(putLocation(game(), 'loc-031', { 0: 1 }));
    const p = byKind(s, 'researchersBuyOrExplore')[0]!;
    expect(p.options).toEqual(['+1 Buy', '+1 Explore']);
    const buys = s.seats[0]!.buysLeft;
    const buy = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(buy.seats[0]?.buysLeft).toBe(buys + 1);
    const exp = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    expect(exp.seats[0]?.exploresLeft).toBe(s.seats[0]!.exploresLeft + 1);
  });

  it('On Reveal: every OTHER player gains an Infection', () => {
    const s = { ...game(), infectionDeck: ['inf#a', 'inf#b'] };
    const out = revealOnly(s, 'loc-031');
    expect(out.seats[0]?.infectionCards ?? []).toEqual([]);
    expect(out.seats[1]?.infectionCards ?? []).toEqual(['inf#a']);
  });
});

describe('Shed (loc-032)', () => {
  function shedGame(xp: number): GameState {
    const a1 = `am-001#s1-${++counter}`;
    const a2 = `am-001#s2-${++counter}`;
    let s = putLocation(game({ xp }), 'loc-032', { 0: 1 });
    s = reg(s, a1, 'am-001', 'hand', 0);
    s = reg(s, a2, 'am-001', 'hand', 0);
    const filler = `fill#inv-${++counter}`;
    s = reg(s, filler, 'ac-001', 'inventory', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [a1, a2], inventory: [filler], discard: [] } : p)) };
    return startTurn(s);
  }

  it('discards picked ammo and draws that many; no repeat without XP', () => {
    const s = shedGame(0);
    const p = byKind(s, 'shedAmmoChoose')[0]!;
    const ammo = p.options.filter(o => o !== 'Done');
    expect(ammo.length).toBe(2);
    const picked = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    const p2 = byKind(picked, 'shedAmmoChoose')[0]!;
    const out = applyAction(picked, { type: 'chooseOption', seat: 0, promptId: p2.id, option: p2.options.indexOf('Done') });
    expect(out.seats[0]?.hand.filter(id => out.cards[id]?.cardId === 'am-001')).toHaveLength(1);
    expect(out.seats[0]?.discard.some(id => out.cards[id]?.cardId === 'am-001')).toBe(true);
    expect(byKind(out, 'shedRepeatOffer')).toEqual([]); // xp 0
  });

  it('offers a one-time 1-XP repeat when XP is available', () => {
    const s = shedGame(1);
    const p = byKind(s, 'shedAmmoChoose')[0]!;
    const picked = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    const p2 = byKind(picked, 'shedAmmoChoose')[0]!;
    const out = applyAction(picked, { type: 'chooseOption', seat: 0, promptId: p2.id, option: p2.options.indexOf('Done') });
    const rep = byKind(out, 'shedRepeatOffer')[0]!;
    expect(rep.options).toEqual(['Repeat (1 XP)', 'Decline']);
    const repeated = applyAction(out, { type: 'chooseOption', seat: 0, promptId: rep.id, option: 0 });
    expect(repeated.seats[0]?.xp).toBe(0);
    expect(byKind(repeated, 'shedAmmoChoose')[0]?.payload?.repeated).toBe('1');
  });
});

describe('Small Dining Room (loc-033)', () => {
  it('turn start may discard a card for 1 XP', () => {
    const card = `dine#h-${++counter}`;
    let s = putLocation(game({ xp: 0 }), 'loc-033', { 0: 1 });
    s = { ...reg(s, card, 'ac-001', 'hand', 0), seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [card] } : p)) };
    const started = startTurn(s);
    const p = byKind(started, 'diningDiscardForXp')[0]!;
    const out = applyAction(started, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(out.seats[0]?.xp).toBe(1);
    expect(out.seats[0]?.hand).not.toContain(card);
    expect(out.seats[0]?.discard).toContain(card);
    const declined = applyAction(started, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('Decline') });
    expect(declined.seats[0]?.xp).toBe(0);
  });

  it('On Reveal: every OTHER player loses 2 XP (floor 0)', () => {
    const s = game({ xp: 9 });
    const withB = { ...s, seats: s.seats.map((p, i) => (i === 1 ? { ...p, xp: 5 } : p)) };
    const out = revealOnly(withB, 'loc-033');
    expect(out.seats[1]?.xp).toBe(3);
    expect(out.seats[0]?.xp).toBe(9);
  });
});

describe('Stairway (loc-034)', () => {
  it('offers the 1-XP window after gaining an action card', () => {
    const s = putLocation(game({ turnGold: 100, buysLeft: 1, xp: 1 }), 'loc-034', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' }); // gains ac-001 (action)
    const p = byKind(out, 'stairwayOffer')[0];
    expect(p?.seat).toBe(0);
    expect(p?.options).toEqual(['Spend 1 XP', 'Decline']);
  });

  it('spends 1 XP, reveals the top Location, then free-invests a room', () => {
    const topId = `loc-020#st-${++counter}`;
    let s = putLocation(game({ turnGold: 100, buysLeft: 1, xp: 1 }), 'loc-034', { 0: 1 });
    s = { ...reg(s, topId, 'loc-020', 'supply'), locationDeck: [topId] };
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const p = byKind(out, 'stairwayOffer')[0]!;
    const spent = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(spent.seats[0]?.xp).toBe(0);
    expect(spent.locations?.some(l => l.instanceId === topId)).toBe(true);
    const inv = byKind(spent, 'stairwayInvestChoice')[0]!;
    const idx = inv.options.indexOf(topId);
    expect(idx).toBeGreaterThanOrEqual(0);
    const invested = applyAction(spent, { type: 'chooseOption', seat: 0, promptId: inv.id, option: idx });
    const loc = invested.locations?.find(l => l.instanceId === topId);
    expect(loc?.cubes[0]).toBe(1);
    expect(invested.seats[0]?.buysLeft).toBe(spent.seats[0]!.buysLeft);
  });

  it('no window without XP', () => {
    const s = putLocation(game({ turnGold: 100, buysLeft: 1, xp: 0 }), 'loc-034', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect(byKind(out, 'stairwayOffer')).toEqual([]);
  });
});

describe('Storeroom (loc-030)', () => {
  function weaponPile(s: GameState): GameState {
    const w1 = `weap#w1-${++counter}`;
    const w2 = `weap#w2-${++counter}`;
    let out = reg(s, w1, weaponDef.id, 'supply');
    out = reg(out, w2, weaponDef.id, 'supply');
    return { ...out, marketPiles: { ...out.marketPiles, wpile: { pileId: 'wpile', cards: [w1, w2] } } };
  }

  it('removes a cube and lets you choose a weapon pile new top', () => {
    let s = putLocation(game(), 'loc-030', { 0: 1 });
    s = weaponPile(s);
    expect(validateAction(s, { type: 'storeroomRearrangeStart', seat: 0 }).ok).toBe(true);
    const started = applyAction(s, { type: 'storeroomRearrangeStart', seat: 0 });
    expect(started.locations?.[0]?.cubes[0]).toBe(0);
    const pilePrompt = byKind(started, 'storeroomChoosePile')[0]!;
    const pileIdx = pilePrompt.options.indexOf('wpile');
    const chosePile = applyAction(started, { type: 'chooseOption', seat: 0, promptId: pilePrompt.id, option: pileIdx });
    const topPrompt = byKind(chosePile, 'storeroomChooseTop')[0]!;
    const second = topPrompt.options[1]!;
    const out = applyAction(chosePile, { type: 'chooseOption', seat: 0, promptId: topPrompt.id, option: 1 });
    expect(out.marketPiles['wpile']?.cards[0]).toBe(second);
  });

  it('requires an investment to rearrange', () => {
    const s = weaponPile(putLocation(game(), 'loc-030', { 0: 0 }));
    expect(validateAction(s, { type: 'storeroomRearrangeStart', seat: 0 }).ok).toBe(false);
  });

  it('holds the game open for investor final turns, then ends', () => {
    const endId = `inf#end-${++counter}`;
    let s = putLocation(game(), 'loc-030', { 0: 1, 1: 1 });
    s = { ...reg(s, endId, 'inf-001', 'supply'), endInfectedCardId: 'inf-001', seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: [endId] } : p)) };
    expect(checkWin(s).gameOver).toBe(false);
    const allTaken = { ...s, storeroomFinalTurnsTaken: [0, 1] };
    expect(checkWin(allTaken).gameOver).toBe(true);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(ended.storeroomFinalTurnsTaken ?? []).toContain(0);
    expect(checkWin(ended).gameOver).toBe(false);
  });
});
