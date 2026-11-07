import { describe, test, expect } from 'vitest';
import { setup } from './game';
import { applyAction } from './actions';
import { ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '../data/cards';
import type { GameState } from '../types';

/**
 * The last effect kinds that had no engine behaviour: MA-025 Duvalia,
 * MA-030 Cephalo, MA-036 Reaper, WE-028 Stun Rod, IN-002 Virulent Frenzy and
 * IN-004 Slough Armor. (AC-049 Battle Hardened was already handled through its
 * `ac049Move` / `ac049RemoveXp` prompts.)
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

describe('MA-030 Cephalo — "When defeated, choose a player. That player must explore on his next turn."', () => {
  test('defeating it offers the choice and sets mustExplore', () => {
    const weapons = ['we-009#1', 'we-009#2', 'we-009#3'];
    const s = withInstances(rigExplore(game(), 0, weapons, 'ma-030#1'), weapons);
    const after = applyAction(s, { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    const prompt = after.prompts.find(p => p.payload?.kind === 'cephaloChoosePlayer');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const resolved = applyAction(after, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(resolved.seats[1]?.mustExplore).toBe(true);
    expect(resolved.seats[0]?.mustExplore).toBeFalsy();
  });
});

describe('MA-036 Reaper — "If not defeated with damage equal to its health, trash the highest-cost card attached to your partner"', () => {
  const partnerCards = ['we-025#1', 'ac-001#1']; // costs 40 and 30

  function reaperState(weapons: readonly string[]): GameState {
    const s = withInstances(rigExplore(game(), 0, weapons, 'ma-036#1'), [...weapons, ...partnerCards]);
    return {
      ...s,
      seats: s.seats.map((p, i) => (i === 0
        ? { ...p, partnerInstanceId: 'ch-002#1', partnerAttached: [...partnerCards] }
        : p)),
    };
  }

  test('an exact defeat (damage === health) trashes nothing', () => {
    // Knife (5) + 3 Handguns (30) = 35 == the Reaper's 35 health.
    const weapons = ['we-004#1', 'we-009#1', 'we-009#2', 'we-009#3'];
    const after = applyAction(reaperState(weapons), { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    expect(after.seats[0]?.partnerAttached ?? []).toEqual(partnerCards);
    expect(after.removed).not.toContain('we-025#1');
  });

  test('an overkill defeat trashes the partner\'s highest-cost card', () => {
    // Knife (5) + 4 Handguns (40) = 45 > 35.
    const weapons = ['we-004#1', 'we-009#1', 'we-009#2', 'we-009#3', 'we-009#4'];
    const after = applyAction(reaperState(weapons), { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    expect(after.removed).toContain('we-025#1');
    expect(after.seats[0]?.partnerAttached ?? []).toEqual(['ac-001#1']);
  });

  test('failing to defeat it at all also trashes the highest-cost card', () => {
    // Two Handguns = 20 < 35.
    const weapons = ['we-009#1', 'we-009#2'];
    const after = applyAction(reaperState(weapons), { type: 'explore', seat: 0, weapons, exploreCount: 1 });
    expect(after.removed).toContain('we-025#1');
    expect(after.seats[0]?.attached ?? []).not.toContain('ma-036#1');
  });
});

describe('MA-025 Duvalia — "When this infected kills a character, the player with the most decorations gains five Ammo x 10 cards"', () => {
  test('a kill grants 5 Ammo x10 to the most-decorated player', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-025#1'), ['we-009#1']);
    const rigged: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 30 } : { ...p, decorations: 9 })),
    };
    const after = applyAction(rigged, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    const ammo = (after.seats[1]?.discard ?? []).filter(id => after.cards[id]?.cardId === 'am-001');
    expect(ammo.length).toBe(5);
  });

  test('no kill, no reward', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-025#1'), ['we-009#1']);
    const rigged: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 120 } : { ...p, decorations: 9 })),
    };
    const after = applyAction(rigged, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    const ammo = (after.seats[1]?.discard ?? []).filter(id => after.cards[id]?.cardId === 'am-001');
    expect(ammo.length).toBe(0);
  });
});

describe('WE-028 Stun Rod — "move one of those infected with 20 or less health to the top of the mansion"', () => {
  test('the chosen Infected goes to the top of the Mansion', () => {
    const s = withInstances(game(), ['ma-001#1']);
    const rigged: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: ['ma-001#1'] } : p)),
      prompts: [{
        id: 'p1',
        seat: 0,
        text: 'Stun Rod',
        options: ['ma-001#1', 'Decline'],
        payload: { kind: 'stunRodChooseInfected' },
      }],
    };
    const after = applyAction(rigged, { type: 'chooseOption', seat: 0, promptId: 'p1', option: 0 });
    expect(after.mansionDeck[0]).toBe('ma-001#1');
    expect(after.seats[0]?.attached ?? []).not.toContain('ma-001#1');
  });
});

describe('IN-002 Virulent Frenzy — "Look at the top three cards of your inventory. Trash all non-infection cards. Move the rest to the top in any order"', () => {
  test('non-infection cards are trashed and the Infection cards can be ordered on top', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-009#1'], 'ma-001#1'), ['we-009#1', 'in-002#1', 'in-007#1', 'am-001#1']);
    const rigged: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0
        ? {
            ...p,
            isInfectedCharacter: true,
            characterInstanceId: 'ch-033#1',
            hp: 140,
            hand: ['in-002#1'],
            inventory: ['am-001#1', 'in-007#1', 'we-009#1', ...p.inventory],
          }
        : p)),
    };
    const after = applyAction(rigged, { type: 'attack', seat: 0, targetSeat: 1, infectionCardIds: ['in-002#1'] });
    expect(after.removed).toContain('am-001#1');
    expect(after.removed).toContain('we-009#1');
    const prompt = after.prompts.find(p => p.payload?.kind === 'virulentFrenzyOrder');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const ordered = applyAction(after, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(ordered.seats[0]?.inventory[0]).toBe('in-007#1');
  });
});

describe('IN-004 Slough Armor — "When your infected character is attacked, you may discard this card from your hand to reduce the damage by 20"', () => {
  test('an attacked Infected Character discards it and the damage drops by 20', () => {
    const s = withInstances(rigExplore(game(), 0, ['we-030#1'], 'ma-001#1'), ['we-030#1', 'in-004#1']);
    const rigged: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 1
        ? { ...p, isInfectedCharacter: true, characterInstanceId: 'ch-033#1', hp: 100, hand: ['in-004#1'] }
        : p)),
    };
    const hpBefore = rigged.seats[1]!.hp;
    const after = applyAction(rigged, { type: 'attack', seat: 0, targetSeat: 1, weaponInstanceId: 'we-030#1' });
    // Hand Cannon deals 80; Slough Armor reduces it by 20.
    expect(after.seats[1]?.hp).toBe(hpBefore - 60);
    expect(after.seats[1]?.hand ?? []).not.toContain('in-004#1');
    expect(after.seats[1]?.discard).toContain('in-004#1');
  });
});
