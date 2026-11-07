import { describe, test, expect } from 'vitest';
import { setup } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '../data/cards';
import type { GameState } from '../types';

/**
 * Rules-text cards that used to have no engine encoding: WE-001/018/018g/019/
 * 021/025/030 and MA-045/047/048/049/054o/055o/056o/057o.
 */

const human = (name: string) => ({ name, controller: 'human' as const });

function game(over: (s: GameState) => GameState = s => s): GameState {
  return over(setup({ seed: 7, players: [human('A'), human('B')], scenario: 'outbreak' }, ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION));
}

function withInstances(st: GameState, ids: readonly string[]): GameState {
  const cards = { ...st.cards };
  for (const id of ids) {
    const cardId = id.split('#')[0]!;
    cards[id] = { instanceId: id, cardId, location: { zone: 'hand', index: 0 } };
  }
  return { ...st, cards };
}

/** Give the seat weapons in hand, ammo, an explore, and a chosen Mansion top. */
function rigExplore(
  st: GameState,
  seat: number,
  weapons: readonly string[],
  top?: string,
  over: (s: GameState) => GameState = s => s,
): GameState {
  const cards = { ...st.cards };
  for (const w of weapons) {
    const cardId = w.split('#')[0]!;
    cards[w] = { instanceId: w, cardId, location: { zone: 'hand', index: 0 } };
  }
  let mansionDeck = [...st.mansionDeck];
  if (top !== undefined) {
    mansionDeck = [top, ...mansionDeck.filter(id => id !== top)];
    const cardId = top.split('#')[0]!;
    cards[top] = { instanceId: top, cardId, location: { zone: 'mansionDeck', index: 0 } };
  }
  const rigged: GameState = {
    ...st,
    mansionDeck,
    cards,
    seats: st.seats.map((p, i) => (i === seat ? { ...p, hand: [...weapons, ...p.hand], turnAmmo: 90, exploresLeft: 1 } : p)),
  };
  return over(rigged);
}

describe('WE-001 Grenade — "Trashed after use"', () => {
  test('exploring with it trashes it', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-001#1'], 'ma-001#1'), ['we-001#1']);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-001#1'], exploreCount: 1 });
    expect(after.removed).toContain('we-001#1');
    expect(after.seats[0]?.playArea ?? []).not.toContain('we-001#1');
  });

  test('attacking with it trashes it', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-001#1']), ['we-001#1']);
    const after = applyAction(s, { type: 'attack', seat: 0, targetSeat: 1, weaponInstanceId: 'we-001#1' });
    expect(after.removed).toContain('we-001#1');
  });
});

describe('WE-018 Grenade Launcher — "All Explosives go to discard instead of trash"', () => {
  test('explosives used in the same explore go to the discard pile', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-018#1', 'we-001#1'], 'ma-001#1'), ['we-018#1', 'we-001#1']);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-018#1', 'we-001#1'], exploreCount: 1 });
    expect(after.removed).not.toContain('we-001#1');
    expect(after.seats[0]?.discard).toContain('we-001#1');
  });
});

describe('WE-019 Telescopic Sight Rifle — "reveal cards from BOTTOM of Mansion"', () => {
  test('the bottom card of the Mansion is revealed instead of the top', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-019#1']), ['we-019#1']);
    const topId = s.mansionDeck[0]!;
    const bottomId = s.mansionDeck[s.mansionDeck.length - 1]!;
    expect(topId).not.toBe(bottomId);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-019#1'], exploreCount: 1 });
    expect(after.mansionDeck).toContain(topId);
    expect(after.mansionDeck).not.toContain(bottomId);
  });
});

describe('WE-021 Triple Barreled Shotgun — "+2 explore" and "+10 damage per Infected battled"', () => {
  test('grants 2 explores and +10 damage for the Infected battled', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-021#1'], 'ma-001#1'), ['we-021#1']);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-021#1'], exploreCount: 1 });
    // 1 explore spent + 2 granted.
    expect(after.seats[0]?.exploresLeft).toBe(2);
    // 50 base + 10 (one Infected battled) = 60 damage vs 20 HP -> defeated.
    expect(after.seats[0]?.attached ?? []).toContain('ma-001#1');
  });
});

