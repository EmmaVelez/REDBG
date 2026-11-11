import type { CharacterAbility, GameState } from '../types';
import {
  characterAbilities,
  partnerAbilities,
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
  /**
   * Abilities to price the weapon with. Callers that resolve a leader pass the
   * leading character's abilities (partner-led explores use the Partner's);
   * omitted means the Main character's, which is every pre-partner call site.
   */
  abilities?: readonly CharacterAbility[],
): number {
  const player = state.seats[seat];
  const inst = state.cards[weaponId];
  const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
  // Partner-attached weapons use the Partner's abilities for ammo discounts,
  // not the leader's abilities. This ensures that if the Partner has an
  // ammoReqReduction ability (e.g., Leon L1 pistols -10), it applies to their
  // own attached weapons.
  const isPartnerAttached = (player?.partnerAttached ?? []).includes(weaponId);
  const abils = abilities ?? (isPartnerAttached ? partnerAbilities(state, seat) : characterAbilities(state, seat));

  let req = ammoReqForWeapon(abils, def, effectiveWeaponTags(state, seat, weaponId));
  if (weaponCount === 1) req -= singleWeaponAmmoDiscount(abils);
  const typeDiscount = chosenWeaponTypeAmmoDiscount(abils);
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
  abilities?: readonly CharacterAbility[],
): number {
  return weaponIds.reduce((sum, id) => sum + exploreAmmoReq(state, seat, id, weaponIds.length, abilities), 0);
}
