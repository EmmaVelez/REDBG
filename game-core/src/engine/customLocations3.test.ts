import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { locationBuyCostReduction, hasFreeActionPlay } from './locations';

/** Fan Locations batch 3: loc-014 Terrace, loc-015 Tiger Statue Room. */

const NEW_IDS = ['loc-014', 'loc-015'] as const;

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

/** Reveal, then invest seat 0. */
function invest(s: GameState, cardId: string, gold = 200): GameState {
  // 3 Buys: one for the cube, the rest for the buy under test.
  let out = revealAndAck({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: gold, buysLeft: 3 } : p)) }, cardId);
  out = applyAction(out, { type: 'investLocation', seat: 0, instanceId: (out.locations ?? [])[0]!.instanceId });
  return out;
}

function defOf(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

describe('Locations batch 3 — data', () => {
  it('defines both with the printed kind and cost', () => {
    expect(defOf('loc-014')).toEqual(expect.objectContaining({ id: 'loc-014', name: 'Terrace', locationKind: 'invest', locationCosts: [80] }));
    expect(defOf('loc-015')).toEqual(expect.objectContaining({ id: 'loc-015', name: 'Tiger Statue Room', locationKind: 'invest', locationCosts: [70] }));
  });

  it('ships card art for both', () => {
    for (const id of NEW_IDS) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });

  it('keeps the ids unique', () => {
    for (const id of NEW_IDS) expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
  });
});

describe('Tiger Statue Room — buy discount', () => {
  it('knocks 10 gold off every buy on the investor\'s turn', () => {
    let s = game({ level: 1 });
    s = invest(s, 'loc-015');
    expect(locationBuyCostReduction(s, 0)).toBe(10);
    // Foyer pile: ac-001 costs 30 -> 20 after the discount.
    const pile = s.marketPiles['foyer'];
    expect(pile).toBeDefined();
    const before = (s.seats[0] as PlayerState).turnGold;
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect((after.seats[0] as PlayerState).turnGold).toBe(before - 20);
  });

  it('gives no discount before investing', () => {
    const s = game({ level: 1 });
    expect(locationBuyCostReduction(s, 0)).toBe(0);
  });

  it('On Reveal lets every player discard a card for 1 XP', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    // Assert the offers are RAISED, then resolve each with a real card.
    const revealed = applyAction(onlyLocation(s, 'loc-015'), { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    const prompts = revealed.prompts.filter(p => p.payload?.kind === 'locDiscardForXpChoice');
    expect(prompts.length).toBe(2);
    let out0 = revealed;
    for (const p of prompts) {
      const xpBefore = (out0.seats[p.seat] as PlayerState).xp ?? 0;
      out0 = applyAction(out0, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
      expect((out0.seats[p.seat] as PlayerState).xp ?? 0).toBe(xpBefore + 1);
    }
  });
});

describe('Terrace — free play + item reveal', () => {
  it('asks before playing the first action card bought, then plays it for free', () => {
    let s = game({ level: 1 });
    s = invest(s, 'loc-014');
    expect(hasFreeActionPlay(s, 0)).toBe(true);
    const handBefore = (s.seats[0] as PlayerState).hand.length;
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const seat = after.seats[0] as PlayerState;
    const p = after.prompts.find(x => x.payload?.kind === 'loc014Choose');
    expect(p).toBeDefined();
    // The turn is HELD: nothing played yet, the bought card is in hand.
    expect(seat.playArea).toEqual([]);
    expect(seat.freeActionPlayAvailable).toBe(false);

    const played = applyAction(after, { type: 'chooseOption', seat: 0, promptId: p!.id, option: 0 });
    const pseat = played.seats[0] as PlayerState;
    // ac-001 was played: it is in the play area, an Action was spent, and the
    // free play is consumed.
    expect(pseat.playArea.length).toBeGreaterThan(0);
    expect(pseat.actionsLeft).toBe(0);
    expect(pseat.freeActionPlayAvailable).toBe(false);
    // ...and its +2 Cards bonus fired.
    expect(pseat.hand.length).toBe(handBefore + 2);
  });

  it('declining leaves the action card in the discard', () => {
    let s = game({ level: 1 });
    s = invest(s, 'loc-014');
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const p = after.prompts.find(x => x.payload?.kind === 'loc014Choose')!;
    const instanceId = String(p.payload?.instanceId);
    const declined = applyAction(after, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    const seat = declined.seats[0] as PlayerState;
    expect(seat.playArea).toEqual([]);
    expect(seat.hand).not.toContain(instanceId);
    expect(seat.discard).toContain(instanceId);
  });

  it('does not free-play when no Action is available', () => {
    let s = game({ level: 1, actionsLeft: 0 });
    s = invest(s, 'loc-014', 200);
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    const seat = after.seats[0] as PlayerState;
    expect(seat.playArea).toEqual([]);
    expect(seat.freeActionPlayAvailable).toBeUndefined();
    expect(after.prompts.some(x => x.payload?.kind === 'loc014Choose')).toBe(false);
  });

  it('refreshes the free play on the next turn', () => {
    let s = game({ level: 1 });
    s = invest(s, 'loc-014');
    expect(hasFreeActionPlay(s, 0)).toBe(true);
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: 'foyer' });
    expect(hasFreeActionPlay(after, 0)).toBe(false);
    const p = after.prompts.find(x => x.payload?.kind === 'loc014Choose')!;
    s = applyAction(after, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    const next = startTurn(ended);
    expect(hasFreeActionPlay(next, 0)).toBe(true);
  });

  it('On Reveal lets each player take an item from the Resource Area', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    // Capture the offers at the reveal (revealAndAck would resolve them).
    const revealed = applyAction(onlyLocation(s, 'loc-014'), { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    const prompts = revealed.prompts.filter(p => p.payload?.kind === 'locGainItemChoice');
    expect(prompts.length).toBe(2);
    // Each offer lists a real item instance first (then 'Decline').
    const p = prompts[0]!;
    const itemId = p.options[0]!;
    expect(revealed.cardDefs[revealed.cards[itemId]?.cardId ?? '']?.type).toBe('item');
    const out = applyAction(revealed, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
    const seat = out.seats[p.seat] as PlayerState;
    expect(seat.discard).toContain(itemId);
  });
});
