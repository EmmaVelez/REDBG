import { describe, it, expect } from 'vitest';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import type { CardInstance, GameState } from '../types';

/** Seat 0 explores a rigged Mansion top with one weapon from hand. */
function explore(cardId: string, weaponId: string): GameState {
  let s = startTurn(
    setup({
      seed: 11,
      players: [
        { name: 'P0', controller: 'human', characterCardId: 'ch-008' },
        { name: 'P1', controller: 'human', characterCardId: 'ch-004' },
      ],
    }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK),
  );
  const iid = `${cardId}#t`;
  const wid = `${weaponId}#w`;
  s = {
    ...s,
    cards: {
      ...s.cards,
      [iid]: { instanceId: iid, cardId, location: { zone: 'mansionDeck', index: 0 } } as CardInstance,
      [wid]: { instanceId: wid, cardId: weaponId, location: { zone: 'hand', index: 0, seat: 0 } } as CardInstance,
    },
    mansionDeck: [iid, ...s.mansionDeck],
    seats: s.seats.map((p, i) => (i === 0
      ? { ...p, hand: [wid], turnAmmo: 0, exploresLeft: 3, hp: 100 }
      : p)),
  } as GameState;
  return applyAction(s, { type: 'explore', seat: 0, weapons: [wid], exploreCount: 1 });
}

function lastReveal(s: GameState): { name: string; outcome?: string; damageTaken?: number } {
  const a = s.log[s.log.length - 1]?.action as Record<string, unknown>;
  expect(a.type).toBe('exploreReveal');
  return a as { name: string; outcome?: string; damageTaken?: number };
}

describe('explore log: every reveal is logged with its result', () => {
  it('a defeated Infected logs outcome=defeated and no damage', () => {
    const r = lastReveal(explore('ma-001', 'we-008'));
    expect(r.name).toBe('Majini');
    expect(r.outcome).toBe('defeated');
    expect(r.damageTaken).toBe(0);
  });

  it('a surviving Infected logs outcome=notDefeated and the damage taken', () => {
    const s = explore('ma-010', 'we-004');
    const r = lastReveal(s);
    expect(r.name).toBe('Uroboros Aheri');
    expect(r.outcome).toBe('notDefeated');
    expect(r.damageTaken).toBe(70);
  });

  it('a revealed EVENT that returns to the deck is still logged', () => {
    const r = lastReveal(explore('ev-001', 'we-008'));
    expect(r.name).toBe('Zombie Grab');
    expect(r.outcome).toBe('notDefeated');
  });
});