describe('WE-025 Blowback Pistol — "Discard any number of Pistol cards for +10 damage each"', () => {
  const pistols = ['we-009#1', 'we-009#2', 'we-025#1'];

  test('discarded Pistols add +10 damage each', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-025#1'], 'ma-004#1', st => ({
      ...st,
      seats: st.seats.map((p, i) => (i === 0 ? { ...p, hand: ['we-009#1', 'we-009#2', ...p.hand] } : p)),
    })), pistols);
    const after = applyAction(s, {
      type: 'explore', seat: 0, weapons: ['we-025#1'], exploreCount: 1,
      discardedPistols: ['we-009#1', 'we-009#2'],
    });
    // 20 base + 20 (2 Pistols) = 40 damage vs 25 HP -> defeated.
    expect(after.seats[0]?.attached ?? []).toContain('ma-004#1');
    expect(after.seats[0]?.discard).toContain('we-009#1');
    expect(after.seats[0]?.discard).toContain('we-009#2');
  });

  test('a non-Pistol card cannot be discarded for the bonus', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-025#1'], 'ma-001#1'), [...pistols, 'we-004#1']);
    const res = validateAction(s, {
      type: 'explore', seat: 0, weapons: ['we-025#1'], exploreCount: 1,
      discardedPistols: ['we-004#1'],
    });
    expect(res.ok).toBe(false);
  });
});

describe('WE-030 Hand Cannon — "Trash one ammunition from your play area"', () => {
  test('using it trashes one Ammunition card from the play area', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-030#1'], 'ma-004#1'), ['we-030#1', 'am-001#1']);
    const withAmmo: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, playArea: ['am-001#1'] } : p)),
    };
    const after = applyAction(withAmmo, { type: 'explore', seat: 0, weapons: ['we-030#1'], exploreCount: 1 });
    expect(after.removed).toContain('am-001#1');
    expect(after.seats[0]?.playArea ?? []).not.toContain('am-001#1');
  });
});

describe('MA-045 Wasp — "When revealed, the exploring characters each take 20 damage"', () => {
  test('the exploring character takes 20 damage on reveal', () => {
    const s = rigExplore(game(), 0, ['we-009#1'], 'ma-045#1');
    const hpBefore = s.seats[0]!.hp;
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(after.seats[0]?.hp).toBe(Math.max(hpBefore - 20, 0));
  });
});

describe('MA-047 Reinforced Zombie — "level 2 decoration requirement reduced by 1"', () => {
  test('the Level 2 gate drops by 1 while it is attached', () => {
    // ch-001: L1 at 2, L2 at 9. Seat starts on 7, defeats the Zombie (+1) = 8.
    // Without the reduction the gate is 9 (Level 1); with it, 8 (Level 2).
    const s = withInstances(rigExplore(game(), 0, ['we-009#1', 'we-009#2'], 'ma-047#1'), ['we-009#1', 'we-009#2']);
    const withDeco: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, decorations: 7 } : p)),
    };
    const after = applyAction(withDeco, { type: 'explore', seat: 0, weapons: ['we-009#1', 'we-009#2'], exploreCount: 1 });
    expect(after.seats[0]?.attached ?? []).toContain('ma-047#1');
    expect(after.seats[0]?.decorations).toBe(8);
    expect(after.seats[0]?.level).toBe(2);
  });
});

describe('MA-048 Crimson Head — "+10 health and +10 damage with a Zombie attached"', () => {
  const weapons = ['we-009#1', 'we-009#2', 'we-009#3', 'we-009#4', 'we-004#1'];

  test('a Zombie attached grants +10 HP (45 damage no longer defeats)', () => {
    const s = withInstances(rigExplore(game(), 0, weapons, 'ma-048#1'), [...weapons, 'ma-002#1']);
    const withZombie: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: ['ma-002#1'] } : p)),
    };
    const after = applyAction(withZombie, { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    expect(after.seats[0]?.attached ?? []).not.toContain('ma-048#1');
  });

  test('without a Zombie attached 45 damage defeats it (40 HP)', () => {
    const s = withInstances(rigExplore(game(), 0, weapons, 'ma-048#1'), weapons);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    expect(after.seats[0]?.attached ?? []).toContain('ma-048#1');
  });
});

