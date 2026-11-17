import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { xpTokenPiles } from './locations';

/** Fan Locations batch 7: loc-022 Bar, loc-023 Bedroom. */

const NEW_IDS = ['loc-022', 'loc-023'] as const;

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

function revealFor(s: GameState, cardId: string, seat: number): GameState {
  let out = onlyLocation({ ...s, seats: s.seats.map((p, i) => (i === seat ? { ...p, exploresLeft: 2 } : p)) }, cardId);
  out = applyAction(out, { type: 'explore', seat, weapons: [], exploreCount: 1 });
  for (let g = 0; g < 20 && out.prompts.length > 0; g++) {
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

describe('Locations batch 7 — data', () => {
  it('defines both with the printed kind and cost', () => {
    expect(defOf('loc-022')).toEqual(expect.objectContaining({ id: 'loc-022', name: 'Bar', locationKind: 'onex', locationCost: 20 }));
    expect(defOf('loc-023')).toEqual(expect.objectContaining({ id: 'loc-023', name: 'Bedroom', locationKind: 'onex', locationCost: 40 }));
  });

  it('ships card art for both', () => {
    for (const id of NEW_IDS) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });
});

describe('Bar — XP tokens on supply piles', () => {
  it('the 1X puts a token on a chosen pile', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3, xp: 3 });
    s = revealFor(s, 'loc-022', 0);
    const out = applyAction(s, { type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    const prompt = out.prompts.find(p => p.payload?.kind === 'barTokenChoice');
    expect(prompt).toBeDefined();
    const pileId = prompt!.options[0]!;
    const placed = applyAction(out, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(xpTokenPiles(placed)).toContain(pileId);
  });

  it('buying a token card costs 1 XP (2 to strip the token)', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3, xp: 3 });
    s = revealFor(s, 'loc-022', 0);
    const used = applyAction(s, { type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    const prompt = used.prompts.find(p => p.payload?.kind === 'barTokenChoice')!;
    const pileId = prompt.options[0]!;
    s = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });

    const xpBefore = (s.seats[0] as PlayerState).xp ?? 0;
    const buy = applyAction(s, { type: 'buy', seat: 0, pileId });
    const gate = buy.prompts.find(p => p.payload?.kind === 'buyXpChoice');
    expect(gate).toBeDefined();
    // option 0 = keep the token for 1 XP
    const kept = applyAction(buy, { type: 'chooseOption', seat: 0, promptId: gate!.id, option: 0 });
    expect((kept.seats[0] as PlayerState).xp ?? 0).toBe(xpBefore - 1);
    expect(xpTokenPiles(kept)).toContain(pileId);
    expect((kept.seats[0] as PlayerState).discard.length).toBeGreaterThan(0);
  });

  it('blocks the buy outright with no XP', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3, xp: 0 });
    s = revealFor(s, 'loc-022', 0);
    const used = applyAction(s, { type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    const prompt = used.prompts.find(p => p.payload?.kind === 'barTokenChoice')!;
    s = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(() => applyAction(s, { type: 'buy', seat: 0, pileId: xpTokenPiles(s)[0]! }))
      .toThrow(/XP token/);
  });
});

describe('Bedroom — 2×10 ammo, a card up to 60, and no reveals this turn', () => {
  it('grants the ammo and the chosen card', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    s = revealFor(s, 'loc-023', 0);
    const out = applyAction(s, { type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId });
    const seat = out.seats[0] as PlayerState;
    expect(seat.turnAmmo).toBe(20);
    const prompt = out.prompts.find(p => p.payload?.kind === 'bedroomGainChoice');
    expect(prompt).toBeDefined();
    const chosen = prompt!.options[0]!;
    const after = applyAction(out, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    // The granted card is free: no gold, no Buy spent.
    expect((after.seats[0] as PlayerState).discard).toContain(chosen);
    expect((after.seats[0] as PlayerState).buysLeft).toBe(1);
  });

  it('On Reveal blocks the seat\'s Mansion reveals for the turn, then clears', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3, exploresLeft: 2 });
    s = revealFor(s, 'loc-023', 0);
    expect(s.mansionRevealBlockedSeat).toBe(0);
    let blocked = false;
    try {
      applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    } catch (e) {
      blocked = String(e).includes('Bedroom blocks');
    }
    expect(blocked).toBe(true);
    // A different seat is NOT blocked (the card says "You"). It just
    // cannot explore out of turn, which is the normal rule.
    expect(s.mansionRevealBlockedSeat).toBe(0);
    // It expires at the next turn boundary.
    const next = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));
    expect(next.mansionRevealBlockedSeat).toBeUndefined();
  });
});
