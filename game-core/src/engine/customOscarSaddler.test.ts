import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import {
  ALL_CARDS,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  STANDARD_MANSION_DECK,
  cardsForScenario,
} from '../data/cards';

/**
 * CI-001 "Oscar - Zombie Elephant" and CI-003 "Osmund Saddler (First
 * Encounter)" — the second fan-card pair. Oscar tramples the exploring
 * Character when he survives, trashing the highest-Damage Weapon(s) they are
 * using. Saddler hands every player a 10x Ammo on reveal and shuffles the
 * official "Osmund Saddler" (MA-054) into the Mansion when he is defeated.
 */

const OSCAR = CUSTOM_CARDS.find(c => c.id === 'ci-001');
const SADDLER = CUSTOM_CARDS.find(c => c.id === 'ci-003');

function gameWith(cards: ReadonlyArray<CardDef>, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    cards,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function game(over: Partial<PlayerState> = {}): GameState {
  return gameWith([...PREMIER_CARDS, ...CUSTOM_CARDS], over);
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

/** The instance ids of every copy of `cardId` currently in the Mansion. */
function mansionCopies(s: GameState, cardId: string): readonly string[] {
  return [...s.mansionDeck].filter(id => s.cards[id]?.cardId === cardId);
}

describe('CI-001 / CI-003 data', () => {
  it('matches the printed cards', () => {
    expect(OSCAR).toEqual(expect.objectContaining({
      id: 'ci-001',
      name: 'Oscar - Zombie Elephant',
      type: 'infected',
      set: 'custom',
      copies: 1,
      hp: 120,
      attack: 10,
      decorations: 7,
      infectedEffects: [{ kind: 'onNotDefeatedTrashHighestDamageUsedWeapons' }],
    }));
    expect(SADDLER).toEqual(expect.objectContaining({
      id: 'ci-003',
      name: 'Osmund Saddler (First Encounter)',
      type: 'infected',
      set: 'custom',
      copies: 1,
      hp: 60,
      attack: 50,
      decorations: 5,
      infectedEffects: [
        { kind: 'onRevealEachPlayerGainsAmmoX10', count: 1 },
        { kind: 'onDefeatShuffleCardIntoMansion', cardId: 'ma-054' },
      ],
    }));
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === 'ci-001')).toBe(false);
    expect(ALL_CARDS.some(c => c.id === 'ci-003')).toBe(false);
  });

  it('enabling CI-003 pulls the official Osmund Saddler (MA-054) in as a dependency', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['ci-003'] });
    expect(on.some(c => c.id === 'ci-003')).toBe(true);
    expect(on.some(c => c.id === 'ma-054')).toBe(true);
    const off = cardsForScenario('firstTimer', { customCards: ['mx-001'] });
    expect(off.some(c => c.id === 'ma-054')).toBe(false);
  });
});

describe('CI-003 Osmund Saddler (First Encounter)', () => {
  it('gives every player a 10x Ammo when revealed', () => {
    // Leon (ch-002) has 80 max Health. we-006 deals 50 < 60 Health, so the
    // First Encounter survives and hits back for its 50 Damage.
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 80 }), ['ci-003']);
    const { state: armed, id } = addWeapon(state, 0, 'we-006');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    for (const seat of next.seats) {
      const ammo = (seat?.discard ?? []).filter(cid => next.cards[cid]?.cardId === 'am-001');
      expect(ammo.length).toBe(1);
    }
    expect(next.seats[0]?.hp).toBe(30); // 80 - 50
  });

  it('shuffles the official Osmund Saddler into the Mansion when defeated', () => {
    const pool = cardsForScenario('firstTimer', { customCards: ['ci-003'] });
    const { state, ids } = setMansionTop(gameWith(pool, { level: 1, hp: 80, turnAmmo: 120 }), ['ci-003']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012'); // 70 damage >= 60 Health
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
    // The defeated First Encounter is replaced by the real boss.
    expect(mansionCopies(next, 'ma-054').length).toBe(1);
  });
});

describe('CI-001 Oscar - Zombie Elephant', () => {
  it('trashes the highest-Damage used weapon when he is not defeated', () => {
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 80 }), ['ci-001']);
    const { state: a1, id: w1 } = addWeapon(state, 0, 'we-006'); // 50 damage
    const { state: a2, id: w2 } = addWeapon(a1, 0, 'we-009'); // 10 damage
    const next = applyAction(a2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 1 });
    // 50 + 10 = 60 < 120 Health -> not defeated; the 50-damage weapon is trashed.
    expect(next.seats[0]?.hp).toBe(70); // Oscar deals 10
    expect(next.removed).toContain(w1);
    expect(next.removed).not.toContain(w2);
    expect(next.seats[0]?.playArea).not.toContain(w1);
    expect(next.seats[0]?.playArea).toContain(w2);
  });

  it('trashes every tied highest-Damage weapon', () => {
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 60 }), ['ci-001']);
    const { state: a1, id: w1 } = addWeapon(state, 0, 'we-009');
    const { state: a2, id: w2 } = addWeapon(a1, 0, 'we-009');
    const next = applyAction(a2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 1 });
    expect(next.removed).toContain(w1);
    expect(next.removed).toContain(w2);
  });

  it('trashes nothing when he is defeated', () => {
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 130 }), ['ci-001']);
    const { state: a1, id: w1 } = addWeapon(state, 0, 'we-012'); // 40 + 30 (130 Ammo) = 70
    const { state: a2, id: w2 } = addWeapon(a1, 0, 'we-006'); // 50
    const next = applyAction(a2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 1 });
    // 70 + 50 = 120 >= 120 Health -> defeated; Oscar deals no damage and
    // neither weapon is trashed.
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.attached).toHaveLength(1);
    expect(next.removed).not.toContain(w1);
    expect(next.removed).not.toContain(w2);
  });
});

describe('CI-001 / CI-003 in a multi-explore', () => {
  it('CI-003 gives every player a 10x Ammo inside a batch', () => {
    const { state } = setMansionTop(
      game({ level: 1, hp: 80, turnAmmo: 80, exploresLeft: 2 }),
      ['ci-003', 'ma-002'],
    );
    const { state: armed, id } = addWeapon(state, 0, 'we-006'); // 50 damage
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 2 });
    // Combined 60 + 20 = 80 Health vs 50 damage -> not defeated, but the
    // reveal grant still landed for every player.
    for (const seat of next.seats) {
      const ammo = (seat?.discard ?? []).filter(cid => next.cards[cid]?.cardId === 'am-001');
      expect(ammo.length).toBe(1);
    }
  });

  it('CI-001 tramples inside a batch when he is not defeated', () => {
    const { state } = setMansionTop(
      game({ level: 1, hp: 80, turnAmmo: 80, exploresLeft: 2 }),
      ['ci-001', 'ma-002'],
    );
    const { state: a1, id: w1 } = addWeapon(state, 0, 'we-006'); // 50
    const { state: a2, id: w2 } = addWeapon(a1, 0, 'we-009'); // 10
    const next = applyAction(a2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 2 });
    // Combined 120 + 20 = 140 Health vs 60 damage -> not defeated; the
    // 50-damage weapon is trashed.
    expect(next.removed).toContain(w1);
    expect(next.removed).not.toContain(w2);
  });
});
