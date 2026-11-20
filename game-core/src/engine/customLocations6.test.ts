import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Fan Locations batch 6 (Manny, 2026-11-19): loc-024 Parlor, loc-025 Passage
 * to the Shed, loc-026 Pillar Corridor, loc-027 Reading Room, loc-028 Mural
 * Corridor. RULINGS: Parlor gains a RANDOM skill from the full Mercenaries
 * catalogue; Pillar triggers on ANY shuffle (inventory reshuffle AND Mansion);
 * Mural's hand->Inventory stow is chosen in pick order.
 */

let counter = 0;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-002' }, { name: 'B', controller: 'human', characterCardId: 'ch-001' }], locationsMode: true },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

/** Place a revealed location with cubes directly (bypasses the gold cost). */
function putLocation(s: GameState, cardId: string, cubes: Record<number, number>): GameState {
  const id = `${cardId}#b6-${++counter}`;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } },
    locations: [{ instanceId: id, cubes, revealedBy: 0 }],
  };
}

function reg(s: GameState, id: string, cardId: string, zone: 'hand' | 'discard' | 'inventory' | 'mansionDeck' | 'supply', seat?: number): GameState {
  return { ...s, cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, ...(seat !== undefined ? { seat } : {}) } } } };
}

function stackTop(s: GameState, cardId: string): GameState {
  const id = `${cardId}#top-${++counter}`;
  return { ...reg(s, id, cardId, 'mansionDeck'), mansionDeck: [id, ...s.mansionDeck] };
}

