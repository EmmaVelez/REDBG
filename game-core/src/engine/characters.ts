import type { CharacterAbility } from '../types';

export interface CharacterState {
  readonly hp: number;
  readonly maxHp: number;
  readonly decorations: number;
  readonly level: 1 | 2;
  readonly downed: boolean;
  readonly dead: boolean;
  readonly hand: readonly string[];
  readonly discard: readonly string[];
  readonly inventory: readonly string[];
}

export function flipDown(state: CharacterState, rngShuffle: (items: readonly string[]) => string[]): CharacterState {
  if (state.dead || state.downed) {
    return {
      ...state,
      hand: [...state.hand],
      discard: [...state.discard],
      inventory: [...state.inventory],
    };
  }

  return {
    ...state,
    downed: true,
    hand: [],
    discard: [],
    inventory: rngShuffle([...state.inventory, ...state.hand, ...state.discard]),
  };
}

export function revive(state: CharacterState): CharacterState {
  if (state.dead || !state.downed) {
    return {
      ...state,
      hand: [...state.hand],
      discard: [...state.discard],
      inventory: [...state.inventory],
    };
  }

  const newMaxHp = state.maxHp - 20;

  if (newMaxHp <= 0) {
    return {
      ...state,
      dead: true,
      downed: false,
      maxHp: newMaxHp,
      hp: 0,
      hand: [...state.hand],
      discard: [...state.discard],
      inventory: [...state.inventory],
    };
  }

  return {
    ...state,
    downed: false,
    maxHp: newMaxHp,
    hp: newMaxHp,
    hand: [...state.hand],
    discard: [...state.discard],
    inventory: [...state.inventory],
  };
}

export function levelForDecorations(level2At: number | undefined, decorations: number): 1 | 2 {
  if (level2At === undefined || decorations < level2At) {
    return 1;
  }
  return 2;
}

export function abilitiesForLevel(abilities: readonly CharacterAbility[] | undefined, level: 1 | 2): readonly CharacterAbility[] {
  if (abilities === undefined) {
    return [];
  }
  return abilities.filter(ability => ability.level <= level);
}

export function hasAbilityAtLevel(abilities: readonly CharacterAbility[] | undefined, level: 1 | 2, kind: CharacterAbility['kind']): boolean {
  const abilitiesForCurrentLevel = abilitiesForLevel(abilities, level);
  return abilitiesForCurrentLevel.some(ability => ability.kind === kind);
}
