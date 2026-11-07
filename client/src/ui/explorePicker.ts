import type { Action, GameState } from '@re/game-core';
import {
  enumerateLegalActions,
  explorableWeapons,
  canReuseWeapon,
  remainingWeaponUses,
  exploreDamage,
  requiredAmmoForWeapons,
  isPartnerWeapon,
} from '@re/game-core';
import { defForInstance } from './cards';

/**
 * Pure decision logic for the Explore weapon picker.
 *
 * Everything here is derived from the engine's own legal-action enumeration,
 * so the picker can never offer a combination the server would reject. Kept
 * out of the component so it is unit-testable without a DOM.
 */

type ExploreAction = Extract<Action, { type: 'explore' }>;

export interface ExploreWeaponOption {
  readonly instanceId: string;
  readonly name: string;
  /** Base card damage (character passives are added by the engine at resolve). */
  readonly damage: number;
  /** Ammo this weapon costs for THIS seat, after ammoReqReduction abilities. */
  readonly ammo: number;
  /** True when the weapon sits in the play area and an ability lets it be
   *  used again this turn (Leon L2 pistolsTwicePerTurn). */
  readonly reusable: boolean;
  /** Uses still available this turn beyond those already spent. */
  readonly remainingUses: number;
  /** True when the weapon is attached to the seat's Partner (Alliance). */
  readonly partner: boolean;
}

/** Weapons the seat may use in an explore right now, with display metadata. */
export function exploreWeaponOptions(state: GameState, seat: number): readonly ExploreWeaponOption[] {
  return explorableWeapons(state, seat).map(instanceId => {
    const def = defForInstance(state, instanceId);
    return {
      instanceId,
      name: def?.name ?? instanceId,
      damage: def?.type === 'weapon' ? def.damage ?? 0 : 0,
      ammo: requiredAmmoForWeapons(state, seat, [instanceId], wid => defForInstance(state, wid) ?? undefined),
      reusable: canReuseWeapon(state, seat, instanceId),
      remainingUses: remainingWeaponUses(state, seat, instanceId),
      partner: isPartnerWeapon(state, seat, instanceId),
    };
  });
}

/** The seat's legal explore actions, in enumeration order. */
export function legalExplores(state: GameState, seat: number): readonly ExploreAction[] {
  return enumerateLegalActions(state, seat).filter(
    (a): a is ExploreAction => a.type === 'explore' && a.seat === seat,
  );
}

/** Stable key for a weapon-id set + explore count, so selections can be
 *  compared to legal combos. */
function comboKey(weaponIds: readonly string[], exploreCount: number): string {
  return `${exploreCount}:${[...weaponIds].sort().join('|')}`;
}

/**
 * The fullest legal combo — most weapons, then most damage, then least ammo.
 * This is the default selection and the one-click Explore target.
 */
export function bestExploreCombo(state: GameState, seat: number): readonly string[] | null {
  const legal = legalExplores(state, seat);
  if (legal.length === 0) return null;
  const damageOf = (ids: readonly string[]): number =>
    ids.reduce((sum, id) => {
      const def = defForInstance(state, id);
      return sum + (def !== null && def.type === 'weapon' ? def.damage ?? 0 : 0);
    }, 0);
  const ammoOf = (ids: readonly string[]): number =>
    requiredAmmoForWeapons(state, seat, ids, wid => defForInstance(state, wid) ?? undefined);
  const best = legal.reduce<ExploreAction>((b, a) => {
    if (a.weapons.length !== b.weapons.length) return a.weapons.length > b.weapons.length ? a : b;
    const d = damageOf(a.weapons);
    const bd = damageOf(b.weapons);
    if (d !== bd) return d > bd ? a : b;
    return ammoOf(a.weapons) < ammoOf(b.weapons) ? a : b;
  }, legal[0]!);
  return best.weapons;
}

/** Explore counts the player may pick for one explore action (1..pool, and
 *  never more than the Mansion can reveal). */
export function exploreCountOptions(state: GameState, seat: number): readonly number[] {
  const player = state.seats[seat];
  if (player === undefined) return [1];
  const mansionSize = state.mansionDeck.length + state.mansionBottom.length;
  const max = Math.max(1, Math.min(player.exploresLeft, mansionSize));
  const out: number[] = [];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}

export interface ComboEvaluation {
  /** Damage the engine would deal with this exact weapon set. */
  readonly damage: number;
  /** Ammo the engine would charge for this exact weapon set. */
  readonly ammo: number;
  readonly legal: boolean;
  /** Human-readable reason when illegal, else null. */
  readonly reason: string | null;
}

/** Evaluate an arbitrary weapon selection against the engine's legal set. */
export function evaluateExploreCombo(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
  exploreCount = 1,
): ComboEvaluation {
  const damage = exploreDamage(state, seat, weaponIds);
  const ammo = requiredAmmoForWeapons(state, seat, weaponIds, wid => defForInstance(state, wid) ?? undefined);

  if (weaponIds.length === 0) {
    return { damage: 0, ammo: 0, legal: false, reason: 'Select at least one weapon.' };
  }
  const isLegal = legalExplores(state, seat).some(e => comboKey(e.weapons, e.exploreCount) === comboKey(weaponIds, exploreCount));
  if (isLegal) {
    return { damage, ammo, legal: true, reason: null };
  }
  const player = state.seats[seat];
  if (player !== undefined && ammo > player.turnAmmo) {
    return {
      damage,
      ammo,
      legal: false,
      reason: `Not enough ammo — needs ${ammo}, you have ${player.turnAmmo}.`,
    };
  }
  if (player !== undefined && exploreCount > player.exploresLeft) {
    return {
      damage,
      ammo,
      legal: false,
      reason: `Not enough explores — needs ${exploreCount}, you have ${player.exploresLeft}.`,
    };
  }
  return { damage, ammo, legal: false, reason: 'That weapon combination is not legal.' };
}