/** Reveal a location through the location deck and ack any reveal prompt. */
function revealOnly(s: GameState, cardId: string): GameState {
  const id = `${cardId}#rev-${++counter}`;
  let out: GameState = {
    ...reg(s, id, cardId, 'supply'),
    locationDeck: [id],
    locations: [],
  };
  out = applyAction(out, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  for (let i = 0; i < 6 && out.prompts.length > 0; i++) {
    const p = out.prompts[0]!;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

const byKind = (s: GameState, kind: string) => s.prompts.filter(p => p.payload?.kind === kind);

describe('Locations batch 6 — data', () => {
  it('defines the five new rooms', () => {
    const expectDef = (id: string, name: string, costs: readonly number[]) => {
      const d = CUSTOM_CARDS.find(c => c.id === id);
      expect(d).toEqual(expect.objectContaining({ id, name, type: 'location', locationKind: 'invest', locationCosts: costs }));
    };
    expectDef('loc-024', 'Parlor', [30]);
    expectDef('loc-025', 'Passage to the Shed', [30]);
    expectDef('loc-026', 'Pillar Corridor', [30]);
    expectDef('loc-027', 'Reading Room', [50]);
    expectDef('loc-028', 'Mural Corridor', [30, 70, 100]);
  });

  it('ships card art for all five (normalized 320x436, titles verified locally)', () => {
    for (const id of ['loc-024', 'loc-025', 'loc-026', 'loc-027', 'loc-028']) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });
});

describe('Mural Corridor (loc-028)', () => {
  function muralStart(cubes: number): GameState {
    const s0 = setup(
      { seed: 11, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-002' }, { name: 'B', controller: 'human', characterCardId: 'ch-001' }], locationsMode: true },
      [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK,
    );
    return startTurn(putLocation(s0, 'loc-028', { 0: cubes }));
  }

  it('draws +1 per cube at turn start and asks for the stow', () => {
    const started = muralStart(2);
    expect(started.seats[0]?.hand.length).toBe(7); // 5 + 2
    const p = byKind(started, 'muralStowChoose')[0];
    expect(p?.seat).toBe(0);
    expect(p?.payload?.needed).toBe('2');
    expect(p?.options.length).toBe(7);
  });

  it('stows the picked cards on top of the Inventory in pick order', () => {
    const started = muralStart(2);
    const p1 = byKind(started, 'muralStowChoose')[0]!;
    const first = p1.options[0]!;
    const mid = applyAction(started, { type: 'chooseOption', seat: 0, promptId: p1.id, option: 0 });
    const p2 = byKind(mid, 'muralStowChoose')[0]!;
    expect(p2.payload?.picked).toBe(first);
    const second = p2.options[1]!;
    const out = applyAction(mid, { type: 'chooseOption', seat: 0, promptId: p2.id, option: 1 });
    expect(byKind(out, 'muralStowChoose')).toEqual([]);
    expect(out.seats[0]?.inventory.slice(0, 2)).toEqual([first, second]);
    expect(out.seats[0]?.hand.length).toBe(5);
    expect(out.seats[0]?.hand).not.toContain(first);
    expect(out.seats[0]?.hand).not.toContain(second);
  });

  it('no cubes -> no bonus draw, no prompt', () => {
    const started = muralStart(0);
    expect(started.seats[0]?.hand.length).toBe(5);
    expect(byKind(started, 'muralStowChoose')).toEqual([]);
  });
});

describe('Reading Room (loc-027)', () => {
  it('forfeits a buy and privately reveals the top Mansion card', () => {
    const s = putLocation(game({ buysLeft: 2 }), 'loc-027', { 0: 1 });
    const top = s.mansionDeck[0]!;
    const out = applyAction(s, { type: 'readingRoomPeek', seat: 0 });
    expect(out.seats[0]?.buysLeft).toBe(1);
    const entry = out.log[out.log.length - 1]!;
    expect(entry.action.type).toBe('readingRoomPeek');
    expect((entry as { reveals?: readonly { instanceId: string }[] }).reveals?.[0]?.instanceId).toBe(top);
    // the card stays in the deck (a peek, not a draw)
    expect(out.mansionDeck[0]).toBe(top);
  });

  it('is illegal without the investment or without buys', () => {
    const noInv = game({ buysLeft: 2 });
    expect(validateAction(noInv, { type: 'readingRoomPeek', seat: 0 }).ok).toBe(false);
    const invested = putLocation(game({ buysLeft: 0 }), 'loc-027', { 0: 1 });
    expect(validateAction(invested, { type: 'readingRoomPeek', seat: 0 }).ok).toBe(false);
  });

  it('On Reveal: every OTHER player gains an Infection', () => {
    const s = { ...game(), infectionDeck: ['inf#a', 'inf#b'] };
    const out = revealOnly(s, 'loc-027');
    expect(out.seats[0]?.infectionCards ?? []).toEqual([]);
    expect(out.seats[1]?.infectionCards ?? []).toEqual(['inf#a']);
    expect(out.infectionDeck).toEqual(['inf#b']);
  });
});

describe('Passage to the Shed (loc-025)', () => {
  function shedGame(): GameState {
    // locationDeck empty: the explore must reach the MANSION (a non-empty
    // location deck intercepts every explore in locationsMode).
    let s = putLocation({ ...game({ xp: 2 }), locationDeck: [] }, 'loc-025', { 0: 1 });
    s = reg(s, 'am-001#d1', 'am-001', 'discard', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, discard: ['am-001#d1'] } : p)) };
    s = reg(s, 'we-001#g1', 'we-001', 'hand', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ['we-001#g1'] } : p)) };
    return stackTop(s, 'ma-001');
  }

  it('offers the XP-trash window when a card is trashed (grenade after use)', () => {
    const out = applyAction(shedGame(), { type: 'explore', seat: 0, weapons: ['we-001#g1'], exploreCount: 1 });
    expect(out.removed).toContain('we-001#g1');
    const p = byKind(out, 'passageShedTrash')[0];
    expect(p?.seat).toBe(0);
    expect(p?.options).toContain('am-001#d1');
    expect(p?.options).toContain('Decline');
  });

  it('spends 1 XP and trashes the chosen card; Decline keeps it', () => {
    const out = applyAction(shedGame(), { type: 'explore', seat: 0, weapons: ['we-001#g1'], exploreCount: 1 });
    // The single explore itself grants +1 XP (2 -> 3) before the window opens.
    expect(out.seats[0]?.xp).toBe(3);
    const p = byKind(out, 'passageShedTrash')[0]!;
    const idx = p.options.indexOf('am-001#d1');
    const trashed = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: idx });
    expect(trashed.seats[0]?.xp).toBe(2); // 3 - 1
    expect(trashed.removed).toContain('am-001#d1');
    expect(trashed.seats[0]?.discard).not.toContain('am-001#d1');
    const declined = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.length - 1 });
    expect(declined.seats[0]?.xp).toBe(3);
    expect(declined.removed).not.toContain('am-001#d1');
  });

  it('On Reveal: the revealing player gains an Infection', () => {
    const s = { ...game(), infectionDeck: ['inf#a'] };
    const out = revealOnly(s, 'loc-025');
    expect(out.seats[0]?.infectionCards ?? []).toEqual(['inf#a']);
    expect(out.seats[1]?.infectionCards ?? []).toEqual([]);
  });
});