describe('MA-049 Reinforced Licker — "weapons with 0 ammo requirement deal 0 damage"', () => {
  test('a 0-ammo weapon contributes no damage', () => {
    // Knife (0 ammo, 5) + Handgun (20 ammo, 10) = 15 without the effect.
    // The Licker zeroes the knife -> 10, which is below the rigged 12 HP.
    const s = withInstances(rigExplore(game(), 0, ['we-004#1', 'we-009#1'], 'ma-049#1'), ['we-004#1', 'we-009#1']);
    const tuned: GameState = {
      ...s,
      cardDefs: { ...s.cardDefs, 'ma-049': { ...s.cardDefs['ma-049']!, hp: 12 } },
    };
    const after = applyAction(tuned, { type: 'explore', seat: 0, weapons: ['we-004#1', 'we-009#1'], exploreCount: 1 });
    expect(after.seats[0]?.attached ?? []).not.toContain('ma-049#1');
  });
});

describe('MA-054o Kevlar Jacket — attach, then prevent damage', () => {
  test('taking it attaches it to the character', () => {
    const s = rigExplore(game(), 0, ['we-009#1'], 'ma-054o#1');
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const taken = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(taken.seats[0]?.attached ?? []).toContain('ma-054o#1');
  });

  test('the jacket absorbs damage and moves to the bottom of the Mansion', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-045#1'), ['we-009#1', 'ma-054o#1']);
    const withJacket: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: ['ma-054o#1'] } : p)),
    };
    const hpBefore = withJacket.seats[0]!.hp;
    const after = applyAction(withJacket, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(after.seats[0]?.hp).toBe(hpBefore);
    expect(after.seats[0]?.attached ?? []).not.toContain('ma-054o#1');
    expect(after.mansionBottom).toContain('ma-054o#1');
  });
});

describe('MA-055o Antivirus — decrease Infection Level, then bottom or remove', () => {
  test('at infection 6+ it offers a decrease and then a fate choice', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-055o#1'), ['we-009#1']);
    const withInfection: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0
        ? { ...p, infectionCards: ['in-001#1', 'in-001#2', 'in-001#3', 'in-001#4', 'in-001#5', 'in-001#6'] }
        : p)),
    };
    const explored = applyAction(withInfection, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    const decrease = explored.prompts.find(p => p.payload?.kind === 'antivirusDecrease');
    expect(decrease).toBeDefined();
    if (decrease === undefined) return;
    const decreased = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: decrease.id, option: 0 });
    expect(decreased.seats[0]?.infectionCards ?? []).toHaveLength(3);
    const fate = decreased.prompts.find(p => p.payload?.kind === 'antivirusFate');
    expect(fate).toBeDefined();
    if (fate === undefined) return;
    const removedCard = applyAction(decreased, { type: 'chooseOption', seat: 0, promptId: fate.id, option: 1 });
    expect(removedCard.removed).toContain('ma-055o#1');
  });

  test('below infection 6 no decrease is offered', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-055o#1'), ['we-009#1']);
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(explored.prompts.find(p => p.payload?.kind === 'antivirusDecrease')).toBeUndefined();
    expect(explored.prompts.find(p => p.payload?.kind === 'antivirusFate')).toBeDefined();
  });
});

describe('MA-056o / MA-057o traps', () => {
  test('Laser Trap deals 20 per distinct card type in the play area, then is removed', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-056o#1'), ['we-009#1', 'am-001#1']);
    const withTypes: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, playArea: ['am-001#1'] } : p)),
    };
    // Play area after the explore: Handgun (weapon) + Ammo x10 (ammunition) = 2 types -> 40 damage.
    const hpBefore = withTypes.seats[0]!.hp;
    const after = applyAction(withTypes, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(after.seats[0]?.hp).toBe(Math.max(hpBefore - 40, 0));
    expect(after.removed).toContain('ma-056o#1');
  });

  test('Rock Trap deals 10 per Action card in the play area, then is removed', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-057o#1'), ['we-009#1', 'ac-001#1']);
    const withAction: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, playArea: ['ac-001#1'] } : p)),
    };
    const hpBefore = withAction.seats[0]!.hp;
    const after = applyAction(withAction, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(after.seats[0]?.hp).toBe(Math.max(hpBefore - 10, 0));
    expect(after.removed).toContain('ma-057o#1');
  });
});
