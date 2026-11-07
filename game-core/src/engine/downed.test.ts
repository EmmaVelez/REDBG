import { describe, test, expect } from 'vitest';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import {
  ALL_CARDS,
  OUTBREAK_PILES,
  OUTBREAK_MANSION,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
} from '../data/cards';
import type { GameState } from '../types';

/**
 * Downing — rulebook "Penalty for Losing all Your Character's Health":
 * "If a Character's Health is reduced to 0 or less ... Turn the Character face
 * down and shuffle together all the cards in your Hand and Discard Pile into
 * your Inventory ... All cards currently attached to your Character remain
 * attached. When your turn comes around, turn your Character face up. Reduce
 * the maximum Health of your Character by 20, draw 5 new cards from your
 * Inventory, and skip this turn. If your Character's Maximum Health is 0 or
 * less at this point, your Character is dead and your game is over."
 *
 * Outbreak adds: "A face down Character is considered to be out of the game,
 * meaning that they cannot be targeted by effects or have their Infection
 * Level raised for any reason."
 */

const human = (name: string) => ({ name, controller: 'human' as const });

function outbreakState(over: (s: GameState) => GameState = s => s): GameState {
  return over(setup(
    { seed: 7, players: [human('A'), human('B')], scenario: 'outbreak' },
    ALL_CARDS,
    OUTBREAK_PILES,
    OUTBREAK_MANSION,
  ));
}

function premierState(over: (s: GameState) => GameState = s => s): GameState {
  return over(setup({ seed: 7, players: [human('A'), human('B')] }, PREMIER_CARDS, FIRST_TIMER_PILES));
}

/** Register extra card instances so a hand/discard edit is backed by state.cards. */
function withInstances(st: GameState, ids: readonly string[]): GameState {
  const cards = { ...st.cards };
  for (const id of ids) {
    const cardId = id.split('#')[0]!;
    cards[id] = { instanceId: id, cardId, location: { zone: 'hand', index: 0 } };
  }
  return { ...st, cards };
}

describe('downing', () => {
  test('attack damage to 0 Health downs the character and sweeps hand+discard into the Inventory', () => {
    const base = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) {
          // Zombie C: base Damage 10, no weapon needed.
          return { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-033#1', hp: 140, maxHp: 140, exploresLeft: 1 };
        }
        if (i === 1) {
          return { ...x, hp: 10, hand: ['am-001#x1'], discard: ['am-002#x1'], playArea: [] };
        }
        return x;
      }),
    }));
    const s = withInstances(base, ['ch-033#1', 'am-001#x1', 'am-002#x1']);

    const after = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1 });
    const target = after.seats[1]!;
    expect(target.hp).toBe(0);
    expect(target.downed).toBe(true);
    expect(target.dead).toBe(false);
    // Hand + Discard Pile were shuffled into the Inventory; both are now empty.
    expect(target.hand).toEqual([]);
    expect(target.discard).toEqual([]);
    expect(target.inventory).toContain('am-001#x1');
    expect(target.inventory).toContain('am-002#x1');
  });

  test('cards attached to the downed character stay attached', () => {
    const base = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) {
          return { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-033#1', hp: 140, maxHp: 140, exploresLeft: 1 };
        }
        if (i === 1) {
          return { ...x, hp: 5, attached: ['ma-001#x1'], hand: [], discard: [], playArea: [] };
        }
        return x;
      }),
    }));
    const s = withInstances(base, ['ch-033#1', 'ma-001#x1']);

    const after = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1 });
    expect(after.seats[1]!.downed).toBe(true);
    expect(after.seats[1]!.attached).toContain('ma-001#x1');
  });

  test('revive at the start of the next turn: -20 max Health, heal, draw 5, turn consumed', () => {
    const s = premierState(st => ({
      ...st,
      activeSeat: 0,
      seats: st.seats.map((p, i) => (i === 0
        ? { ...p, downed: true, dead: false, hp: 0, maxHp: 100, hand: [], discard: [], playArea: [] }
        : p)),
    }));

    const after = startTurn(s);
    const r = after.seats[0]!;
    expect(r.downed).toBe(false);
    expect(r.dead).toBe(false);
    expect(r.maxHp).toBe(80);
    expect(r.hp).toBe(80);
    expect(r.hand).toHaveLength(5);
    // "skip this turn" — play passes to the next seat.
    expect(after.activeSeat).not.toBe(0);
  });

  test('reviving at 20 max Health or less permanently defeats the character', () => {
    const s = premierState(st => ({
      ...st,
      activeSeat: 0,
      seats: st.seats.map((p, i) => (i === 0
        ? { ...p, downed: true, dead: false, hp: 0, maxHp: 20, hand: [], discard: [], playArea: [] }
        : p)),
    }));

    const after = startTurn(s);
    expect(after.seats[0]!.dead).toBe(true);
    expect(after.seats[0]!.downed).toBe(false);
  });

  test('a downed character cannot be attacked', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 1 ? { ...x, downed: true, hp: 0 } : x)),
    }));
    const res = validateAction(s, { type: 'attack', seat: 0, targetSeat: 1, weaponInstanceId: 'we-009#x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('downed');
  });

  test("a downed character's Infection Level does not rise at end of turn", () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, downed: true, hp: 0, infectionCards: ['in-001#x1'] }
        : x)),
    }));
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(1);
    expect(after.infectionDeck).toHaveLength(40);
  });

  test('a character already at 0 Health is not re-downed (idempotent)', () => {
    const s = premierState(st => ({
      ...st,
      seats: st.seats.map((p, i) => (i === 0
        ? { ...p, downed: true, dead: false, hp: 0, hand: [], discard: [], playArea: [] }
        : p)),
    }));
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.downed).toBe(true);
    expect(after.seats[0]!.hand).toEqual([]);
  });

  test('a downed character is out of the game: it cannot start actions but can end the turn', () => {
    const s = premierState(st => ({
      ...st,
      seats: st.seats.map((p, i) => (i === 0
        ? { ...p, downed: true, dead: false, hp: 0, exploresLeft: 1, turnAmmo: 10, hand: [] }
        : p)),
    }));
    const explore = validateAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(explore.ok).toBe(false);
    if (!explore.ok) expect(explore.reason).toContain('downed');
    expect(validateAction(s, { type: 'endTurn', seat: 0 }).ok).toBe(true);
  });
});
