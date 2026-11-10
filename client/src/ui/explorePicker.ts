import type { Action, GameState } from '@re/game-core';
import {
  enumerateLegalActions,
  explorableWeapons,
  canReuseWeapon,
  remainingWeaponUses,
  exploreDamage,
  grantedExploresFor,
  requiredAmmoForWeapons,
  isPartnerWeapon,
  leaderAbilities,
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
export function exploreWeaponOptions(
  state: GameState,
  seat: number,
  leader?: 'main' | 'partner',
): readonly ExploreWeaponOption[] {
  const abilities = leaderAbilities(state, seat, leader ?? 'main');
  return explorableWeapons(state, seat).map(instanceId => {
    const def = defForInstance(state, instanceId);
    return {
      instanceId,
      name: def?.name ?? instanceId,
      damage: def?.type === 'weapon' ? def.damage ?? 0 : 0,
      ammo: requiredAmmoForWeapons(state, seat, [instanceId], wid => defForInstance(state, wid) ?? undefined, abilities),
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

/**
 * The leader a seat may actually field. A dead Partner cannot lead, so a
 * stored 'partner' selection falls back to the Main character — otherwise the
 * picker prices the combo with the (now empty) Partner abilities and every
 * explore is sent as `leader: 'partner'`, which validate rejects with
 * "explore: no partner". Pure, so the fallback is unit-testable.
 */
export function resolveExploreLeader(
  state: GameState,
  seat: number,
  leader: 'main' | 'partner',
): 'main' | 'partner' {
  return state.seats[seat]?.partnerInstanceId === undefined ? 'main' : leader;
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
export function bestExploreCombo(
  state: GameState,
  seat: number,
  leader?: 'main' | 'partner',
): readonly string[] | null {
  const legal = legalExplores(state, seat);
  if (legal.length === 0) return null;
  const abilities = leaderAbilities(state, seat, leader ?? 'main');
  const damageOf = (ids: readonly string[]): number =>
    ids.reduce((sum, id) => {
      const def = defForInstance(state, id);
      return sum + (def !== null && def.type === 'weapon' ? def.damage ?? 0 : 0);
    }, 0);
  const ammoOf = (ids: readonly string[]): number =>
    requiredAmmoForWeapons(state, seat, ids, wid => defForInstance(state, wid) ?? undefined, abilities);
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
 *  never more than the Mansion can reveal). The pool includes the Explores the
 *  SELECTED weapons grant this turn, so a weapon like the Pump-Action Shotgun
 *  can have its "+1 Explore" spent in the same action (revealing two cards at
 *  once) or saved for a later, separate explore. */
export function exploreCountOptions(
  state: GameState,
  seat: number,
  weaponIds: readonly string[] = [],
): readonly number[] {
  const player = state.seats[seat];
  if (player === undefined) return [1];
  const mansionSize = state.mansionDeck.length + state.mansionBottom.length;
  const granted = grantedExploresFor(weaponIds.map(id => defForInstance(state, id) ?? undefined));
  const max = Math.max(1, Math.min(player.exploresLeft + granted, mansionSize));
  const out: number[] = [];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}

/** The Explores the currently selected weapons grant this turn. */
export function grantedExploresForSelection(state: GameState, weaponIds: readonly string[]): number {
  return grantedExploresFor(weaponIds.map(id => defForInstance(state, id) ?? undefined));
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
  leader?: 'main' | 'partner',
): ComboEvaluation {
  const who = leader ?? 'main';
  const abilities = leaderAbilities(state, seat, who);
  const damage = exploreDamage(state, seat, weaponIds, who);
  const ammo = requiredAmmoForWeapons(state, seat, weaponIds, wid => defForInstance(state, wid) ?? undefined, abilities);

  // Legality is checked against the SELECTED leader: a combo that is only
  // affordable because of the Partner's abilities must not read as illegal
  // while the Main leads, and vice versa. The empty selection is the unarmed
  // explore, which the engine enumerates whenever exploring is possible.
  const isLegal = legalExplores(state, seat).some(e =>
    (e.leader ?? 'main') === who && comboKey(e.weapons, e.exploreCount) === comboKey(weaponIds, exploreCount));
  if (isLegal) {
    return { damage, ammo, legal: true, reason: null };
  }
  if (weaponIds.length === 0) {
    return { damage: 0, ammo: 0, legal: false, reason: 'Select at least one weapon.' };
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
  const granted = grantedExploresFor(weaponIds.map(id => defForInstance(state, id) ?? undefined));
  if (player !== undefined && exploreCount > player.exploresLeft + granted) {
    return {
      damage,
      ammo,
      legal: false,
      reason: `Not enough explores — needs ${exploreCount}, you have ${player.exploresLeft}${granted > 0 ? ` (+${granted} from the selected weapons)` : ''}.`,
    };
  }
  return { damage, ammo, legal: false, reason: 'That weapon combination is not legal.' };
}
