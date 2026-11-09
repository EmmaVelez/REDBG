import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * EV-001 Zombie Grab — "Trash a weapon from your hand or discard pile;
 * otherwise, take 20 damage, then shuffle this card into the mansion."
 * The card is ALWAYS shuffled back into the Mansion (a recurring hazard).
 */

const GRAB = CUSTOM_CARDS.find(c => c.id === 'ev-001');

function grabGame(over: Partial<PlayerState> = {}): GameState {
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

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

describe('EV-001 Zombie Grab data', () => {
  it('matches the printed card', () => {
    expect(GRAB).toEqual(expect.objectContaining({
      id: 'ev-001', name: 'Zombie Grab', type: 'event', set: 'custom', copies: 1,
    }));
    expect(GRAB?.text).toContain('Trash a weapon from your hand or discard pile');
  });

  it('joins the Mansion only when the room selected it', () => {
    const off = setup(
      { seed: 11, players: [{ name: 'P', controller: 'human' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(off.mansionDeck.length).toBe(38);
    expect(cardsForScenario('firstTimer').some(c => c.id === 'ev-001')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['ev-001'] });
    expect(on.some(c => c.id === 'ev-001')).toBe(true);
  });
});

describe('EV-001 Zombie Grab resolution', () => {
  it('offers every hand/discard weapon plus the 20-damage fallback', () => {
    const { state, ids } = setMansionTop(grabGame({ level: 1, turnAmmo: 20 }), ['ev-001']);
    const { state: s1, id: used } = addWeapon(state, 0, 'we-009');
    const { state: s2, id: spare } = addWeapon(s1, 0, 'we-004');
    const revealed = applyAction(s2, { type: 'explore', seat: 0, weapons: [used], exploreCount: 1 });
    const prompt = findPrompt(revealed, 'zombieGrab');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    expect(prompt.options).toContain(spare);
    expect(prompt.options).toContain('Take 20 damage');
    expect(prompt.options).not.toContain(used); // already moved to the play area
    expect([...revealed.mansionDeck, ...revealed.mansionBottom]).not.toContain(ids[0]);
  });

  it('trashing a weapon costs no Health and shuffles the card back', () => {
    const { state, ids } = setMansionTop(grabGame({ level: 1, hp: 80, turnAmmo: 20 }), ['ev-001']);
    const { state: s1, id: used } = addWeapon(state, 0, 'we-009');
    const { state: s2, id: spare } = addWeapon(s1, 0, 'we-004');
    const revealed = applyAction(s2, { type: 'explore', seat: 0, weapons: [used], exploreCount: 1 });
    const prompt = findPrompt(revealed, 'zombieGrab');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(revealed, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: prompt.options.indexOf(spare) });
    expect(after.removed).toContain(spare);
    expect(after.seats[0]?.hp).toBe(80);
    expect([...after.mansionDeck, ...after.mansionBottom]).toContain(ids[0]);
    expect(after.removed).not.toContain(ids[0]);
  });

  it('taking the 20 damage also shuffles the card back', () => {
    const { state, ids } = setMansionTop(grabGame({ level: 1, hp: 80, turnAmmo: 20 }), ['ev-001']);
    const { state: s1, id: used } = addWeapon(state, 0, 'we-009');
    const { state: s2, id: spare } = addWeapon(s1, 0, 'we-004');
    const revealed = applyAction(s2, { type: 'explore', seat: 0, weapons: [used], exploreCount: 1 });
    const prompt = findPrompt(revealed, 'zombieGrab');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(revealed, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: prompt.options.indexOf('Take 20 damage') });
    expect(after.seats[0]?.hp).toBe(60);
    expect(after.removed).not.toContain(spare);
    expect([...after.mansionDeck, ...after.mansionBottom]).toContain(ids[0]);
  });

  it('offers only the damage fallback when there is no weapon to trash', () => {
    const base = grabGame({ level: 1, hp: 80, turnAmmo: 20 });
    const cleared = {
      ...base,
      seats: base.seats.map((p, i) => (i === 0 ? { ...p, hand: [], discard: [] } : p)),
    };
    const { state, ids } = setMansionTop(cleared, ['ev-001']);
    const { state: armed, id } = addWeapon(state, 0, 'we-009');
    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    const prompt = findPrompt(revealed, 'zombieGrab');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    expect(prompt.options).toEqual(['Take 20 damage']);
    const after = applyAction(revealed, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(after.seats[0]?.hp).toBe(60);
    expect([...after.mansionDeck, ...after.mansionBottom]).toContain(ids[0]);
  });
});
