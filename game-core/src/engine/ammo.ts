import type { GameState } from '../types';
import {
  characterAbilities,
  ammoReqForWeapon,
  singleWeaponAmmoDiscount,
  chosenWeaponTypeAmmoDiscount,
  effectiveWeaponTags,
} from './abilities';
import { activeSkillEffects } from './skill';

/**
 * Mercenaries: the Ammo Requirement of one weapon for an explore, after every
 * printed modifier:
 * - character abilities (Leon/Sheva ammoReqReduction, Chris single-weapon and
 *   chosen-type discounts)
 * - Skill System discounts (SK-019 named weapon type, SK-028 pistols)
 * - Claire Redfield (Mercenaries) L1: all weapons -N Ammo this turn
 * - Jill Valentine (Mercenaries) L1: all weapons +N Ammo this turn
 * Never below 0.
 */
export function exploreAmmoReq(
  state: GameState,
  seat: number,
  weaponId: string,
  weaponCount: number,
): number {
  const player = state.seats[seat];
  const inst = state.cards[weaponId];
  const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
  const abilities = characterAbilities(state, seat);

  let req = ammoReqForWeapon(abilities, def, effectiveWeaponTags(state, seat, weaponId));
  if (weaponCount === 1) req -= singleWeaponAmmoDiscount(abilities);
  const typeDiscount = chosenWeaponTypeAmmoDiscount(abilities);
  if (def?.weaponType !== undefined && (player?.chrisAmmoDiscountTypes ?? []).includes(def.weaponType)) {
    req -= typeDiscount;
  }

  // Skill System ammo discounts.
  const skills = activeSkillEffects(state, seat);
  for (const e of skills) {
    if (e.kind === 'pistolAmmoDiscount' && (def?.weaponTags ?? []).includes('pistol')) {
      req -= e.amount;
    }
    if (e.kind === 'nameWeaponTypeAmmoDiscount' && def?.weaponType !== undefined &&
        (player?.skillAmmoDiscountTypes ?? []).includes(def.weaponType)) {
      req -= e.amount;
    }
  }

  // Claire Redfield (Mercenaries) L1: all weapons -N Ammo this turn.
  req -= player?.allWeaponsAmmoDiscountThisTurn ?? 0;
  // Jill Valentine (Mercenaries) L1: all weapons +N Ammo this turn.
  req += player?.ammoReqIncreaseThisTurn ?? 0;

  return Math.max(req, 0);
}

/** Total Ammo Requirement for an explore's weapon set. */
export function requiredAmmoForExplore(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
): number {
  return weaponIds.reduce((sum, id) => sum + exploreAmmoReq(state, seat, id, weaponIds.length), 0);
}
