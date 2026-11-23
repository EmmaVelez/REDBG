import { describe, it, expect } from 'vitest';
import type { GameState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { CUSTOM_CARDS } from '../data/custom';

/**
 * CW-036 Lever Action Rifle: "This weapon gets +5 Damage for every Action you
 * played this turn." (`plusDamagePerActionPlayedThisTurn`, amount 5).
 *
 * ma-011 Dr. Salvador (40 HP / 35 attack) is the discriminator: base 20 damage
 * does NOT defeat it; 20 + 5 Actions x 5 = 45 does. Locks BOTH the picker
 * preview (`exploreDamage`) and the resolved explore.
 */
function build(actionsInPlay: number): GameState {
  const players = [
    { name: 'A', controller: 'human' as const, characterCardId: 'ch-002' },
    { name: 'B', controller: 'human' as const, characterCardId: 'ch-003' },
  ];
  const s = setup({ seed: 7, players }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
  const t = startTurn(s);
  const weId = 'cw-036#w1';
  const bossId = 'ma-011#b1';
  const cards: Record<string, GameState['cards'][string]> = {
    ...t.cards,
    [weId]: { instanceId: weId, cardId: 'cw-036', location: { zone: 'hand' as const, index: 0 } },
    [bossId]: { instanceId: bossId, cardId: 'ma-011', location: { zone: 'mansionDeck' as const, index: 0 } },
  };
  const playArea = Array.from({ length: actionsInPlay }, (_, i) => `ac-001#pa${i}`);
  for (const pa of playArea) {
    cards[pa] = { instanceId: pa, cardId: 'ac-001', location: { zone: 'playArea' as const, index: 0 } };
  }
  const seats = t.seats.map((st, i) => i === 0
    ? { ...st, hand: [...st.hand, weId], playArea: [...st.playArea, ...playArea], turnAmmo: 40 }
    : st);
  const mansionDeck = [bossId, ...t.mansionDeck.filter(id => id !== bossId)];
  return { ...t, cards, seats, mansionDeck };
}

describe('CW-036 Lever Action Rifle (+5 per Action played this turn)', () => {
  it('preview and resolve both count the Action cards in the play area', () => {
    const noActions = build(0);
    expect(exploreDamage(noActions, 0, ['cw-036#w1'])).toBe(20);
    const rNo = applyAction(noActions, { type: 'explore', seat: 0, weapons: ['cw-036#w1'], exploreCount: 1, leader: 'main' });
    expect(rNo.seats[0]?.attached.includes('ma-011#b1')).toBe(false);

    const fiveActions = build(5);
    expect(exploreDamage(fiveActions, 0, ['cw-036#w1'])).toBe(45);
    const rYes = applyAction(fiveActions, { type: 'explore', seat: 0, weapons: ['cw-036#w1'], exploreCount: 1, leader: 'main' });
    expect(rYes.seats[0]?.attached.includes('ma-011#b1')).toBe(true);
  });

  it('is a buyable 40-cost / 40-ammo rifle that merges into the scenario gun pile', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cw-036');
    expect(c).toEqual(expect.objectContaining({
      id: 'cw-036',
      name: 'Lever Action Rifle',
      type: 'weapon',
      set: 'custom',
      copies: 1,
      cost: 40,
      ammoReq: 40,
      damage: 20,
      weaponTags: ['gun', 'rifle'],
      weaponEffects: [{ kind: 'plusDamagePerActionPlayedThisTurn', amount: 5 }],
    }));
  });
});