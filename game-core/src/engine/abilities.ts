import type { CharacterAbility, GameState, CardDef, WeaponTag } from '../types';
import { abilitiesForLevel } from './characters';

/**
 * Passive character-ability queries (batch 1: damage/ammo/economy passives).
 * Every consumer (validate, apply, enumerate, exploreDamage) reads abilities
 * through these helpers so the rules can never drift between layers.
 *
 * Level gating: abilitiesForLevel returns only abilities at or below the
 * player's current level, so a locked tier contributes nothing.
 */

/** The player's character abilities, already filtered to their level. */
export function characterAbilities(state: GameState, seat: number): readonly CharacterAbility[] {
  const player = state.seats[seat];
  if (player === undefined) return [];
  const inst = state.cards[player.characterInstanceId];
  if (inst === undefined) return [];
  const def = state.cardDefs[inst.cardId];
  if (def === undefined) return [];
  return abilitiesForLevel(def.abilities, player.level);
}

/**
 * Ammo requirement of one weapon for this seat, after ammoReqReduction
 * abilities (Leon L1 pistols -10, Sheva L2 rifles -20). Never below 0.
 */
export function ammoReqForWeapon(abilities: readonly CharacterAbility[], def: CardDef | undefined): number {
  const base = def?.ammoReq ?? 0;
  let reduction = 0;
  for (const ability of abilities) {
    if (ability.kind === 'ammoReqReduction' && (def?.weaponTags ?? []).includes(ability.tag as WeaponTag)) {
      reduction += ability.amount;
    }
  }
  return Math.max(base - reduction, 0);
}

/** Total ammo required for an explore's weapon set (ability-aware). */
export function requiredAmmoForWeapons(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
  defs: (id: string) => CardDef | undefined
): number {
  const abilities = characterAbilities(state, seat);
  return weaponIds.reduce((sum, id) => sum + ammoReqForWeapon(abilities, defs(id)), 0);
}

/**
 * Flat damage bonus from passive abilities for one attack:
 * - weaponTagPlusDamage per matching weapon (Barry L2 magnums +20,
 *   Krauser L2 knives +5)
 * - explosivesPlusDamage per explosive weapon used (Jill L1 +5; FAQ: it
 *   applies to each explosive, including the Grenade)
 * - weaponPlusDamagePerInfectedFought: amount x infectedFought (Chris L2 —
 *   "1 weapon gets +5 per Infected he is fighting"; applied to the total,
 *   equivalent to one weapon receiving it)
 */
export function passiveDamageBonus(
  abilities: readonly CharacterAbility[],
  weaponDefs: readonly (CardDef | undefined)[],
  infectedFought: number
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind === 'weaponTagPlusDamage') {
      for (const def of weaponDefs) {
        if (def !== undefined && (def.weaponTags ?? []).includes(ability.tag)) {
          bonus += ability.amount;
        }
      }
    }
    if (ability.kind === 'explosivesPlusDamage') {
      for (const def of weaponDefs) {
        if (def !== undefined && (def.weaponTags ?? []).includes('explosive')) {
          bonus += ability.amount;
        }
      }
    }
    if (ability.kind === 'weaponPlusDamagePerInfectedFought') {
      bonus += ability.amount * Math.max(infectedFought, 0);
    }
  }
  return bonus;
}

/** Wesker L1: +Gold that turn whenever he Explores. */
export function exploreGoldBonus(abilities: readonly CharacterAbility[]): number {
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'exploreGoldBonus') gold += ability.amount;
  }
  return gold;
}

/**
 * Claire: ammunition cards give extra Ammo (L1) / Gold (L2) when played.
 * Returns the extra pools for one ammo card (0/0 for non-ammo cards or
 * characters without the ability).
 */
export function ammunitionCardBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): { readonly ammo: number; readonly gold: number } {
  if (def?.type !== 'ammunition') return { ammo: 0, gold: 0 };
  let ammo = 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'ammunitionBonus') {
      ammo += ability.ammoAmount;
      gold += ability.goldAmount;
    }
  }
  return { ammo, gold };
}

/**
 * Damage reduction vs Infected attacks for this seat (PR-001 Chris L1: -10).
 * Applied to damageTaken when an explore fails to defeat the Infected.
 */
export function infectedDamageReduction(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce(
    (sum, a) => (a.kind === 'infectedDamageReduction' ? sum + a.amount : sum),
    0
  );
}

/**
 * Damage reduction vs Weapon attacks for this seat (PR-001 Chris L2: -10).
 * No PvP weapon-attack action exists in the engine yet, so this is encoded
 * for completeness and stays dormant until character-vs-character attacks
 * are implemented.
 */
export function weaponDamageReduction(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce(
    (sum, a) => (a.kind === 'weaponDamageReduction' ? sum + a.amount : sum),
    0
  );
}

/** Jill L2: explosive weapons go to discard instead of being trashed. */
export function explosivesGoToDiscard(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'explosivesGoToDiscardInsteadOfTrash');
}

/** True when the weapon def is an explosive (tagged). */
export function isExplosive(def: CardDef | undefined): boolean {
  return def?.type === 'weapon' && (def.weaponTags ?? []).includes('explosive');
}
