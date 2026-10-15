import { flipDown, revive, levelForDecorations, abilitiesForLevel, hasAbilityAtLevel } from './characters';
import type { CharacterState } from './characters';
import type { CharacterAbility } from '../types';

const rev = (items: readonly string[]): string[] => [...items].reverse();

test('flipDown fresh', () => {
  const state: CharacterState = {
    hp: 0,
    maxHp: 100,
    decorations: 1,
    level: 1,
    downed: false,
    dead: false,
    hand: ['a', 'b'],
    discard: ['c'],
    inventory: ['d', 'e'],
  };
  const result = flipDown(state, rev);
  expect(result).toEqual({
    hp: 0,
    maxHp: 100,
    decorations: 1,
    level: 1,
    downed: true,
    dead: false,
    hand: [],
    discard: [],
    inventory: ['c', 'b', 'a', 'e', 'd'],
  });
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('flipDown no-op when already downed', () => {
  const state: CharacterState = {
    hp: -3,
    maxHp: 80,
    decorations: 2,
    level: 1,
    downed: true,
    dead: false,
    hand: ['x'],
    discard: [],
    inventory: ['y'],
  };
  const result = flipDown(state, rev);
  expect(result).toEqual(state);
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('flipDown no-op when dead', () => {
  const state: CharacterState = {
    hp: 0,
    maxHp: 0,
    decorations: 3,
    level: 1,
    downed: true,
    dead: true,
    hand: [],
    discard: [],
    inventory: [],
  };
  const result = flipDown(state, rev);
  expect(result).toEqual(state);
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('revive recovers', () => {
  const state: CharacterState = {
    hp: -2,
    maxHp: 100,
    decorations: 4,
    level: 1,
    downed: true,
    dead: false,
    hand: [],
    discard: [],
    inventory: ['a', 'b', 'c', 'd', 'e', 'f'],
  };
  const result = revive(state);
  expect(result).toEqual({
    hp: 80,
    maxHp: 80,
    decorations: 4,
    level: 1,
    downed: false,
    dead: false,
    hand: [],
    discard: [],
    inventory: ['a', 'b', 'c', 'd', 'e', 'f'],
  });
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('revive death', () => {
  const state: CharacterState = {
    hp: -1,
    maxHp: 15,
    decorations: 0,
    level: 1,
    downed: true,
    dead: false,
    hand: [],
    discard: [],
    inventory: [],
  };
  const result = revive(state);
  expect(result).toEqual({
    hp: 0,
    maxHp: -5,
    decorations: 0,
    level: 1,
    downed: false,
    dead: true,
    hand: [],
    discard: [],
    inventory: [],
  });
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('revive death at exactly 20 maxHp', () => {
  const state: CharacterState = {
    hp: 0,
    maxHp: 20,
    decorations: 0,
    level: 1,
    downed: true,
    dead: false,
    hand: [],
    discard: [],
    inventory: [],
  };
  const result = revive(state);
  expect(result).toEqual({
    hp: 0,
    maxHp: 0,
    decorations: 0,
    level: 1,
    downed: false,
    dead: true,
    hand: [],
    discard: [],
    inventory: [],
  });
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('revive no-op when not downed', () => {
  const state: CharacterState = {
    hp: 50,
    maxHp: 100,
    decorations: 5,
    level: 1,
    downed: false,
    dead: false,
    hand: ['k'],
    discard: ['m'],
    inventory: ['n'],
  };
  const result = revive(state);
  expect(result).toEqual(state);
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('revive no-op when dead', () => {
  const state: CharacterState = {
    hp: 0,
    maxHp: -10,
    decorations: 0,
    level: 1,
    downed: false,
    dead: true,
    hand: [],
    discard: [],
    inventory: [],
  };
  const result = revive(state);
  expect(result).toEqual(state);
  expect(result.hand).not.toBe(state.hand);
  expect(result.discard).not.toBe(state.discard);
  expect(result.inventory).not.toBe(state.inventory);
});

test('levelForDecorations', () => {
  expect(levelForDecorations(4, 3)).toBe(1);
  expect(levelForDecorations(4, 4)).toBe(2);
  expect(levelForDecorations(4, 5)).toBe(2);
  expect(levelForDecorations(undefined, 10)).toBe(1);
  expect(levelForDecorations(2, 1)).toBe(1);
});

test('abilitiesForLevel', () => {
  const abilities: readonly CharacterAbility[] = [
    { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 },
    { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 },
  ];
  expect(abilitiesForLevel(abilities, 1)).toEqual([
    { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 },
  ]);
  expect(abilitiesForLevel(abilities, 2)).toEqual([
    { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 },
    { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 },
  ]);
  expect(abilitiesForLevel(undefined, 2)).toEqual([]);
  expect(abilitiesForLevel([], 1)).toEqual([]);
});

test('hasAbilityAtLevel', () => {
  const abilities: readonly CharacterAbility[] = [
    { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 },
    { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 },
  ];
  expect(hasAbilityAtLevel(abilities, 1, 'weaponPlusDamagePerInfectedFought')).toBe(true);
  expect(hasAbilityAtLevel(abilities, 1, 'explosivesGoToDiscardInsteadOfTrash')).toBe(false);
  expect(hasAbilityAtLevel(abilities, 2, 'weaponPlusDamagePerInfectedFought')).toBe(true);
  expect(hasAbilityAtLevel(abilities, 2, 'explosivesGoToDiscardInsteadOfTrash')).toBe(true);
  expect(hasAbilityAtLevel(undefined, 1, 'generic')).toBe(false);
});
