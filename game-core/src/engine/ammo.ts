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

/**
 * Why an X-ammo allocation (Gatling Gun et al.) is not legal, or null when it
 * is. Shared by `validateAction` and the client's picker preview so the server
 * and the UI can never disagree about what an allocation means.
 */
export function xAmmoAllocationError(
  state: GameState,
  weaponIds: readonly string[],
  ammoByWeapon?: Readonly<Record<string, number>>,
): string | null {
  for (const [id, amount] of Object.entries(ammoByWeapon ?? {})) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    const name = def?.name ?? id;
    if (def?.xAmmo !== true) return `${name} cannot take an Ammo allocation.`;
    if (!weaponIds.includes(id)) return `${name} is not part of this explore.`;
    if (!Number.isInteger(amount) || amount < 0) return 'Ammo allocation must be a whole, non-negative number.';
    if (amount > (def.ammoCap ?? Infinity)) return `${name} is capped at ${def.ammoCap} Ammo.`;
  }
  return null;
}

/** Total Ammo Requirement for an explore's weapon set. */
export function requiredAmmoForExplore(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
  abilities?: readonly CharacterAbility[],
  /**
   * Ammo the player allocated to each `xAmmo` weapon (Gatling Gun et al.).
   * For those the allocation IS both the cost and the damage, so it replaces
   * the printed `ammoReq` (which is 0 on an X weapon). Omitted means 0.
   */
  ammoByWeapon?: Readonly<Record<string, number>>,
): number {
  return weaponIds.reduce((sum, id) => {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.xAmmo === true) {
      return sum + Math.min(ammoByWeapon?.[id] ?? 0, def.ammoCap ?? Infinity);
    }
    return sum + exploreAmmoReq(state, seat, id, weaponIds.length, abilities);
  }, 0);
}
