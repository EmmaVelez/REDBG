import type { CardDef, GameState } from '../types';
import { makeRng, nextInt, shuffle } from '../util/rng';

/**
 * Custom-card-line infected helpers.
 *
 * CI-009 "Rachael Foley (First Encounter)" / MA-000 "Rachael Foley (ooze)" —
 * CI-009 soaks 10 damage per "Ammo x10" in the exploring player's discard pile
 * and shuffles a fresh Ooze into the Mansion when it is defeated; the Ooze is
 * shuffled straight back whenever it is defeated with 80 or less damage.
 *
 * CI-001 "Oscar - Zombie Elephant" — when he is not defeated he tramples the
 * exploring Character, trashing the highest-Damage Weapon(s) they are using.
 *
 * Combat modifiers (the damage soak) are applied inside
 * `resolveExplore` / `resolveMultiExplore`; everything here is applied by the
 * explore reducer, which owns the attached list and the Mansion deck.
 */

/** How many "Ammo x10" cards (ammunition worth 10 Ammo) sit in the seat's discard pile. */
export function ammoX10CountInDiscard(state: GameState, seat: number): number {
  const player = state.seats[seat];
  if (player === undefined) return 0;
  let count = 0;
  for (const id of player.discard) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.type === 'ammunition' && (def.bonuses?.ammo ?? 0) === 10) count += 1;
  }
  return count;
}

/** MA-000: defeated with `damage` or less, it is shuffled back into the Mansion. */
export function oozeShufflesBackOnDefeat(def: CardDef | undefined, damage: number): boolean {
  return (def?.infectedEffects ?? []).some(
    e => e.kind === 'onDefeatShuffleBackIfDamageAtMost' && damage <= e.maxDamage,
  );
}

/** CI-003: the per-player "Ammo x10" grant carried by this Infected's reveal. */
export function saddlerAmmoGrantPerPlayer(def: CardDef | undefined): number {
  const e = (def?.infectedEffects ?? []).find(x => x.kind === 'onRevealEachPlayerGainsAmmoX10');
  return e !== undefined && e.kind === 'onRevealEachPlayerGainsAmmoX10' ? e.count : 0;
}

/** Shuffle an existing instance into the Mansion, threading the RNG state. */
export function shuffleIntoMansion(state: GameState, instanceId: string): GameState {
  const mixed = shuffle(makeRng(state.rngState), [...state.mansionDeck, instanceId]);
  return { ...state, mansionDeck: mixed.value, rngState: mixed.rng.s };
}

/**
 * CI-009 / CI-003 defeat: create a fresh copy of `cardId` and shuffle it into
 * the Mansion. No-op when the def is not in this game (the room did not bring
 * the linked card in).
 */
export function shuffleCopyIntoMansion(state: GameState, cardId: string): GameState {
  if (state.cardDefs[cardId] === undefined) return state;
  let n = 0;
  let instanceId = `${cardId}#m${state.version}`;
  while (state.cards[instanceId] !== undefined) {
    n += 1;
    instanceId = `${cardId}#m${state.version}-${n}`;
  }
  const cards = {
    ...state.cards,
    [instanceId]: { instanceId, cardId, location: { zone: 'mansionDeck' as const, index: 0 } },
  };
  return shuffleIntoMansion({ ...state, cards }, instanceId);
}

/**
 * CI-001 Oscar: trash the highest-Damage Weapon(s) the exploring Character is
 * using. Ties are all trashed ("Weapon(s)"). The weapons are pulled from the
 * seat's zones and the trashed ids go to `removed`.
 */
export function trashHighestDamageUsedWeapons(state: GameState, weaponIds: readonly string[]): GameState {
  // A weapon already trashed by its own effect (WE-008 Rocket Launcher) is no
  // longer "being used" — and must not be added to `removed` twice.
  const unique = [...new Set(weaponIds)].filter(id => !state.removed.includes(id));
  let max = -1;
  for (const id of unique) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.type !== 'weapon') continue;
    max = Math.max(max, def.damage ?? 0);
  }
  if (max < 0) return state;
  const toTrash = unique.filter(id => {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    return def?.type === 'weapon' && (def.damage ?? 0) === max;
  });
  if (toTrash.length === 0) return state;
  const trash = new Set(toTrash);
  return {
    ...state,
    seats: state.seats.map(s => ({
      ...s,
      hand: s.hand.filter(id => !trash.has(id)),
      playArea: s.playArea.filter(id => !trash.has(id)),
      discard: s.discard.filter(id => !trash.has(id)),
    })),
    removed: [...state.removed, ...toTrash],
  };
}

/**
 * TUA-001 Tyrant Ultimate Abyss: roll a d6 on reveal for a random effect.
 * Returns the HP bonus to apply to the infected and any weapon type to disable.
 */
export function tyrantUltimateAbyssRoll(
  state: GameState,
): { hpBonus: number; disabledWeaponType: string | undefined; rngState: number } {
  const { value, rng } = nextInt(makeRng(state.rngState), 6);
  const roll = value + 1; // 1-6
  // 1: +20 Health, 6: -20 Health, 2-4: disable weapon type, 5: no effect
  if (roll === 1) return { hpBonus: 20, disabledWeaponType: undefined, rngState: rng.s };
  if (roll === 6) return { hpBonus: -20, disabledWeaponType: undefined, rngState: rng.s };
  if (roll === 2) return { hpBonus: 0, disabledWeaponType: 'pistol', rngState: rng.s };
  if (roll === 3) return { hpBonus: 0, disabledWeaponType: 'shotgun', rngState: rng.s };
  if (roll === 4) return { hpBonus: 0, disabledWeaponType: 'machineGun', rngState: rng.s };
  return { hpBonus: 0, disabledWeaponType: undefined, rngState: rng.s };
}