describe('Pillar Corridor (loc-026)', () => {
  it('offers a pick-to-top when the Inventory reshuffles while drawing', () => {
    let s = putLocation(game(), 'loc-026', { 0: 1 });
    // Seat 0: tiny inventory + a discard, so the next turn-start draw reshuffles.
    s = reg(s, 'x#i1', 'am-001', 'inventory', 0);
    for (const [i, cid] of ['am-001', 'am-002', 'ac-001'].entries()) {
      s = reg(s, `x#d${i}`, cid, 'discard', 0);
    }
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: ['x#i1'], discard: ['x#d0', 'x#d1', 'x#d2'] } : p)) };
    // Round trip: seat 1 plays a turn, then seat 0's turn start reshuffles.
    s = applyAction(s, { type: 'endTurn', seat: 0 });
    s = applyAction(s, { type: 'endTurn', seat: 1 });
    const p = byKind(s, 'pillarShuffleTop').find(x => x.seat === 0 && x.payload?.deck === 'inventory');
    expect(p).toBeDefined();
    const chosen = p!.options[0]!;
    const out = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p!.id, option: 0 });
    expect(out.seats[0]?.inventory[0]).toBe(chosen);
    expect(out.seats[0]?.inventory.filter(id => id === chosen).length).toBe(1);
  });

  it('offers a pick-to-top when the Mansion is shuffled (ooze shuffle-back)', () => {
    // MA-000 ooze defeated with <=80 damage shuffles the WHOLE Mansion — a
    // real single-action shuffle (send-to-bottom is NOT a shuffle).
    let s = putLocation({ ...game(), locationDeck: [] }, 'loc-026', { 0: 1 });
    s = reg(s, 'we-002#w1', 'we-002', 'hand', 0);
    s = reg(s, 'we-002#w2', 'we-002', 'hand', 0);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ['we-002#w1', 'we-002#w2'] } : p)) };
    s = stackTop(s, 'ma-000'); // 30 HP; two Longbows deal 50 (<= 80)
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-002#w1', 'we-002#w2'], exploreCount: 1 });
    const p = byKind(out, 'pillarShuffleTop').find(x => x.payload?.deck === 'mansion');
    expect(p).toBeDefined();
    const chosen = p!.options[0]!;
    const final = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p!.id, option: 0 });
    expect(final.mansionDeck[0]).toBe(chosen);
    expect(final.mansionDeck.filter(id => id === chosen).length).toBe(1);
  });

  it('On Reveal: the revealing player gains an Infection', () => {
    const s = { ...game(), infectionDeck: ['inf#a'] };
    const out = revealOnly(s, 'loc-026');
    expect(out.seats[0]?.infectionCards ?? []).toEqual(['inf#a']);
  });
});

describe('Parlor (loc-024)', () => {
  it('offers the skill window after a buy that gained a card', () => {
    const s = putLocation(game({ turnGold: 100, buysLeft: 1 }), 'loc-024', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const p = byKind(out, 'parlorSkillOffer')[0];
    expect(p?.seat).toBe(0);
    expect(p?.options).toEqual(['Pay', 'Decline']);
    expect(out.seats[0]?.turnGold).toBe(70); // 100 - 30 buy
  });

  it('Pay spends 40 gold and gains a random catalogue skill', () => {
    const s = putLocation(game({ turnGold: 100, buysLeft: 1 }), 'loc-024', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const p = byKind(out, 'parlorSkillOffer')[0]!;
    const paid = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(paid.seats[0]?.turnGold).toBe(30); // 70 - 40
    expect(paid.seats[0]?.skills?.length).toBe(1);
    const skillId = paid.seats[0]!.skills![0]!;
    const inst = paid.cards[skillId]!;
    expect(inst.location.zone).toBe('skillArea');
    expect(paid.cardDefs[inst.cardId]?.type).toBe('skill');
    // Decline gains nothing
    const declined = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    expect(declined.seats[0]?.skills ?? []).toEqual([]);
    expect(declined.seats[0]?.turnGold).toBe(70);
  });

  it('no offer when the remaining gold is under 40', () => {
    const s = putLocation(game({ turnGold: 50, buysLeft: 1 }), 'loc-024', { 0: 1 });
    const out = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect(byKind(out, 'parlorSkillOffer')).toEqual([]);
  });
});
