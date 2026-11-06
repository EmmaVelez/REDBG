import { describe, expect, test } from 'vitest';
import { setup, startTurn, checkWin } from './game';
import { applyAction } from './actions';
import { ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '../data/cards';
import { SCENARIOS } from '../data/cards';
import type { GameState } from '../types';

function withCards(st: GameState, ids: readonly string[]): GameState {
  const cards = { ...st.cards };
  for (const id of ids) {
    const cardId = id.split("#")[0]!;
    cards[id] = { instanceId: id, cardId, location: { zone: "hand", index: 0 } };
  }
  return { ...st, cards };
}
function pr(s: GameState): { id: string; payload?: Record<string, string>; options: string[]; seat: number } {
  return s.prompts[0] as unknown as { id: string; payload?: Record<string, string>; options: string[]; seat: number };
}
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

  // --- infected-card effects ---
  function forceTop(st: GameState, instanceId: string): GameState {
    return {
      ...st,
      mansionDeck: [instanceId, ...st.mansionDeck.filter(id => id !== instanceId)],
    };
  }

  test('MA-042 Yawn: reveal raises the exploring character\'s Infection Level', () => {
    const s = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 } : x)),
    }, 'ma-042#1'));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    // level 0 <= 5 -> +2
    expect(explored.seats[0]!.infectionCards).toHaveLength(2);
    // above the threshold -> +1
    const high = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20, infectionCards: ['in-001#1', 'in-001#2', 'in-001#3', 'in-001#4', 'in-001#5', 'in-002#1'] }
        : x)),
    }, 'ma-042#1'));
    const exploredHigh = applyAction(high, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(exploredHigh.seats[0]!.infectionCards).toHaveLength(7);
  });

  test('MA-043 Nemesis (2nd form): reveal raises every character\'s Infection Level', () => {
    const s = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 } : x)),
    }, 'ma-043#1'));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(explored.seats[0]!.infectionCards).toHaveLength(1);
    expect(explored.seats[1]!.infectionCards).toHaveLength(1);
  });

  test('MA-046 Web Spinner: not defeated raises the Infection Level by 1', () => {
    const s = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20 } : x)),
    }, 'ma-046#1'));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(explored.seats[0]!.infectionCards).toHaveLength(1);
  });

  test('MA-041 Tyrant T-002: not defeated raises the Infection Level by 1 + level and shuffles it back', () => {
    const s = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-009#1'], turnAmmo: 20, level: 2 } : x)),
    }, 'ma-041#1'));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(explored.seats[0]!.infectionCards).toHaveLength(3); // 1 + level 2
    expect(explored.mansionDeck).toContain('ma-041#1');
    expect(explored.seats[0]!.attached).not.toContain('ma-041#1');
  });

  test('MA-053 Lisa Trevor: defeated raises the Infection Level by 1 and goes to the Mansion bottom', () => {
    const s = outbreakState(st => forceTop({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'we-029#1'], turnAmmo: 60 } : x)),
    }, 'ma-053#1'));
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-029#1'], exploreCount: 1 });
    expect(explored.seats[0]!.infectionCards).toHaveLength(1);
    expect(explored.seats[0]!.attached).not.toContain('ma-053#1');
    expect(explored.mansionBottom).toContain('ma-053#1');
  });
  // --- action cards ---
  test('AC-028 Higher Priorities: choose +3 cards or +2 actions', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'ac-028#1'] } : x)),
    })), ['ac-028#1']);
    const baseHand = s.seats[0]!.hand.length;
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-028#1' });
    expect(pr(played).payload?.kind).toBe('higherPriorities');
    const cards = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 0 });
    expect(cards.seats[0]!.hand.length).toBe(baseHand - 1 + 3);
    const actions = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 1 });
    expect(actions.seats[0]!.actionsLeft).toBe(2);
  });

  test('AC-030 Returned Favor: +2 cards, attaches, then +1 card and discards itself next turn', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'ac-030#1'] } : x)),
    })), ['ac-030#1']);
    const baseHand = s.seats[0]!.hand.length;
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-030#1' });
    expect(played.seats[0]!.attached).toContain('ac-030#1');
    expect(played.seats[0]!.hand.length).toBe(baseHand - 1 + 2);
    const next = startTurn({ ...played, activeSeat: 0 });
    expect(next.seats[0]!.attached).not.toContain('ac-030#1');
    expect(next.seats[0]!.discard).toContain('ac-030#1');
  });

  test('AC-027 By Any Means Necessary: +2 actions and a net -1 Infection Level', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, hand: [...x.hand, 'ac-027#1'], infectionCards: ['in-001#1', 'in-001#2', 'in-001#3'] }
        : x)),
    })), ['ac-027#1']);
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-027#1' });
    expect(played.seats[0]!.actionsLeft).toBe(2); // 1 - 1 (play) + 2
    expect(played.seats[0]!.infectionCards).toHaveLength(2);
  });

  test('AC-023 Power of the t-Virus: +20 damage and an optional +20 Gold trash', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'ac-023#1'], turnAmmo: 20 } : x)),
    }));
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-023#1' });
    expect(played.seats[0]!.weaponDamageBonusThisTurn).toBe(20);
    expect(pr(played).payload?.kind).toBe('powerOfTVirus');
    const trashed = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 0 });
    expect(trashed.seats[0]!.turnGold).toBe(20);
    expect(trashed.seats[0]!.playArea).not.toContain('ac-023#1');
  });

  test('AC-023: exploring and ending the turn raises the Infection Level', () => {
    const s = outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, hand: [...x.hand, 'ac-023#1', 'we-009#1'], turnAmmo: 20 }
        : x)),
    }));
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-023#1' });
    const declined = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 1 });
    const explored = applyAction(declined, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    const after = applyAction(explored, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(1);
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
