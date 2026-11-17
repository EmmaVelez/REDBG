import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { ammoReqForWeapon, seatAbilities } from './abilities';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Custom characters from Manny's scans (batch 2, printed codes not legible ->
 * provisional ids):
 *
 *   ZO-001 Zoey 70 HP, gates 0 / 7
 *     L1: Zoey can't use shotguns.
 *     L2: All pistol and rifle weapons Zoey is using require -10 ammo and do
 *         +10 damage.
 *   BO-001 Bill Overbeck 70 HP, gates 10 / 25
 *     L1: Infected deal an additional 10 damage to Bill when he does not
 *         defeat them.
 *     L2: Bill gets an additional 10 damage during your turn for every unused
 *         action you have available to you.
 */

function game(charId: string, over: Partial<PlayerState> = {}, seatCount = 2): GameState {
  const players = Array.from({ length: seatCount }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? charId : 'ch-003',
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

function hand(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cardId => `${cardId}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0 } };
  }
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) };
}

describe('zo-001 Zoey', () => {
  it('L1: Shotgun weapons are rejected from her explores', () => {
    const s = hand(game('zo-001', { level: 1, turnAmmo: 50 }), ['we-013']);
    const shotty = s.seats[0]!.hand[0]!;
    expect(() => applyAction(s, { type: 'explore', seat: 0, weapons: [shotty], exploreCount: 1 })).toThrow(
      /Zoey cannot use/,
    );
  });

  it('L2: pistols/rifles deal +10 and require 10 less Ammo', () => {
    const s = hand(game('zo-001', { level: 2, turnAmmo: 50 }), ['we-009']);
    const pistol = s.seats[0]!.hand[0]!;
    // Handgun base 10 + 10 = 20.
    expect(exploreDamage(s, 0, [pistol])).toBe(20);
    // Handgun requires 20 Ammo -> 10 for Zoey at L2.
    const def = s.cardDefs['we-009'];
    expect(def).toBeDefined();
    const req = ammoReqForWeapon(seatAbilities(s, 0), def, []);
    expect(req).toBe(10);
  });
});

describe('bo-001 Bill Overbeck', () => {
  it('L2: +10 damage per unused Action in the preview', () => {
    const s = hand(game('bo-001', { level: 2, actionsLeft: 3, turnAmmo: 50 }), ['we-004']);
    const knife = s.seats[0]!.hand[0]!;
    expect(exploreDamage(s, 0, [knife])).toBe(5 + 30); // Combat Knife 5 + 3 unused * 10
  });

  it('L1: a non-defeating explore records +10 damage taken', () => {
    const s = hand(game('bo-001', { level: 1, turnAmmo: 50 }), ['we-004']);
    const knife = s.seats[0]!.hand[0]!;
    const st = startTurn(s);
    // ma-011 Dr. Salvador: 40 HP / 35 attack — the Knife (5) does not defeat it.
    const cur = {
      ...st,
      mansionDeck: ['ma-011#m1'],
      cards: {
        ...st.cards,
        ['ma-011#m1']: { instanceId: 'ma-011#m1', cardId: 'ma-011', location: { zone: 'mansionDeck' as const, index: 0 } },
      },
    };
    const out = applyAction(cur, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    // 35 attack + 10 penalty = 45 taken; Bill started at 70 HP.
    expect(out.seats[0]?.hp).toBe(25);
  });
});