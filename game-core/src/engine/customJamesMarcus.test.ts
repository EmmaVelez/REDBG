import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import {
  ALL_CARDS,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  STANDARD_MANSION_DECK,
  cardsForScenario,
} from '../data/cards';

/**
 * CI-010 "James Marcus" and CI-011 "Queen Leech" — the third fan-card pair.
 * Marcus nominates a player on reveal who must spend their WHOLE Explore pool
 * on their next turn, and shuffles the Queen Leech into the Mansion when he is
 * defeated. The Queen Leech's printed Health is "X": it is set to the leading
 * exploring Character's Maximum Health when she is revealed.
 */

const MARCUS = CUSTOM_CARDS.find(c => c.id === 'ci-010');
const QUEEN = CUSTOM_CARDS.find(c => c.id === 'ci-011');

function gameWith(
  cards: ReadonlyArray<CardDef>,
  over: Partial<PlayerState> = {},
  players: ReadonlyArray<Partial<PlayerState>> = [],
): GameState {
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
  return {
    ...s,
    seats: s.seats.map((p, i) => ({ ...p, ...(i === 0 ? over : players[i] ?? {}) })),
  };
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

describe('CI-010 / CI-011 data', () => {
  it('matches the printed cards', () => {
    expect(MARCUS).toEqual(expect.objectContaining({
      id: 'ci-010',
      name: 'James Marcus',
      type: 'infected',
      set: 'custom',
      copies: 1,
      hp: 60,
      attack: 50,
      decorations: 5,
      infectedEffects: [
        { kind: 'onRevealChoosePlayerMustUseAllExploresNextTurn' },
        { kind: 'onDefeatShuffleCardIntoMansion', cardId: 'ci-011' },
      ],
    }));
    expect(QUEEN).toEqual(expect.objectContaining({
      id: 'ci-011',
      name: 'Queen Leech',
      type: 'infected',
      set: 'custom',
      copies: 1,
      attack: 70,
      decorations: 8,
      infectedEffects: [{ kind: 'onRevealHpEqualsExploringCharacterMaxHp' }],
    }));
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === 'ci-010')).toBe(false);
    expect(ALL_CARDS.some(c => c.id === 'ci-011')).toBe(false);
  });

  it('enabling CI-010 pulls the Queen Leech in as a dependency', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['ci-010'] });
    expect(on.some(c => c.id === 'ci-010')).toBe(true);
    expect(on.some(c => c.id === 'ci-011')).toBe(true);
    const off = cardsForScenario('firstTimer', { customCards: ['mx-001'] });
    expect(off.some(c => c.id === 'ci-011')).toBe(false);
  });
});

describe('CI-010 James Marcus', () => {
  it('raises a choose-a-player prompt for the exploring seat on reveal', () => {
    // Leon (ch-002) has 80 max Health; we-006 deals 50 < 60, so Marcus lives.
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 80 }), ['ci-010']);
    const { state: armed, id } = addWeapon(state, 0, 'we-006');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    const prompt = next.prompts.find(p => p.payload?.kind === 'jamesMarcusChoosePlayer');
    expect(prompt).toBeDefined();
    expect(prompt?.seat).toBe(0);
    expect(prompt?.options).toEqual(['0', '1']);
  });

  it('shuffles the Queen Leech into the Mansion when defeated', () => {
    const { state, ids } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 130 }), ['ci-010']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012'); // 40 + 30 = 70 >= 60
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(next.seats[0]?.decorations).toBe(5);
    // ci-011 is a custom Infected, so one copy is ALREADY in the Mansion; the
    // defeat adds a second.
    expect(mansionCopies(next, 'ci-011').length).toBe(2);
  });

  it('makes the chosen player spend their whole Explore pool next turn', () => {
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 80 }), ['ci-010']);
    const { state: armed, id } = addWeapon(state, 0, 'we-006');
    // Seat 1 needs a legal explore available, or endTurn would be allowed anyway.
    const ready = addWeapon(armed, 1, 'we-006');
    const next = applyAction(ready.state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    const prompt = next.prompts.find(p => p.payload?.kind === 'jamesMarcusChoosePlayer');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;

    const answered = applyAction(next, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(answered.seats[1]?.mustUseAllExploresNextTurn).toBe(true);

    // Seat 0 ends the turn; the game loop then opens seat 1's turn, where the
    // obligation is consumed and seeded from the Explore pool granted there.
    const ended = applyAction(answered, { type: 'endTurn', seat: 0 });
    const started = startTurn(ended);
    expect(started.activeSeat).toBe(1);
    expect(started.seats[1]?.mustUseAllExploresNextTurn).toBeUndefined();
    expect(started.seats[1]?.exploresRequiredThisTurn).toBe(started.seats[1]?.exploresLeft);

    // Ending the turn while the debt is unpaid is refused…
    expect(validateAction(started, { type: 'endTurn', seat: 1 }).ok).toBe(false);
    // …and spending the pool clears it.
    const w1 = ready.state.seats[1]?.hand.find(h => ready.state.cards[h]?.cardId === 'we-006');
    expect(w1).toBeDefined();
    if (w1 === undefined) return;
    const explored = applyAction(
      { ...started, seats: started.seats.map((s, i) => (i === 1 ? { ...s, turnAmmo: 80 } : s)) },
      { type: 'explore', seat: 1, weapons: [w1], exploreCount: 1 },
    );
    expect(explored.seats[1]?.exploresRequiredThisTurn ?? 0).toBe(0);
    expect(validateAction(explored, { type: 'endTurn', seat: 1 }).ok).toBe(true);
  });
});

describe('CI-011 Queen Leech', () => {
  it("takes Health from the leading character's Maximum Health, not the printed value", () => {
    // Leon has 80 max Health. we-012 deals exactly 70 — enough for a 60-Health
    // Infected (CI-010) but NOT for the Queen, whose Health is 80.
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 130 }), ['ci-011']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached ?? []).toHaveLength(0);
    // She survives and hits back for 70.
    expect(next.seats[0]?.hp).toBe(10);
  });

  it('is defeated once the damage reaches that Maximum Health', () => {
    const { state } = setMansionTop(game({ level: 1, hp: 80, turnAmmo: 130 }), ['ci-011']);
    const { state: armed, id } = addWeapon(state, 0, 'we-008'); // 100 damage
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached ?? []).toHaveLength(1);
    expect(next.seats[0]?.decorations).toBe(8);
  });

  it("uses the Partner's Maximum Health when the Partner leads", () => {
    // Claire (ch-003) has 70 max Health. A partner-led explore with we-012
    // (70 damage) exactly reaches her 70 Health.
    const base = setup(
      {
        seed: 11,
        players: [{ name: 'P', controller: 'human', characterCardId: 'ch-002', partnerCharacterId: 'ch-003' }],
        partnerMode: true,
      },
      [...PREMIER_CARDS, ...CUSTOM_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    // startTurn zeroes the turn pools, so arm the seat AFTER it.
    const startedBase = startTurn(base);
    const levelled: GameState = {
      ...startedBase,
      seats: startedBase.seats.map((p, i) => (i === 0
        ? { ...p, level: 1 as const, hp: 80, partnerHp: 70, turnAmmo: 130 }
        : p)),
    };
    const { state, ids } = setMansionTop(levelled, ['ci-011']);
    const { state: armed, id } = addWeapon(state, 0, 'we-012');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1, leader: 'partner' });
    expect(next.seats[0]?.attached).toContain(ids[0]);
  });
});
