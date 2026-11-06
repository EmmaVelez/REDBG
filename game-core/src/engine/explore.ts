import type { CardDef, WeaponEffect, InfectedEffect, GameState, WeaponTag, CharacterAbility } from '../types';
import { characterAbilities, ammoReqForWeapon, passiveDamageBonus, exploreBigHandBonus, exploreActionsBonus, knifeWeaponsUsedThisTurn, revealHighHpInfectedBonusDamage, singleWeaponAmmoDiscount, chosenWeaponTypeAmmoDiscount, partnerAttachedDamageBonus } from './abilities';

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
  /** Number of Ammo cards in the play area this turn (Mine Thrower). */
  readonly ammoCardsInPlayArea?: number;
  /** Number of cards in the player's inventory (Broken Butterfly). */
  readonly inventoryCount?: number;
  /** Alias: inventory array. */
  readonly inventory?: readonly unknown[];
  /** Count of weapons in the discard pile that carry each tag (Gangster's Machine Gun). */
  readonly discardWeaponTagCounts?: Readonly<Partial<Record<WeaponTag, number>>>;
  /** Number of Infected battled this turn (Incendiary Grenade). */
  readonly infectedBattledThisTurn?: number;
  /** Claire Redfield (Alliance) L2: multiplies the final damage. */
  readonly damageMultiplier?: number;
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
        if (effect.kind === 'plusDamageIfInventoryAtLeast') {
          const invCount = params.inventoryCount ?? params.inventory?.length ?? 0;
          if (invCount >= effect.threshold) {
            damage += effect.amount;
          }
        }
        if (effect.kind === 'plusDamagePerKnifeUsed') {
          // "every OTHER Knife Weapon used this turn": knives in THIS attack
          // except this weapon itself, plus knives from earlier explores.
          const otherKnivesHere = weapons.filter(
            (w, idx) => idx !== weaponIndex && (w.tags ?? []).includes('knife'),
          ).length;
          damage += effect.amount * (otherKnivesHere + (params.knifeUsesEarlierThisTurn ?? 0));
        }
        if (effect.kind === 'plusDamagePerOtherKnifeUsedThisTurn') {
          const otherKnivesHere = weapons.filter(
            (w, idx) => idx !== weaponIndex && (w.tags ?? []).includes('knife'),
          ).length;
          damage += effect.amount * (otherKnivesHere + (params.knifeUsesEarlierThisTurn ?? 0));
        }
        if (effect.kind === 'plusDamagePerAmmoInPlayArea') {
          damage += effect.amount * (params.ammoCardsInPlayArea ?? 0);
        }
        if (effect.kind === 'plusDamagePerWeaponTagInDiscard') {
          damage += effect.amount * (params.discardWeaponTagCounts?.[effect.tag] ?? 0);
        }
        if (effect.kind === 'plusDamagePerInfectedBattled') {
          damage += effect.amount * (params.infectedBattledThisTurn ?? 0);
        }
      }
    }
  }

  return Math.round(damage * (params.damageMultiplier ?? 1));
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
  const chrisSingleDiscount = (weaponIds?.length ?? 0) === 1 ? singleWeaponAmmoDiscount(abilities) : 0;
  const chrisTypeDiscount = chosenWeaponTypeAmmoDiscount(abilities);
  const chrisTypeDiscountTypes = player.chrisAmmoDiscountTypes ?? [];
  const weapons: ExploreWeapon[] = defs.map(def => ({
    damage: def?.damage ?? 0,
    ammoReq: Math.max(ammoReqForWeapon(abilities, def) - chrisSingleDiscount - (def?.weaponType !== undefined && chrisTypeDiscountTypes.includes(def.weaponType) ? chrisTypeDiscount : 0), 0),
    weaponEffects: def?.weaponEffects,
    tags: def?.weaponTags,
  }));
  const abilityDamage =
    passiveDamageBonus(abilities, defs, 1, player.hand.length) +
    exploreBigHandBonus(abilities, state.seats) +
    exploreActionsBonus(
      abilities,
      player.playArea.map(id => state.cards[id]?.cardId).map(cid => state.cardDefs[cid ?? '']?.type ?? ''),
      t => t === 'action'
    ) +
    partnerAttachedDamageBonus(abilities, player.partnerAttached);
  const starCrossedBonus = state.seats.some(s => s.seat !== seat && (s.partnerAttached ?? []).some(id => {
    const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.id === 'ac-014';
  })) ? 10 : 0;
  // Lonewolf (AC-032): +amount explore damage per card in the discard pile,
  // while its action card is in the play area this turn.
  const perDiscardCardBonus = player.playArea.reduce((sum, id) => {
    const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined;
    return sum + (cd?.actionEffects ?? []).reduce((a, e) =>
      e.kind === 'onExploreWeaponDamagePerDiscardCard' ? a + e.amount * player.discard.length : a, 0);
  }, 0);
  const ammoCardsInPlayArea = player.playArea.map(id => state.cards[id]?.cardId).map(cid => state.cardDefs[cid ?? '']?.type ?? '').filter(t => t === 'ammunition').length;
  const discardWeaponTagCounts: Partial<Record<WeaponTag, number>> = {};
  for (const id of player.discard) {
    const ci = state.cards[id];
    const cd = ci ? state.cardDefs[ci.cardId] : undefined;
    for (const tag of cd?.weaponTags ?? []) {
      discardWeaponTagCounts[tag] = (discardWeaponTagCounts[tag] ?? 0) + 1;
    }
  }
  return computeDamage({
    weapons,
    ammo: player.turnAmmo,
    knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
    ammoCardsInPlayArea,
    inventoryCount: player.inventory.length,
    discardWeaponTagCounts,
    bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + perDiscardCardBonus,
    damageMultiplier: player.damageMultiplierThisTurn ?? 1,
  });
}

