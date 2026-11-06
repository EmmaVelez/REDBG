import { describe, expect, test } from 'vitest';
import { setup, startTurn, checkWin } from './game';
import { applyAction } from './actions';
import { ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '../data/cards';
import { SCENARIOS } from '../data/cards';
import type { GameState } from '../types';

function outbreakState(over: (s: GameState) => GameState = s => s): GameState {
  const base = setup(
    {
      seed: 7,
      players: [
        { name: 'A', controller: 'human' },
        { name: 'B', controller: 'human' },
      ],
      scenario: 'outbreak',
    },
    ALL_CARDS,
    OUTBREAK_PILES,
    OUTBREAK_MANSION,
  );
  return over(base);
}

describe('Outbreak mode', () => {
  test('setup builds the Infection Deck and the per-seat infection fields', () => {
    const s = outbreakState();
    // IN-001..IN-007 copies 5,6,6,6,6,6,5 = 40
    expect(s.infectionDeck).toHaveLength(40);
    expect(s.endInfectedCardId).toBe('ma-041');
    expect(s.seats[0]!.infectionCards).toEqual([]);
    expect(s.seats[0]!.isInfectedCharacter).toBe(false);
    expect(s.seats[0]!.exploredOrAttackedThisTurn).toBe(false);
    // the scenario is registered with its own piles + mansion
    const def = SCENARIOS.find(x => x.id === 'outbreak') as { mansionCards?: readonly unknown[] } | undefined;
    expect(def?.mansionCards?.length).toBe(17);
  });

  test('ending a turn without Exploring raises the Infection Level by 1', () => {
    const s = outbreakState();
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(1);
    expect(after.infectionDeck).toHaveLength(39);
  });

  test('Exploring the Mansion suppresses the end-of-turn Infection increase', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 } : x)),
    }));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(explored.seats[0]!.exploredOrAttackedThisTurn).toBe(true);
    const after = applyAction(explored, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(0);
    expect(after.infectionDeck).toHaveLength(40);
  });

  test('reaching the Maximum Infection Level kills the Character, who reanimates as a Zombie', () => {
    const nine = ['in-001#1', 'in-001#2', 'in-001#3', 'in-001#4', 'in-001#5', 'in-002#1', 'in-002#2', 'in-002#3', 'in-002#4'];
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, infectionCards: [...nine] } : x)),
    }));
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(after.infectionDeck).toHaveLength(39); // one Infection drawn
    expect(after.seats[0]!.dead).toBe(true);
    expect(after.seats[0]!.pendingReanimate).toBe(true);
    // the face-up Infections were shuffled into the Inventory
    expect(after.seats[0]!.infectionCards).toEqual([]);

    const reanimated = startTurn({ ...after, activeSeat: 0 });
    expect(reanimated.seats[0]!.dead).toBe(false);
    expect(reanimated.seats[0]!.isInfectedCharacter).toBe(true);
    const zid = reanimated.cards[reanimated.seats[0]!.characterInstanceId]?.cardId;
    expect(['ch-031', 'ch-032', 'ch-033']).toContain(zid);
    // Infected Character restrictions: 0 Buys, 0 Actions, 1 Explore
    expect(reanimated.seats[0]!.actionsLeft).toBe(0);
    expect(reanimated.seats[0]!.buysLeft).toBe(0);
    expect(reanimated.seats[0]!.exploresLeft).toBe(1);
  });

  test('a non-infected Character Attacks an Infected Character with a weapon', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) return { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 };
        return { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-033#2', hp: 140, maxHp: 140 };
      }),
      cards: {
        ...st.cards,
        'ch-033#2': { instanceId: 'ch-033#2', cardId: 'ch-033', location: { zone: 'hand', index: 0 } },
      },
    }));
    const before = s.seats[0]!.hp;
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, weaponInstanceId: 'we-009#1' });
    // Handgun 10 damage vs Zombie C 140 HP -> survives, so it deals its 10 base
    // Damage back to the attacker.
    expect(atk.seats[1]!.hp).toBe(130);
    expect(atk.seats[0]!.hp).toBe(before - 10);
    expect(atk.seats[0]!.exploresLeft).toBe(0);
  });

  test('an Infected Character Attacks with its base Damage', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) {
          return { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-033#1', hp: 140, maxHp: 140, exploresLeft: 1 };
        }
        return x;
      }),
      cards: {
        ...st.cards,
        'ch-033#1': { instanceId: 'ch-033#1', cardId: 'ch-033', location: { zone: 'hand', index: 0 } },
      },
    }));
    const targetBefore = s.seats[1]!.hp;
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1 });
    expect(atk.seats[1]!.hp).toBe(targetBefore - 10);
    expect(atk.seats[0]!.exploresLeft).toBe(0);
  });

  test('Attacking an Infected Character counts as Exploring for the Infection check', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) return { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 };
        return { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#2', hp: 140, maxHp: 140 };
      }),
      cards: {
        ...st.cards,
        'ch-031#2': { instanceId: 'ch-031#2', cardId: 'ch-031', location: { zone: 'hand', index: 0 } },
      },
    }));
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, weaponInstanceId: 'we-009#1' });
    expect(atk.seats[0]!.exploredOrAttackedThisTurn).toBe(true);
    const after = applyAction(atk, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(0);
  });

  test('the game ends when Tyrant T-002 is defeated', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, attached: ['ma-041#1'], decorations: 8 } : x)),
    }));
    // ma-041#1 is registered in the mansion deck at setup; attach it as a trophy.
    expect(checkWin(s).gameOver).toBe(true);
    expect(checkWin(s).endReason).toBe('scenarioInfectedDefeated');
  });
});
