import type { CardDef, WeaponEffect, InfectedEffect } from '../types';

export interface ExploreWeapon {
  readonly damage: number;
  readonly ammoReq: number;
  readonly weaponEffects?: readonly WeaponEffect[];
}

export interface DamageParams {
  readonly weapons: readonly ExploreWeapon[];
  readonly ammo: number;
  readonly bonusDamage: number;
}

export function requiredAmmo(weapons: readonly ExploreWeapon[]): number {
  return weapons.reduce((sum, weapon) => sum + weapon.ammoReq, 0);
}

export function computeDamage(params: DamageParams): number {
  const { weapons, ammo, bonusDamage } = params;
  let damage = weapons.reduce((sum, weapon) => sum + weapon.damage, 0) + bonusDamage;

  for (const weapon of weapons) {
    if (weapon.weaponEffects) {
      for (const effect of weapon.weaponEffects) {
        if (effect.kind === 'plusDamagePerExtraWeapon' && weapons.length > 1) {
          damage += effect.amount;
          break;
        }
        if (effect.kind === 'plusDamageIfAmmoAbove' && ammo > effect.threshold) {
          damage += effect.amount;
        }
      }
    }
  }

  return damage;
}

export type ExploreOutcome =
  | { readonly kind: 'defeated'; readonly decorations: number }
  | { readonly kind: 'notDefeated'; readonly damageTaken: number; readonly shuffleBack: boolean }
  | { readonly kind: 'nonInfected'; readonly cardId: string }
  | { readonly kind: 'insufficientAmmo'; readonly required: number; readonly available: number };

export function resolveExplore(params: { readonly weapons: readonly ExploreWeapon[]; readonly ammo: number; readonly bonusDamage: number; readonly revealed: CardDef }): ExploreOutcome {
  const { weapons, ammo, bonusDamage, revealed } = params;
  const required = requiredAmmo(weapons);

  if (ammo < required) {
    return { kind: 'insufficientAmmo', required, available: ammo };
  }

  const damage = computeDamage({ weapons, ammo, bonusDamage });

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
    return { kind: 'notDefeated', damageTaken: revealed.attack ?? 0, shuffleBack };
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