export type ExploreOutcome =
  | { readonly kind: 'defeated'; readonly decorations: number }
  | { readonly kind: 'notDefeated'; readonly damageTaken: number; readonly shuffleBack: boolean }
  | { readonly kind: 'nonInfected'; readonly cardId: string }
  | { readonly kind: 'insufficientAmmo'; readonly required: number; readonly available: number };

export function resolveExplore(params: { readonly weapons: readonly ExploreWeapon[]; readonly ammo: number; readonly bonusDamage: number; readonly revealed: CardDef; readonly damageReduction?: number; readonly knifeUsesEarlierThisTurn?: number; readonly attachedInfectedCount?: number; readonly ammoCardsInPlayArea?: number; readonly actionsInPlayArea?: number; readonly inventoryCount?: number; readonly inventory?: readonly unknown[]; readonly discardWeaponTagCounts?: Readonly<Partial<Record<WeaponTag, number>>>; readonly characterDamage?: number; readonly characterAbilities?: readonly CharacterAbility[]; readonly damageMultiplier?: number }): ExploreOutcome {
  const { weapons, ammo, bonusDamage, revealed, knifeUsesEarlierThisTurn, attachedInfectedCount, ammoCardsInPlayArea, actionsInPlayArea, inventoryCount, inventory, discardWeaponTagCounts, characterDamage, characterAbilities, damageMultiplier } = params;
  const count = attachedInfectedCount ?? 0;
  const required = requiredAmmo(weapons);

  if (ammo < required) {
    return { kind: 'insufficientAmmo', required, available: ammo };
  }

  const revealBonus = revealHighHpInfectedBonusDamage(characterAbilities ?? [], revealed.hp ?? 0);
  const damage = computeDamage({ weapons, ammo, bonusDamage: bonusDamage + revealBonus, knifeUsesEarlierThisTurn, ammoCardsInPlayArea, inventoryCount, inventory, discardWeaponTagCounts, damageMultiplier });

  // instantKillAtOrBelowHp: if revealed infected HP <= threshold, instant defeat.
  const instantKill = weapons.some(w =>
    w.weaponEffects?.some(e => e.kind === 'instantKillAtOrBelowHp' && (revealed.hp ?? 0) <= e.hp),
  );

  if (revealed.type !== 'infected') {
    return { kind: 'nonInfected', cardId: revealed.id };
  }

  if (instantKill) {
    return { kind: 'defeated', decorations: revealed.decorations ?? 0 };
  }

  let effective = damage;
  let effectiveHp = revealed.hp ?? 0;
  let boostedAttack = revealed.attack ?? 0;
  if (revealed.infectedEffects) {
    for (const effect of revealed.infectedEffects) {
      if (effect.kind === 'plusHpAndDamagePerAttachedInfected') {
        const bonus = effect.amount * count;
        effectiveHp += bonus;
        boostedAttack += bonus;
      }
      if (effect.kind === 'plusDamagePerFull10AmmoOfAttacker') {
        effective += effect.amount * Math.floor(ammo / 10);
      }
      if (effect.kind === 'onRevealWeaponDamagePenalty') {
        effective -= effect.amount * weapons.length;
      }
      if (effect.kind === 'onRevealBonusDamageIfCharacterDamaged') {
        if ((characterDamage ?? 0) >= effect.threshold) {
          effective += effect.amount;
        }
      }
      if (effect.kind === 'onRevealHealthPenaltyIfMultipleWeapons') {
        if (weapons.length >= effect.count) {
          effectiveHp -= effect.amount;
        }
      }
    }
  }

  if (effective >= effectiveHp) {
    const blockedByInventory = revealed.infectedEffects?.some(e => e.kind === 'cannotBeDefeatedIfInventoryAtMost' && (inventoryCount ?? 0) <= e.count) ?? false;
        const blockedByActions = revealed.infectedEffects?.some(e => e.kind === 'cannotBeDefeatedIfActionsAtLeast' && (actionsInPlayArea ?? 0) >= e.count) ?? false;
        if (blockedByInventory || blockedByActions) {
      const shuffleBack = revealed.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated' || e.kind === 'onNotDefeatedGainAmmoAndShuffle') ?? false;
      const suppressed = weapons.some(w =>
        w.weaponEffects?.some(e => e.kind === 'grantExploreAndSuppressLowHpInfected' && (revealed.hp ?? 0) <= e.hpThreshold),
      );
      const raw = suppressed ? 0 : boostedAttack;
      return { kind: 'notDefeated', damageTaken: Math.max(raw - (params.damageReduction ?? 0), 0), shuffleBack };
    }
    return { kind: 'defeated', decorations: revealed.decorations ?? 0 };
  } else {
    const shuffleBack = revealed.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated' || e.kind === 'onNotDefeatedGainAmmoAndShuffle') ?? false;
    // Flashbang: low-HP infected deal 0 damage.
    const suppressed = weapons.some(w =>
      w.weaponEffects?.some(e => e.kind === 'grantExploreAndSuppressLowHpInfected' && (revealed.hp ?? 0) <= e.hpThreshold),
    );
    const raw = suppressed ? 0 : boostedAttack;
    return { kind: 'notDefeated', damageTaken: Math.max(raw - (params.damageReduction ?? 0), 0), shuffleBack };
  }
}

