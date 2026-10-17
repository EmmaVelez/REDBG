import type { CardDef, WeaponEffect, InfectedEffect, GameState } from '../types';
import { characterAbilities, ammoReqForWeapon, passiveDamageBonus } from './abilities';

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
  }));
  const abilityDamage = passiveDamageBonus(abilities, defs, 1);
  return computeDamage({
    weapons,
    ammo: player.turnAmmo,
    bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage,
  });
}

export type ExploreOutcome =
  | { readonly kind: 'defeated'; readonly decorations: number }
  | { readonly kind: 'notDefeated'; readonly damageTaken: number; readonly shuffleBack: boolean }
  | { readonly kind: 'nonInfected'; readonly cardId: string }
  | { readonly kind: 'insufficientAmmo'; readonly required: number; readonly available: number };

export function resolveExplore(params: { readonly weapons: readonly ExploreWeapon[]; readonly ammo: number; readonly bonusDamage: number; readonly revealed: CardDef; readonly damageReduction?: number }): ExploreOutcome {
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
