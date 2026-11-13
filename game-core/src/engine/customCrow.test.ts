import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * CI-002 Infected Crow — "When this Infected is Revealed, Reveal the next card
 * of the Mansion. If it's an Infected the Exploring Character(s) is now
 * Battling that as well. Otherwise shuffle that card into the Mansion."
 */

const CROW = CUSTOM_CARDS.find(c => c.id === 'ci-002');

function crowGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addWeapon(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

/** Put the given cards on top of the Mansion, first id first. */
function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck' as const, index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

describe('CI-002 Infected Crow data', () => {
  it('matches the printed card (5 copies per Manny’s ruling)', () => {
    expect(CROW).toEqual(expect.objectContaining({
      id: 'ci-002', name: 'Infected Crow', type: 'infected', set: 'custom',
      copies: 5, hp: 20, attack: 10, decorations: 2,
    }));
    expect(CROW?.infectedEffects).toEqual([{ kind: 'onRevealRevealNextMansionCard' }]);
  });

  it('joins the Mansion only when the room selected it', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'ci-002')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['ci-002'] });
    expect(on.some(c => c.id === 'ci-002')).toBe(true);
  });

  it('adds FIVE copies to the Mansion deck when enabled (Manny ruling)', () => {
    const s = setup(
      {
        seed: 11,
        players: [
          { name: 'P', controller: 'human', characterCardId: 'ch-002' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer', { customCards: ['ci-002'] }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    const crows = [...s.mansionDeck]
      .filter(id => s.cards[id]?.cardId === 'ci-002');
    expect(crows).toHaveLength(5);
  });
});

describe('CI-002 reveal chain', () => {
  it('battles the revealed Infected as well (combined Health and Damage)', () => {
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 70 }), ['ci-002', 'ma-006']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012'); // 40 damage
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    // Combined 20 + 40 = 60 Health > 40 damage -> not defeated.
    // Combined 10 + 30 = 40 Damage lands on the exploring character.
    expect(next.seats[0]?.hp).toBe(40);
    // Neither Infected was defeated, so nothing is attached.
    expect(next.seats[0]?.attached).not.toContain(ids[0]);
  });

  it('shuffles a revealed non-Infected back into the Mansion', () => {
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 70 }), ['ci-002', 'ac-002']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    // The Crow alone (20 Health) is defeated by 40 damage: no damage taken.
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.decorations).toBe(2);
    expect(next.seats[0]?.attached).toContain(ids[0]);
    // The action card went back into the Mansion, not removed or attached.
    const mansion = [...next.mansionDeck];
    expect(mansion).toContain(ids[1]);
    expect(next.removed).not.toContain(ids[1]);
  });

  it('records the full revealed set on the logged action for the client reveal overlay', () => {
    // The chained card cannot be recovered from the deck diff: an undefeated
    // revealed Infected is bottomed, so it looks like any other deck card.
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 70 }), ['ci-002', 'ma-006']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    const logged = next.log[next.log.length - 1]?.action;
    expect(logged).toMatchObject({ type: 'explore', seat: 0, exploreCount: 1 });
    if (logged?.type !== 'explore') throw new Error('expected an explore log entry');
    expect(logged.revealedInstanceIds).toEqual(ids);
  });

  it('records every card of a multi-Crow chain, in reveal order', () => {
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 100, turnAmmo: 70 }), ['ci-002', 'ci-002', 'ma-006']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    const logged = next.log[next.log.length - 1]?.action;
    if (logged?.type !== 'explore') throw new Error('expected an explore log entry');
    expect(logged.revealedInstanceIds).toEqual(ids);
  });

  it('chains through multiple Crows', () => {
    const { state } = setMansionTop(crowGame({ level: 1, hp: 100, turnAmmo: 70 }), ['ci-002', 'ci-002', 'ma-006']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    // 20 + 20 + 40 = 80 Health > 40 damage; 10 + 10 + 30 = 50 Damage.
    expect(next.seats[0]?.hp).toBe(50);
  });

  it('defeats everything when the damage is enough', () => {
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 90 }), ['ci-002', 'ma-002']);
    const { state: armed, id: w1 } = addWeapon(state, 0, 'we-012');
    const { state: armed2, id: w2 } = addWeapon(armed, 0, 'we-009');
    const next = applyAction(armed2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 1 });
    // 40 + 10 = 50 damage vs 20 + 20 = 40 Health -> both defeated.
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.decorations).toBe(2 + 1);
    expect(next.seats[0]?.attached).toEqual(expect.arrayContaining(ids));
  });

  it('does nothing when the Mansion is exhausted behind the Crow', () => {
    const { state, ids } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 70 }), ['ci-002']);
    // Drain the rest of the Mansion so the Crow has nothing to reveal.
    const drained = { ...state, mansionDeck: ids };
    const { state: armed, id } = addWeapon(drained, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.decorations).toBe(2);
  });

  it('works inside a multi-explore', () => {
    const { state } = setMansionTop(crowGame({ level: 1, hp: 80, turnAmmo: 70 }), ['ci-002', 'ma-006']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(40);
  });
});