export interface MultiExploreTarget {
  readonly cardId: string;
  readonly hp: number;
  readonly attack: number;
  readonly infectedEffects?: readonly InfectedEffect[];
}

export function resolveMultiExplore(params: { readonly damage: number; readonly revealed: readonly MultiExploreTarget[]; readonly attachedInfectedCount?: number }): { readonly defeated: boolean; readonly combinedHp: number; readonly combinedAttack: number; readonly shuffleBackCards: readonly string[] } {
  const { damage, revealed, attachedInfectedCount } = params;
  const count = attachedInfectedCount ?? 0;
  // buffOtherRevealedInfected (Albert Wesker): each revealed infected with this
  // effect buffs all OTHER revealed infected by +hp HP and +damage damage.
  const hpBuffFor = (i: number) => revealed.reduce((acc, t, j) => {
    if (i === j) return acc;
    const e = t.infectedEffects?.find(x => x.kind === 'buffOtherRevealedInfected') as { kind: 'buffOtherRevealedInfected'; hp: number; damage: number } | undefined;
    return e ? acc + e.hp : acc;
  }, 0);
  const dmgBuffFor = (i: number) => revealed.reduce((acc, t, j) => {
    if (i === j) return acc;
    const e = t.infectedEffects?.find(x => x.kind === 'buffOtherRevealedInfected') as { kind: 'buffOtherRevealedInfected'; hp: number; damage: number } | undefined;
    return e ? acc + e.damage : acc;
  }, 0);

  const combinedHp = revealed.reduce((sum, target, i) => {
    let hp = target.hp + hpBuffFor(i);
    if (target.infectedEffects?.some(e => e.kind === 'plusHpIfAttackedWithAnotherInfected') && revealed.length > 1) {
      hp += 20;
    }
    const selfBoost = target.infectedEffects?.find(e => e.kind === 'plusHpAndDamagePerAttachedInfected') as { kind: 'plusHpAndDamagePerAttachedInfected'; amount: number } | undefined;
    if (selfBoost) hp += selfBoost.amount * count;
    return sum + hp;
  }, 0);
  const combinedAttack = revealed.reduce((sum, target, i) => {
    let atk = target.attack + dmgBuffFor(i);
    const selfBoost = target.infectedEffects?.find(e => e.kind === 'plusHpAndDamagePerAttachedInfected') as { kind: 'plusHpAndDamagePerAttachedInfected'; amount: number } | undefined;
    if (selfBoost) atk += selfBoost.amount * count;
    return sum + atk;
  }, 0);
  const defeated = damage >= combinedHp;
  const shuffleBackCards = revealed
    .filter(target => target.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated' || e.kind === 'onNotDefeatedGainAmmoAndShuffle') ?? false)
    .map(target => target.cardId);

  return { defeated, combinedHp, combinedAttack, shuffleBackCards };
}
