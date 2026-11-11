import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
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
 * CI-009 "Rachael Foley (First Encounter)" / MA-000 "Rachael Foley (ooze)" —
 * the fan-card pair. CI-009 takes 10 less damage per "Ammo x10" in the
 * exploring player's discard pile and shuffles a fresh Ooze into the Mansion
 * when it is defeated; the Ooze is shuffled straight back whenever it is
 * defeated with 80 or less damage.
 */

const CI = CUSTOM_CARDS.find(c => c.id === 'ci-009');
const OOZE = CUSTOM_CARDS.find(c => c.id === 'ma-000');

function rachaelGame(over: Partial<PlayerState> = {}): GameState {
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

function addDiscard(s: GameState, seat: number, cardId: string, count = 1): GameState {
  let state = s;
  for (let i = 0; i < count; i++) {
    const id = `${cardId}#d${++counter}`;
    state = {
      ...state,
      cards: { ...state.cards, [id]: { instanceId: id, cardId, location: { zone: 'discard' as const, index: 0, seat } } },
      seats: state.seats.map((p, j) => (j === seat ? { ...p, discard: [...p.discard, id] } : p)),
    };
  }
  return state;
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

describe('CI-009 / MA-000 data', () => {
  it('matches the printed cards', () => {
    expect(CI).toEqual(expect.objectContaining({
      id: 'ci-009',
      name: 'Rachael Foley (First Encounter)',
      type: 'infected',
      set: 'custom',
      copies: 1,
      hp: 60,
      attack: 50,
      decorations: 5,
      infectedEffects: [
        { kind: 'onRevealDamageReductionPerAmmoX10InDiscard', amount: 10 },
        { kind: 'onDefeatShuffleCardIntoMansion', cardId: 'ma-000' },
      ],
    }));
    expect(OOZE).toEqual(expect.objectContaining({
      id: 'ma-000',
      name: 'Rachael Foley (ooze)',
      type: 'infected',
      set: 'custom',
      copies: 1,
      hp: 30,
      attack: 50,
      decorations: 5,
      infectedEffects: [{ kind: 'onDefeatShuffleBackIfDamageAtMost', maxDamage: 80 }],
    }));
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === 'ci-009')).toBe(false);
    expect(ALL_CARDS.some(c => c.id === 'ma-000')).toBe(false);
  });

  it('enabling CI-009 pulls the Ooze in as a dependency', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['ci-009'] });
    expect(on.some(c => c.id === 'ci-009')).toBe(true);
    expect(on.some(c => c.id === 'ma-000')).toBe(true);
    // ...and keeps it out when nothing references it.
    const off = cardsForScenario('firstTimer', { customCards: ['mx-001'] });
    expect(off.some(c => c.id === 'ma-000')).toBe(false);
  });

  it('a room that enables CI-009 shuffles the Ooze into the Mansion', () => {
    const s = setup(
      {
        seed: 11,
        players: [
          { name: 'P', controller: 'human', characterCardId: 'ch-002' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer', { customCards: ['ci-009'] }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(mansionCopies(s, 'ci-009').length).toBeGreaterThan(0);
    expect(mansionCopies(s, 'ma-000').length).toBeGreaterThan(0);
  });
});

describe('CI-009 damage soak', () => {
  it('takes 10 less damage per Ammo x10 in the exploring player\'s discard pile', () => {
    // we-012: 40 base + 30 (more than 100 Ammo) = 70 damage vs 60 Health.
    // Two Ammo x10 in the discard pull that down to 50, so the Infected
    // survives and hits back for its 50 Damage.
    let s = rachaelGame({ level: 1, hp: 80, turnAmmo: 120 });
    s = addDiscard(s, 0, 'am-001', 2);
    const { state, ids } = setMansionTop(s, ['ci-009']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(30); // 80 - 50
    expect(next.seats[0]?.attached).not.toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(0);
  });

  it('is defeated outright when the discard pile holds no Ammo x10', () => {
    const { state, ids } = setMansionTop(rachaelGame({ level: 1, hp: 80, turnAmmo: 120 }), ['ci-009']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
  });
});

describe('CI-009 defeat', () => {
  it('shuffles a fresh Ooze into the Mansion and keeps the trophy', () => {
    const { state, ids } = setMansionTop(rachaelGame({ level: 1, hp: 80, turnAmmo: 120 }), ['ci-009']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const before = mansionCopies(armed, 'ma-000').length;
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
    // One fresh Ooze joined the Mansion on top of the setup copy.
    expect(mansionCopies(next, 'ma-000')).toHaveLength(before + 1);
  });
});

describe('MA-000 Rachael Foley (ooze)', () => {
  it('shuffles back into the Mansion when defeated with 80 or less damage', () => {
    const { state, ids } = setMansionTop(rachaelGame({ level: 1, hp: 80, turnAmmo: 80 }), ['ma-000']);
    const { state: armed, id } = addWeapon(state, 0, 'we-006'); // 50 damage
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80);
    // Not attached, but the Decoration is still awarded.
    expect(next.seats[0]?.attached).not.toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
    expect(next.mansionDeck).toContain(ids[0]);
  });

  it('is attached normally when defeated with more than 80 damage', () => {
    const { state, ids } = setMansionTop(rachaelGame({ level: 1, hp: 80, turnAmmo: 80 }), ['ma-000']);
    const { state: armed, id } = addWeapon(state, 0, 'we-008'); // 100 damage, instant kill
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
    expect(next.mansionDeck).not.toContain(ids[0]);
  });
});

describe('CI-009 / MA-000 in a multi-explore', () => {
  it('CI-009 soaks the pooled damage and still spawns the Ooze', () => {
    const { state, ids } = setMansionTop(
      rachaelGame({ level: 1, hp: 100, turnAmmo: 130, exploresLeft: 2 }),
      ['ci-009', 'ma-002'],
    );
    const { state: armed, id: w1 } = addWeapon(state, 0, 'we-012'); // 70 with the ammo bonus
    const { state: armed2, id: w2 } = addWeapon(armed, 0, 'we-006'); // 50
    const next = applyAction(armed2, { type: 'explore', seat: 0, weapons: [w1, w2], exploreCount: 2 });
    // Combined 60 + 20 = 80 Health vs 70 + 50 = 120 damage -> both defeated.
    expect(next.seats[0]?.attached).toEqual(expect.arrayContaining(ids));
    expect(next.seats[0]?.decorations).toBe(5 + 1);
    // The setup copy plus the one CI-009 shuffled in.
    expect(mansionCopies(next, 'ma-000')).toHaveLength(2);
  });

  it('shuffles the Ooze back when the batch damage is 80 or less', () => {
    const { state, ids } = setMansionTop(
      rachaelGame({ level: 1, hp: 100, turnAmmo: 80, exploresLeft: 2 }),
      ['ma-000', 'ma-002'],
    );
    const { state: armed, id } = addWeapon(state, 0, 'we-006'); // 50 damage
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 2 });
    // Combined 30 + 20 = 50 Health vs 50 damage -> defeated; the Ooze
    // (50 <= 80) returns to the Mansion while ma-002 is attached.
    expect(next.seats[0]?.attached).toContain(ids[1]);
    expect(next.seats[0]?.attached).not.toContain(ids[0]);
    expect(next.mansionDeck).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5 + 1);
  });
});
