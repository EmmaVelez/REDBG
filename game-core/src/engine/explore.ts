import type { CardDef, WeaponEffect, InfectedEffect, GameState, WeaponTag } from '../types';
import { characterAbilities, ammoReqForWeapon, passiveDamageBonus, exploreBigHandBonus, exploreActionsBonus, knifeWeaponsUsedThisTurn } from './abilities';

export interface ExploreWeapon {
  readonly damage: number;
  readonly ammoReq: number;
  readonly weaponEffects?: readonly WeaponEffect[];
  /** Weapon type tags (melee/knife/pistol/...) for tag-scoped effects. */
  readonly tags?: readonly WeaponTag[];
}

export interface DamageParams {
  readonly weapons: readonly ExploreWeapon[];
  readonly ammo: number;
  readonly bonusDamage: number;
  /** Knife-tagged weapons this seat already used in EARLIER explores this
   *  turn (Survival Knife counts "every other Knife Weapon used this turn"). */
  readonly knifeUsesEarlierThisTurn?: number;
}

export function requiredAmmo(weapons: readonly ExploreWeapon[]): number {
  return weapons.reduce((sum, weapon) => sum + weapon.ammoReq, 0);
}

export function computeDamage(params: DamageParams): number {
  const { weapons, ammo, bonusDamage } = params;
  let damage = weapons.reduce((sum, weapon) => sum + weapon.damage, 0) + bonusDamage;

  for (let weaponIndex = 0; weaponIndex < weapons.length; weaponIndex++) {
    const weapon = weapons[weaponIndex];
    if (weapon === undefined) continue;
    if (weapon.weaponEffects) {
      for (const effect of weapon.weaponEffects) {
        if (effect.kind === 'plusDamagePerExtraWeapon' && weapons.length > 1) {
          damage += effect.amount;
          break;
        }
        if (effect.kind === 'plusDamageIfAmmoAbove' && ammo > effect.threshold) {
          damage += effect.amount;
        }
        if (effect.kind === 'plusDamagePerKnifeUsed') {
          // "every OTHER Knife Weapon used this turn": knives in THIS attack
          // except this weapon itself, plus knives from earlier explores.
          const otherKnivesHere = weapons.filter(
            (w, idx) => idx !== weaponIndex && (w.tags ?? []).includes('knife'),
          ).length;
          damage += effect.amount * (otherKnivesHere + (params.knifeUsesEarlierThisTurn ?? 0));
        }
      }
    }
  }

  return damage;
}

/**
 * Total attack damage a player's explore would deal, computed from the state
 * exactly like resolveExplore does (weapon base damage + weapon effects +
 * character turn bonus). `state` must be the PRE-explore state so the turn
 * ammo pool and weaponDamageBonusThisTurn are still intact.
 */
export function exploreDamage(state: GameState, seat: number, weaponIds: readonly string[]): number {
  const player = state.seats[seat];
  if (player === undefined) return 0;
  const abilities = characterAbilities(state, seat);
  const defs = (weaponIds ?? []).map(id => {
    const inst = state.cards[id];
    return inst === undefined ? undefined : state.cardDefs[inst.cardId];
  });
  const weapons: ExploreWeapon[] = defs.map(def => ({
    damage: def?.damage ?? 0,
    ammoReq: ammoReqForWeapon(abilities, def),
    weaponEffects: def?.weaponEffects,
    tags: def?.weaponTags,
  }));
  const abilityDamage =
    passiveDamageBonus(abilities, defs, 1) +
    exploreBigHandBonus(abilities, state.seats) +
    exploreActionsBonus(
      abilities,
      player.playArea.map(id => state.cards[id]?.cardId).map(cid => state.cardDefs[cid ?? '']?.type ?? ''),
      t => t === 'action'
    );
  const starCrossedBonus = state.seats.some(s => s.seat !== seat && (s.partnerAttached ?? []).some(id => {
    const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.id === 'ac-014';
  })) ? 10 : 0;
  return computeDamage({
    weapons,
    ammo: player.turnAmmo,
    knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
    bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus,
  });
}

export type ExploreOutcome =
  | { readonly kind: 'defeated'; readonly decorations: number }
  | { readonly kind: 'notDefeated'; readonly damageTaken: number; readonly shuffleBack: boolean }
  | { readonly kind: 'nonInfected'; readonly cardId: string }
  | { readonly kind: 'insufficientAmmo'; readonly required: number; readonly available: number };

export function resolveExplore(params: { readonly weapons: readonly ExploreWeapon[]; readonly ammo: number; readonly bonusDamage: number; readonly revealed: CardDef; readonly damageReduction?: number; readonly knifeUsesEarlierThisTurn?: number }): ExploreOutcome {
  const { weapons, ammo, bonusDamage, revealed, knifeUsesEarlierThisTurn } = params;
  const required = requiredAmmo(weapons);

  if (ammo < required) {
    return { kind: 'insufficientAmmo', required, available: ammo };
  }

  const damage = computeDamage({ weapons, ammo, bonusDamage, knifeUsesEarlierThisTurn });

  if (revealed.type !== 'infected') {
    return { kind: 'nonInfected', cardId: revealed.id };
  }

  let effective = damage;
  if (revealed.infectedEffects) {
    for (const effect of revealed.infectedEffects) {
      if (effect.kind === 'plusDamagePerFull10AmmoOfAttacker') {
        effective += effect.amount * Math.floor(ammo / 10);
      }
    }
  }

  if (effective >= (revealed.hp ?? 0)) {
    return { kind: 'defeated', decorations: revealed.decorations ?? 0 };
  } else {
    const shuffleBack = revealed.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated') ?? false;
    // PR-001 Chris L1: Infected deal reduced damage to him (never below 0).
    const raw = revealed.attack ?? 0;
    return { kind: 'notDefeated', damageTaken: Math.max(raw - (params.damageReduction ?? 0), 0), shuffleBack };
  }
}

export interface MultiExploreTarget {
  readonly cardId: string;
  readonly hp: number;
  readonly attack: number;
  readonly infectedEffects?: readonly InfectedEffect[];
}

export function resolveMultiExplore(params: { readonly damage: number; readonly revealed: readonly MultiExploreTarget[] }): { readonly defeated: boolean; readonly combinedHp: number; readonly combinedAttack: number; readonly shuffleBackCards: readonly string[] } {
  const { damage, revealed } = params;
  const combinedHp = revealed.reduce((sum, target) => sum + target.hp, 0);
  const combinedAttack = revealed.reduce((sum, target) => sum + target.attack, 0);
  const defeated = damage >= combinedHp;
  const shuffleBackCards = revealed
    .filter(target => target.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated') ?? false)
    .map(target => target.cardId);

  return { defeated, combinedHp, combinedAttack, shuffleBackCards };
}
