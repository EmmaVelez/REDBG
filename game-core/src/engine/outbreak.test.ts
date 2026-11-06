import { describe, expect, test } from 'vitest';
import { setup, startTurn, checkWin } from './game';
import { exploreDamage } from './explore';
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
  test('AC-026 Injection: discard any number, draw the same, optional -1 Infection', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, hand: [...x.hand, 'ac-026#1'], infectionCards: ['in-001#1', 'in-001#2', 'in-001#3'] }
        : x)),
    })), ['ac-026#1']);
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-026#1' });
    expect(played.seats[0]!.actionsLeft).toBe(1); // 1 - 1 + 1
    expect(pr(played).payload?.kind).toBe('injectionDiscard');
    const d1 = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 0 });
    expect(pr(d1).payload?.count).toBe('1');
    const d2 = applyAction(d1, { type: 'chooseOption', seat: 0, promptId: pr(d1).id, option: 0 });
    expect(pr(d2).payload?.count).toBe('2');
    const donePrompt = pr(d2);
    const done = applyAction(d2, { type: 'chooseOption', seat: 0, promptId: donePrompt.id, option: donePrompt.options.indexOf('DONE') });
    expect(pr(done).payload?.kind).toBe('injectionTrash');
    const trashed = applyAction(done, { type: 'chooseOption', seat: 0, promptId: pr(done).id, option: 0 });
    expect(trashed.seats[0]!.infectionCards).toHaveLength(2);
  });

  test('AC-029 Parting Ways: +1 action, trash a card, then gain a Resource card', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, hand: [...x.hand, 'ac-029#1'] } : x)),
    })), ['ac-029#1']);
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-029#1' });
    expect(played.seats[0]!.actionsLeft).toBe(1);
    expect(pr(played).payload?.kind).toBe('partingWays');
    const trashed = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 0 });
    expect(pr(trashed).payload?.kind).toBe('partingWaysGain');
    const declined = applyAction(trashed, { type: 'chooseOption', seat: 0, promptId: pr(trashed).id, option: pr(trashed).options.indexOf('Decline') });
    expect(declined.seats[0]!.hand).not.toContain(pr(played).options[0]!);
  });

  test('AC-031 The Gathering Darkness: target trashes their best Ammunition and gains Ammo x10', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) return { ...x, hand: [...x.hand, 'ac-031#1'] };
        return { ...x, hand: [...x.hand, 'am-003#1'] };
      }),
    })), ['ac-031#1', 'am-003#1']);
    const played = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: 'ac-031#1' });
    expect(pr(played).payload?.kind).toBe('gatheringDarkness');
    const done = applyAction(played, { type: 'chooseOption', seat: 0, promptId: pr(played).id, option: 0 });
    expect(done.seats[1]!.hand).not.toContain('am-003#1');
    expect(done.seats[1]!.discard).toContain('am-003#1');
    // Ammo x30 provides 30 ammo -> three Ammo x10
    expect(done.seats[1]!.hand.filter(id => id.includes('#g') && done.cards[id]?.cardId === 'am-001')).toHaveLength(3);
  });
  // --- infection cards ---
  test('IN-001 Claw: 10 damage and the target is limited to one Action next turn', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#1', hp: 140, maxHp: 140, exploresLeft: 1, hand: [...x.hand, 'in-001#1'] }
        : x)),
    })), ['ch-031#1', 'in-001#1']);
    const before = s.seats[1]!.hp;
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-001#1'] });
    expect(atk.seats[1]!.hp).toBe(before - 10);
    expect(atk.seats[1]!.actionsCapNextTurn).toBe(1);
    const next = startTurn({ ...atk, activeSeat: 1 });
    expect(next.seats[1]!.actionsLeft).toBe(1);
    expect(next.seats[1]!.actionsCapNextTurn).toBeUndefined();
  });

  test('IN-006 Devour: 5 damage and heals the infected character', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#1', hp: 100, maxHp: 140, exploresLeft: 1, hand: [...x.hand, 'in-006#1'] }
        : x)),
    })), ['ch-031#1', 'in-006#1']);
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-006#1'] });
    expect(atk.seats[1]!.hp).toBe(s.seats[1]!.hp - 5);
    expect(atk.seats[0]!.hp).toBe(120);
  });

  test('IN-007 Infection: the target gains 1 Infection Level', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#1', hp: 140, maxHp: 140, exploresLeft: 1, hand: [...x.hand, 'in-007#1'] }
        : x)),
    })), ['ch-031#1', 'in-007#1']);
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-007#1'] });
    expect(atk.seats[1]!.infectionCards).toHaveLength(1);
    expect(atk.infectionDeck).toHaveLength(39);
  });

  test('IN-005 Drag: the attacked character cannot attack back next turn', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#1', hp: 140, maxHp: 140, exploresLeft: 1, hand: [...x.hand, 'in-005#1'] }
        : x)),
    })), ['ch-031#1', 'in-005#1']);
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-005#1'] });
    expect(atk.seats[1]!.cannotAttackSeatNextTurn).toBe(0);
  });

  test('IN-003 Bile Vomit: 5 damage plus 5 per other Bile Vomit used', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, isInfectedCharacter: true, characterInstanceId: 'ch-031#1', hp: 140, maxHp: 140, exploresLeft: 1, hand: [...x.hand, 'in-003#1', 'in-003#2'] }
        : x)),
    })), ['ch-031#1', 'in-003#1', 'in-003#2']);
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-003#1', 'in-003#2'] });
    // 5 + 5 for each card, plus 5 per other Bile Vomit: 5+5 + 5+5 = 20
    expect(atk.seats[1]!.hp).toBe(s.seats[1]!.hp - 20);
  });
  // --- Outbreak characters ---
  test('CH-024 Mark Wilkins L1: +10 damage when using two or more weapons', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-024#1', level: 1, hand: [...x.hand, 'we-009#1', 'we-004#1'], turnAmmo: 20 } : x)),
    })), ['ch-024#1']);
    expect(exploreDamage(s, 0, ['we-009#1', 'we-004#1'])).toBe(10 + 5 + 10); // Handgun + Knife + Mark L1
    expect(exploreDamage(s, 0, ['we-009#1'])).toBe(10);
  });

  test('CH-024 Mark Wilkins L2: +10 damage to Melee weapons', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-024#1', level: 2, hand: [...x.hand, 'we-004#1'], turnAmmo: 0 } : x)),
    })), ['ch-024#1']);
    expect(exploreDamage(s, 0, ['we-004#1'])).toBe(5 + 10); // Combat Knife is a Melee weapon
  });

  test('CH-028 Chris Redfield L1: discard any number for +20 Ammo each', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-028#1', level: 1, hand: [...x.hand, 'we-004#1', 'we-009#1'], turnAmmo: 0 } : x)),
    })), ['ch-028#1']);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(pr(used).payload?.kind).toBe('discardAnyForAmmo');
    const d1 = applyAction(used, { type: 'chooseOption', seat: 0, promptId: pr(used).id, option: 0 });
    const d2 = applyAction(d1, { type: 'chooseOption', seat: 0, promptId: pr(d1).id, option: 0 });
    const donePrompt = pr(d2);
    const done = applyAction(d2, { type: 'chooseOption', seat: 0, promptId: donePrompt.id, option: donePrompt.options.indexOf('DONE') });
    expect(done.seats[0]!.turnAmmo).toBe(40);
  });

  test('CH-028 Chris Redfield L2: +20 explore damage with over 100 ammo', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-028#1', level: 2, hand: [...x.hand, 'we-009#1'], turnAmmo: 120 } : x)),
    })), ['ch-028#1']);
    expect(exploreDamage(s, 0, ['we-009#1'])).toBe(10 + 20);
    const poor = { ...s, seats: s.seats.map((x, i) => (i === 0 ? { ...x, turnAmmo: 100 } : x)) };
    expect(exploreDamage(poor, 0, ['we-009#1'])).toBe(10);
  });

  test('CH-027 Ada Wong L1: +1 action at turn start when health is 30 or less', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-027#1', hp: 30, level: 1 } : x)),
    })), ['ch-027#1']);
    const next = startTurn({ ...s, activeSeat: 0 });
    expect(next.seats[0]!.actionsLeft).toBe(2);
    const healthy = { ...s, seats: s.seats.map((x, i) => (i === 0 ? { ...x, hp: 31 } : x)) };
    expect(startTurn({ ...healthy, activeSeat: 0 }).seats[0]!.actionsLeft).toBe(1);
  });

  test('CH-030 Hunk L2: +30 base damage at 10 or less health', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => {
        if (i === 0) return { ...x, characterInstanceId: 'ch-030#1', level: 2, hp: 10, maxHp: 90, exploresLeft: 1 };
        return x;
      }),
    })), ['ch-030#1']);
    const atk = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1 });
    // Non-Infected attackers still use a weapon; Hunk's +30 is base Damage on top.
    const weaponInHand = s.seats[0]!.hand.find(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'weapon');
    const weaponDamage = weaponInHand !== undefined ? (s.cardDefs[s.cards[weaponInHand]?.cardId ?? '']?.damage ?? 0) : 0;
    expect(s.seats[1]!.hp - atk.seats[1]!.hp).toBe(weaponDamage + 30);
  });
  test('CH-025 Jill Valentine L1: turn start decreases her Infection Level', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, characterInstanceId: 'ch-025#1', level: 1, infectionCards: ['in-001#1', 'in-001#2', 'in-001#3'] }
        : x)),
    })), ['ch-025#1']);
    const next = startTurn({ ...s, activeSeat: 0 });
    expect(next.seats[0]!.infectionCards).toHaveLength(2);
    // the face-up Infection goes to the bottom of the Infection Deck
    expect(next.infectionDeck?.[next.infectionDeck.length - 1]).toBe('in-001#3');
  });

  test('CH-025 Jill Valentine L2: at Infection Level 0 she is immune to infection effects', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-025#1', level: 2, infectionCards: [] } : x)),
    })), ['ch-025#1']);
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(after.seats[0]!.infectionCards).toHaveLength(0);
    const plain = outbreakState();
    expect(applyAction(plain, { type: 'endTurn', seat: 0 }).seats[0]!.infectionCards).toHaveLength(1);
  });

  test('CH-026 Leon S. Kennedy L1: put a card from hand on top of the inventory', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-026#1', level: 1, hand: [...x.hand, 'we-004#1'] } : x)),
    })), ['ch-026#1']);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(pr(used).payload?.kind).toBe('leonHandToInventoryTop');
    const p = pr(used);
    const moved = applyAction(used, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('we-004#1') });
    expect(moved.seats[0]!.hand).not.toContain('we-004#1');
    expect(moved.seats[0]!.inventory[0]).toBe('we-004#1');
  });

  test('CH-026 Leon S. Kennedy L2: discard a card, then move an action card from discard to hand', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0
        ? { ...x, characterInstanceId: 'ch-026#1', level: 2, hand: [...x.hand, 'we-004#1'], discard: ['ac-001#1'] }
        : x)),
    })), ['ch-026#1']);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(pr(used).payload?.kind).toBe('leonDiscardForAction');
    const p = pr(used);
    const discarded = applyAction(used, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('we-004#1') });
    expect(pr(discarded).payload?.kind).toBe('leonActionFromDiscard');
    const q = pr(discarded);
    const moved = applyAction(discarded, { type: 'chooseOption', seat: 0, promptId: q.id, option: 0 });
    expect(moved.seats[0]!.hand).toContain('ac-001#1');
    expect(moved.seats[0]!.discard).not.toContain('ac-001#1');
  });

  test('CH-021 Excella Gionne L1: +1 Infection Level for +20 Gold', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-021#1', level: 1 } : x)),
    })), ['ch-021#1']);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(used.seats[0]!.infectionCards).toHaveLength(1);
    expect(used.seats[0]!.turnGold).toBe(20);
  });

  test('CH-021 Excella Gionne L2: +3 cards at Infection Level 8 or higher', () => {
    const cards8 = ['in-001#1', 'in-001#2', 'in-001#3', 'in-001#4', 'in-001#5', 'in-002#1', 'in-002#2', 'in-002#3'];
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-021#1', level: 2, infectionCards: [...cards8] } : x)),
    })), ['ch-021#1']);
    const before = s.seats[0]!.hand.length;
    const next = startTurn({ ...s, activeSeat: 0 });
    expect(next.seats[0]!.hand.length).toBe(before + 3);
  });

  test('CH-030 Hunk L1: take 10 Damage at turn start for +1 Explore', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-030#1', level: 1, hp: 90 } : x)),
    })), ['ch-030#1']);
    const next = startTurn({ ...s, activeSeat: 0 });
    expect(pr(next).payload?.kind).toBe('turnStartDamageForExplore');
    const p = pr(next);
    const accepted = applyAction(next, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(accepted.seats[0]!.hp).toBe(80);
    expect(accepted.seats[0]!.exploresLeft).toBe(2);
  });

  test('CH-027 Ada Wong L2: reveal action cards for +1 card each', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-027#1', level: 2, hand: [...x.hand, 'ac-001#1'] } : x)),
    })), ['ch-027#1', 'ac-001#1']);
    const next = startTurn({ ...s, activeSeat: 0 });
    expect(pr(next).payload?.kind).toBe('turnStartRevealActionsForCards');
    const p = pr(next);
    const first = applyAction(next, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('ac-001#1') });
    const q = pr(first);
    const done = applyAction(first, { type: 'chooseOption', seat: 0, promptId: q.id, option: q.options.indexOf('DONE') });
    expect(done.seats[0]!.hand.length).toBe(s.seats[0]!.hand.length + 1);
  });
  test('CH-022 Kevin Ryman L1: shuffle a Samurai Edge into the inventory', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-022#1', level: 1 } : x)),
    })), ['ch-022#1']);
    const before = s.seats[0]!.inventory.length;
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(used.seats[0]!.inventory.length).toBe(before + 1);
    expect(used.seats[0]!.inventory.some(id => used.cards[id]?.cardId === 'we-027')).toBe(true);
  });

  test('CH-022 Kevin Ryman L2: move a Pistol from the Play Area to the top of the inventory', () => {
    const s = withCards(outbreakState(st => ({
      ...st,
      seats: st.seats.map((x, i) => (i === 0 ? { ...x, characterInstanceId: 'ch-022#1', level: 2, playArea: [...x.playArea, 'we-009#1'] } : x)),
    })), ['ch-022#1']);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(pr(used).payload?.kind).toBe('kevinPistolToInventoryTop');
    const p = pr(used);
    const moved = applyAction(used, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(moved.seats[0]!.playArea).not.toContain('we-009#1');
    expect(moved.seats[0]!.inventory[0]).toBe('we-009#1');
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
