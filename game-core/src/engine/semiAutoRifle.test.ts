import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * WE-016 Semi-Automatic Rifle: "+10 damage for every Action card played this
 * turn" (plusDamagePerActionPlayedThisTurn). The resolved explore has always
 * applied it; the picker PREVIEW (exploreDamage) used to omit it, so the UI
 * showed no bonus — this test locks both the preview and the resolve.
 *
 * ma-011 Dr. Salvador (40 HP / 35 attack) is the discriminator: base rifle
 * damage 30 does NOT defeat it; 30 + 2 actions' +20 does.
 */
function build(actionsInPlay: number): GameState {
  const players = [
    { name: 'A', controller: 'human' as const, characterCardId: 'ch-002' },
    { name: 'B', controller: 'human' as const, characterCardId: 'ch-003' },
  ];
  const s = setup({ seed: 7, players }, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
  const t = startTurn(s);
  const weId = 'we-016#w1';
  const bossId = 'ma-011#b1';
  const cards: Record<string, GameState['cards'][string]> = {
    ...t.cards,
    [weId]: { instanceId: weId, cardId: 'we-016', location: { zone: 'hand' as const, index: 0 } },
    [bossId]: { instanceId: bossId, cardId: 'ma-011', location: { zone: 'mansionDeck' as const, index: 0 } },
  };
  const playArea = Array.from({ length: actionsInPlay }, (_, i) => `ac-001#pa${i}`);
  for (const pa of playArea) {
    cards[pa] = { instanceId: pa, cardId: 'ac-001', location: { zone: 'playArea' as const, index: 0 } };
  }
  const seats = t.seats.map((st, i) => i === 0
    ? { ...st, hand: [...st.hand, weId], playArea: [...st.playArea, ...playArea], turnAmmo: 70 }
    : st);
  const mansionDeck = [bossId, ...t.mansionDeck.filter(id => id !== bossId)];
  return { ...t, cards, seats, mansionDeck };
}

describe('WE-016 Semi-Automatic Rifle (+10 per Action played this turn)', () => {
  it('preview and resolve both count the Action cards in the play area', () => {
    const noActions = build(0);
    expect(exploreDamage(noActions, 0, ['we-016#w1'])).toBe(30);
    const rNo = applyAction(noActions, { type: 'explore', seat: 0, weapons: ['we-016#w1'], exploreCount: 1, leader: 'main' });
    expect(rNo.seats[0]?.attached.includes('ma-011#b1')).toBe(false);

    const twoActions = build(2);
    expect(exploreDamage(twoActions, 0, ['we-016#w1'])).toBe(50);
    const rYes = applyAction(twoActions, { type: 'explore', seat: 0, weapons: ['we-016#w1'], exploreCount: 1, leader: 'main' });
    expect(rYes.seats[0]?.attached.includes('ma-011#b1')).toBe(true);
  });
});
