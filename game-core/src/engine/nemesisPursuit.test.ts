import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { resolveAllyExplore } from './allyExplore';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';
import { ALLIANCE_CARDS } from '../data/alliance';
import { NIGHTMARE_CARDS } from '../data/nightmare';

/**
 * EV-002 Nemesis Pursuit — "When this event is revealed, the exploring
 * character must explore again. This turn, all infected gain +10 health and
 * +20 damage. Remove this event from the game afterwards."
 *
 * Manny's rulings (2026-11-10):
 * - "must explore again" = +1 Explore and a must-explore obligation (endTurn
 *   stays blocked until another explore).
 * - "this turn, all infected gain" is a turn-long buff, so it also covers the
 *   forced second explore and clears at the start of the next turn.
 */

const NEMESIS = CUSTOM_CARDS.find(c => c.id === 'ev-002');

function nemesisGame(over: Partial<PlayerState> = {}): GameState {
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

function sherryGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'Sherry', controller: 'human', characterCardId: 'fch-008' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-002' },
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

describe('EV-002 Nemesis Pursuit data', () => {
  it('matches the printed card', () => {
    expect(NEMESIS).toEqual(expect.objectContaining({
      id: 'ev-002', name: 'Nemesis Pursuit', type: 'event', set: 'custom', copies: 1,
    }));
    expect(NEMESIS?.text).toBe('When this event is revealed, the exploring character must explore again. This turn, all infected gain +10 health and +20 damage. Remove this event from the game afterwards.');
  });

  it('is NOT part of ALL_CARDS and joins the Mansion only when selected', () => {
    expect(ALL_CARDS.some(c => c.id === 'ev-002')).toBe(false);
    expect(cardsForScenario('firstTimer').some(c => c.id === 'ev-002')).toBe(false);
    expect(cardsForScenario('firstTimer', { customCards: ['ev-002'] }).some(c => c.id === 'ev-002')).toBe(true);
  });
});

describe('EV-002 Nemesis Pursuit resolution', () => {
  it('single explore: removes the event, grants +1 Explore, blocks endTurn', () => {
    const { state, ids } = setMansionTop(nemesisGame(), ['ev-002']);
    const { state: armed, id: bow } = addWeapon(state, 0, 'we-002');
    const before = armed.seats[0]?.exploresLeft ?? 0;

    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 1 });

    expect(revealed.removed).toContain(ids[0]);
    expect([...revealed.mansionDeck]).not.toContain(ids[0]);
    expect(revealed.seats[0]?.exploresLeft).toBe(before); // -1 spent, +1 granted
    expect(revealed.seats[0]?.mustExplore).toBe(true);
    expect(revealed.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });
    expect(revealed.prompts.some(p => p.payload?.kind === 'takeOrBottom')).toBe(false);
    // "must explore again": endTurn stays blocked while the obligation is open.
    expect(validateAction(revealed, { type: 'endTurn', seat: 0 }).ok).toBe(false);
  });

  it('the forced second explore faces the +10/+20 buffed Infected', () => {
    const { state } = setMansionTop(nemesisGame({ hp: 100 }), ['ev-002']);
    const { state: armed1, id: bow1 } = addWeapon(state, 0, 'we-002');
    const { state: armed2, id: bow2 } = addWeapon(armed1, 0, 'we-002');
    const revealed = applyAction(armed2, { type: 'explore', seat: 0, weapons: [bow1], exploreCount: 1 });
    expect(revealed.seats[0]?.mustExplore).toBe(true);

    // A 20 HP / 10 Damage Majini: the Longbow deals 25, enough to defeat it
    // unimpeded. Buffed it is 30 HP / 30 Damage, so the explore fails and the
    // player takes 30.
    const { state: buffed, ids: infIds } = setMansionTop(revealed, ['ma-001']);
    const second = applyAction(buffed, { type: 'explore', seat: 0, weapons: [bow2], exploreCount: 1 });

    expect(second.seats[0]?.hp).toBe(70);
    expect(second.seats[0]?.mustExplore).not.toBe(true);
    expect(second.removed).not.toContain(infIds[0]);
    expect([...second.mansionDeck]).toContain(infIds[0]);
  });

  it('multi-explore: the buff applies to Infected revealed in the same batch', () => {
    const { state, ids } = setMansionTop(
      nemesisGame({ hp: 100, exploresLeft: 3 }),
      ['ev-002', 'ma-001'],
    );
    const { state: armed, id: bow } = addWeapon(state, 0, 'we-002');

    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 2 });

    expect(revealed.removed).toContain(ids[0]);
    expect(revealed.seats[0]?.hp).toBe(70);            // 30 Damage from the buffed Majini
    expect(revealed.seats[0]?.exploresLeft).toBe(2);   // 3 - 2 + 1
    expect(revealed.seats[0]?.mustExplore).toBe(true);
    expect(revealed.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });
  });

  it('the buff lasts only this turn', () => {
    const { state } = setMansionTop(nemesisGame(), ['ev-002']);
    const { state: armed, id: bow } = addWeapon(state, 0, 'we-002');
    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 1 });
    expect(revealed.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });

    const next = startTurn(revealed);
    expect(next.infectedBuffThisTurn).toBeUndefined();
  });

  it('Sherry forced explore: the event is removed and the target must explore again', () => {
    const { state, ids } = setMansionTop(sherryGame(), ['ev-002']);
    const resolved = resolveAllyExplore(state, 0, 1);
    expect(resolved.removed).toContain(ids[0]);
    expect(resolved.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });
    expect(resolved.seats[1]?.mustExplore).toBe(true);
    expect(resolved.seats[1]?.exploresLeft).toBe(2); // 1 + 1 granted
  });
});

describe('EV-002 Nemesis Pursuit from another event reveal', () => {
  function chainGame(extraCards: ReadonlyArray<CardDef>, over: Partial<PlayerState> = {}): GameState {
    const s = setup(
      {
        seed: 11,
        players: [
          { name: 'P', controller: 'human', characterCardId: 'ch-002' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      [...PREMIER_CARDS, ...extraCards, ...CUSTOM_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
  }

  it('MA-039 reveals it as the second card: removed, never shuffled back', () => {
    const { state, ids } = setMansionTop(chainGame(ALLIANCE_CARDS), ['ma-039', 'ev-002']);
    const { state: armed, id: bow } = addWeapon(state, 0, 'we-002');

    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 1 });

    expect(revealed.removed).toContain(ids[0]); // MA-039 itself
    expect(revealed.removed).toContain(ids[1]); // EV-002
    expect([...revealed.mansionDeck]).not.toContain(ids[1]);
    expect(revealed.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });
    expect(revealed.seats[0]?.mustExplore).toBe(true);
    expect(revealed.seats[0]?.exploresLeft).toBe(1); // 1 - 1 + 1
  });

  it('MA-072 reveals it as the second card: removed, never shuffled back', () => {
    const { state, ids } = setMansionTop(chainGame(NIGHTMARE_CARDS), ['ma-072', 'ev-002']);
    const { state: armed, id: bow } = addWeapon(state, 0, 'we-002');

    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 1 });

    expect(revealed.removed).toContain(ids[1]); // EV-002
    expect([...revealed.mansionDeck]).not.toContain(ids[1]);
    expect(revealed.infectedBuffThisTurn).toEqual({ hp: 10, attack: 20 });
    expect(revealed.seats[0]?.mustExplore).toBe(true);
  });
});
