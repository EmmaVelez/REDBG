import type { CardDef, WeaponEffect, InfectedEffect, GameState, WeaponTag, CharacterAbility } from '../types';
import { characterAbilities, ammoReqForWeapon, passiveDamageBonus, exploreBigHandBonus, exploreActionsBonus, knifeWeaponsUsedThisTurn, revealHighHpInfectedBonusDamage, singleWeaponAmmoDiscount, chosenWeaponTypeAmmoDiscount, partnerAttachedDamageBonus, plusDamageIfTwoOrMoreWeapons, exploreBonusIfAmmoAbove, plusTagDamageIfAmmoAbove, dualWieldBonus, leaderAbilities } from './abilities';
import { exploreAmmoReq } from './ammo';
import { activeSkillEffects, exploreSkillDamageBonus } from './skill';

export interface ExploreWeapon {
  readonly damage: number;
  readonly ammoReq: number;
  readonly weaponEffects?: readonly WeaponEffect[];
  /** Weapon type tags (melee/knife/pistol/...) for tag-scoped effects. */
  readonly tags?: readonly WeaponTag[];
}

/**
 * Total Explores a set of weapon defs grant this turn: `grantExplores`
 * (Pump-Action/Automatic/Riot/Triple Barreled Shotguns, Stun Rod) plus
 * WE-040 Flashbang's `grantExploreAndSuppressLowHpInfected`.
 *
 * These explores are granted by USING the weapon, so a player may spend them
 * in the SAME explore action (the multi-explore batch then reveals that many
 * cards at once) or save them for a later, separate explore.
 */
export function grantedExploresFor(weaponDefs: readonly (CardDef | undefined)[]): number {
  let total = 0;
  for (const def of weaponDefs) {
    for (const e of def?.weaponEffects ?? []) {
      if (e.kind === 'grantExplores') total += e.amount;
      else if (e.kind === 'grantExploreAndSuppressLowHpInfected') total += 1;
    }
  }
  return total;
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
        // CW-027 Machine Gun w/ Launcher: "+N for each ADDITIONAL Infected" —
        // the first Infected is the baseline, so the count is battled - 1.
        if (effect.kind === 'plusDamagePerAdditionalInfectedBattled') {
          damage += effect.amount * Math.max(0, (params.infectedBattledThisTurn ?? 0) - 1);
        }
        // CW-031 Akimbo Flintlock Pistols: +N when Battling `threshold`+ Infected.
        if (effect.kind === 'plusDamageIfInfectedBattledAtLeast'
            && (params.infectedBattledThisTurn ?? 0) >= effect.threshold) {
          damage += effect.amount;
        }
        // CW-030 Akimbo Flintlock Pistols: "deals its Damage to two different
        // Infected" — against 2+ Revealed Infected its Damage lands twice, which
        // against the combined Health pool is the same as counting it twice.
        if (effect.kind === 'dealDamageToTwoInfected'
            && (params.infectedBattledThisTurn ?? 0) >= 2) {
          damage += weapon.damage;
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
export function exploreDamage(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
  /**
   * Who leads the explore. The leader is the one fighting, so its abilities
   * feed the preview; omitted means the Main character (every pre-partner
   * call site).
   */
  leader?: 'main' | 'partner',
  /**
   * Ammo allocated to each `xAmmo` weapon (Gatling Gun et al.) — the amount IS
   * that weapon's damage and cost in the preview.
   */
  ammoByWeapon?: Readonly<Record<string, number>>,
  /** Number of Infected this explore battles (a multi-explore). Defaults to 1. */
  exploreCount?: number,
): number {
  const player = state.seats[seat];
  if (player === undefined) return 0;
  const battledCount = exploreCount ?? 1;
  // CW-028 Machine Gun w/ Launcher: while armed, the weapon deals no weapon
  // Damage and its `amount` is dealt to every Revealed Infected instead.
  const armedLauncherAmount = (() => {
    for (let i = 0; i < (weaponIds ?? []).length; i++) {
      const id = weaponIds[i];
      if (id !== undefined && player.armedLauncherInstanceId === id) {
        const eff = (state.cardDefs[state.cards[id]?.cardId ?? '']?.weaponEffects ?? [])
          .find(e => e.kind === 'armLauncherForAllRevealed');
        if (eff !== undefined && eff.kind === 'armLauncherForAllRevealed') return eff.amount;
      }
    }
    return 0;
  })();
  const abilities = leaderAbilities(state, seat, leader ?? 'main');
  const defs = (weaponIds ?? []).map(id => {
    const inst = state.cards[id];
    return inst === undefined ? undefined : state.cardDefs[inst.cardId];
  });
  const chrisSingleDiscount = (weaponIds?.length ?? 0) === 1 ? singleWeaponAmmoDiscount(abilities) : 0;
  void chrisSingleDiscount;
  const chrisTypeDiscount = chosenWeaponTypeAmmoDiscount(abilities);
  void chrisTypeDiscount;
  const chrisTypeDiscountTypes = player.chrisAmmoDiscountTypes ?? [];
  void chrisTypeDiscountTypes;
  const weapons: ExploreWeapon[] = defs.map((def, i) => {
    // David King (Outbreak) L1: effects copied onto this weapon from a
    // discarded one apply for this turn's explore.
    const id = weaponIds[i];
    const copied = id !== undefined && player.copiedWeaponEffects?.instanceId === id
      ? player.copiedWeaponEffects.effects
      : [];
    const coup = player.pendingCoupDeGrace;
    const noActions = player.playArea.every(pid => state.cardDefs[state.cards[pid]?.cardId ?? '']?.type !== 'action');
    const bowEff = def?.weaponEffects?.find(e => e.kind === 'plusDamageIfNoActionsInPlayArea');
    const xpEff = def?.weaponEffects?.find(e => e.kind === 'plusDamageIfCharacterXpAtLeast');
    const bowBonus = bowEff !== undefined && bowEff.kind === 'plusDamageIfNoActionsInPlayArea' && noActions ? bowEff.amount : 0;
    const xpBonus = xpEff !== undefined && xpEff.kind === 'plusDamageIfCharacterXpAtLeast' && (player.xp ?? 0) >= xpEff.threshold ? xpEff.amount : 0;
    return {
      damage: (def?.xAmmo === true ? Math.min(ammoByWeapon?.[id ?? ''] ?? 0, def.ammoCap ?? Infinity) : (player.armedLauncherInstanceId === id ? 0 : (def?.damage ?? 0))) + (player.weaponDamageBonusById?.[id ?? ''] ?? 0) + (coup !== undefined && coup.weaponInstanceId === id ? coup.amount : 0) + bowBonus + xpBonus,
      ammoReq: def?.xAmmo === true ? Math.min(ammoByWeapon?.[id ?? ''] ?? 0, def.ammoCap ?? Infinity) : exploreAmmoReq(state, seat, id ?? '', weaponIds?.length ?? 1),
      weaponEffects: [...(def?.weaponEffects ?? []), ...copied],
      tags: def?.weaponTags,
    };
  });
  // David King (Outbreak) L2: when he uses a Knife, one from the discard
  // pile is used as well.
  if (abilities.some(a => a.kind === 'knifeFromDiscardForExplore') && weapons.some(w => (w.tags ?? []).includes('knife'))) {
    const discardKnife = player.discard.find(id => {
      const cd = state.cardDefs[state.cards[id]?.cardId ?? ''];
      return cd?.type === 'weapon' && (cd.weaponTags ?? []).includes('knife');
    });
    if (discardKnife !== undefined) {
      const kd = state.cardDefs[state.cards[discardKnife]?.cardId ?? ''];
      weapons.push({ damage: kd?.damage ?? 0, ammoReq: 0, weaponEffects: kd?.weaponEffects, tags: kd?.weaponTags });
    }
  }
  const abilityDamage =
    passiveDamageBonus(abilities, defs, 1, player.hand.length) +
    exploreBigHandBonus(abilities, state.seats) +
    exploreActionsBonus(
      abilities,
      player.playArea.map(id => state.cards[id]?.cardId).map(cid => state.cardDefs[cid ?? '']?.type ?? ''),
      t => t === 'action'
    ) +
    partnerAttachedDamageBonus(abilities, player.partnerAttached) +
    plusDamageIfTwoOrMoreWeapons(abilities, defs.length) +
    dualWieldBonus(state, seat, abilities, weaponIds ?? []) +
    exploreBonusIfAmmoAbove(abilities, player.turnAmmo) +
    plusTagDamageIfAmmoAbove(abilities, defs, player.turnAmmo) +
    // Mercenaries Skill damage bonuses (SK-030, SK-034, ...) — the picker's
    // preview must match what the explore reducer resolves.
    exploreSkillDamageBonus(activeSkillEffects(state, seat), defs, state, seat, weaponIds ?? []);
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
    bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + perDiscardCardBonus + (armedLauncherAmount * battledCount),
    damageMultiplier: player.damageMultiplierThisTurn ?? 1,
    infectedBattledThisTurn: battledCount,
  });
}

export type ExploreOutcome =
  | { readonly kind: 'defeated'; readonly decorations: number; readonly damage: number; readonly hp: number }
  | { readonly kind: 'notDefeated'; readonly damageTaken: number; readonly shuffleBack: boolean }
  | { readonly kind: 'nonInfected'; readonly cardId: string }
  | { readonly kind: 'insufficientAmmo'; readonly required: number; readonly available: number };

export function resolveExplore(params: { readonly weapons: readonly ExploreWeapon[]; readonly ammo: number; readonly bonusDamage: number; readonly revealed: CardDef; readonly damageReduction?: number; readonly knifeUsesEarlierThisTurn?: number; readonly attachedInfectedCount?: number; readonly ammoCardsInPlayArea?: number; readonly actionsInPlayArea?: number; readonly inventoryCount?: number; readonly inventory?: readonly unknown[]; readonly discardWeaponTagCounts?: Readonly<Partial<Record<WeaponTag, number>>>; readonly characterDamage?: number; readonly characterAbilities?: readonly CharacterAbility[]; readonly damageMultiplier?: number; readonly sameNameAttachedCount?: number; readonly characterXp?: number; readonly infectedBattledThisTurn?: number; readonly ammoX10InDiscardCount?: number; readonly exploringCharacterMaxHp?: number }): ExploreOutcome {
  const { weapons, ammo, bonusDamage, revealed, knifeUsesEarlierThisTurn, attachedInfectedCount, ammoCardsInPlayArea, actionsInPlayArea, inventoryCount, inventory, discardWeaponTagCounts, characterDamage, characterAbilities, damageMultiplier, sameNameAttachedCount, characterXp, infectedBattledThisTurn, ammoX10InDiscardCount } = params;
  const count = attachedInfectedCount ?? 0;
  const required = requiredAmmo(weapons);

  if (ammo < required) {
    return { kind: 'insufficientAmmo', required, available: ammo };
  }

  const revealBonus = revealHighHpInfectedBonusDamage(characterAbilities ?? [], revealed.hp ?? 0);
  const damage = computeDamage({ weapons, ammo, bonusDamage: bonusDamage + revealBonus, knifeUsesEarlierThisTurn, ammoCardsInPlayArea, inventoryCount, inventory, discardWeaponTagCounts, damageMultiplier, infectedBattledThisTurn: infectedBattledThisTurn ?? (revealed.type === 'infected' ? 1 : 0) });

  // instantKillAtOrBelowHp: if revealed infected HP <= threshold, instant defeat.
  const instantKill = weapons.some(w =>
    w.weaponEffects?.some(e => e.kind === 'instantKillAtOrBelowHp' && (revealed.hp ?? 0) <= e.hp),
  );

  if (revealed.type !== 'infected') {
    return { kind: 'nonInfected', cardId: revealed.id };
  }

  if (instantKill) {
    return { kind: 'defeated', decorations: revealed.decorations ?? 0, damage, hp: revealed.hp ?? 0 };
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
        boostedAttack += effect.amount * Math.floor(ammo / 10);
      }
      if (effect.kind === 'onRevealWeaponDamagePenalty') {
        effective -= effect.amount * weapons.length;
      }
      // CI-009 Rachael Foley (First Encounter): "takes 10 Damage less for each
      // 10xAmmo in the Exploring Player's Discard Pile" — the discard count is
      // computed by the caller (resolveExplore is pure).
      if (effect.kind === 'onRevealDamageReductionPerAmmoX10InDiscard') {
        effective -= effect.amount * (params.ammoX10InDiscardCount ?? 0);
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
      // --- Mercenaries reveal effects ---
      if (effect.kind === 'onRevealPlusHpPerSameNameAttached') {
        effectiveHp += effect.amount * (sameNameAttachedCount ?? 0);
      }
      if (effect.kind === 'onRevealPlusHpPerAttachedToExploring') {
        effectiveHp += effect.amount * count;
      }
      if (effect.kind === 'onRevealDamagePenaltyIfCharacterXpAtLeast') {
        if ((characterXp ?? 0) >= effect.threshold) {
          boostedAttack -= effect.amount;
        }
      }
      // CI-011 Queen Leech: its Health IS the leading exploring Character's
      // Maximum Health — it replaces the printed value outright.
      if (effect.kind === 'onRevealHpEqualsExploringCharacterMaxHp') {
        effectiveHp = params.exploringCharacterMaxHp ?? 0;
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
    return { kind: 'defeated', decorations: revealed.decorations ?? 0, damage: effective, hp: effectiveHp };
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

/**
 * Resolve a MULTI-EXPLORE engagement: N revealed Infected battled as one
 * combined fight (rulebook "Extra Explore"). The player's total Damage is
 * compared against the combined Health; on failure the player takes the
 * combined Damage.
 *
 * Every combat-affecting on-reveal Infected effect is applied per revealed
 * card, so a batch behaves like N overlapping single battles pooled into one.
 * `weapons`/`ammo`/character context are optional so the MA-039 event (which
 * only passes the pooled damage) keeps working unchanged.
 */
export function resolveMultiExplore(params: {
  readonly damage: number;
  readonly revealed: readonly MultiExploreTarget[];
  readonly attachedInfectedCount?: number;
  readonly ammo?: number;
  readonly weapons?: readonly ExploreWeapon[];
  readonly characterDamage?: number;
  readonly characterXp?: number;
  readonly sameNameAttachedCount?: number;
  readonly inventoryCount?: number;
  readonly actionsInPlayArea?: number;
  readonly damageReduction?: number;
  readonly ammoX10InDiscardCount?: number;
  readonly exploringCharacterMaxHp?: number;
  /**
   * SK-036 Bomber LV.3: the damage the "Explosive" weapons deal in this
   * explore. When present (and > 0) it is dealt to EACH revealed Infected
   * individually instead of only being pooled into `damage`.
   */
  readonly explosiveDamage?: number;
  /**
   * CW-028 Machine Gun w/ Launcher (armed mode): damage dealt to EACH revealed
   * Infected. Merged with `explosiveDamage` — both are per-Infected splashes.
   */
  readonly splashDamageToEachRevealed?: number;
}): {
  readonly defeated: boolean;
  readonly combinedHp: number;
  readonly combinedAttack: number;
  /** Per revealed index: defeated by the SK-036 Explosive splash (or by the pooled hit). */
  readonly splashDefeated: readonly boolean[];
  /** Combined attack of the revealed Infected that survived the splash. */
  readonly survivingAttack: number;
  readonly shuffleBackCards: readonly string[];
  readonly blockedByCannotDefeat: boolean;
  readonly effectiveDamage: number;
} {
  const { revealed } = params;
  const count = params.attachedInfectedCount ?? 0;
  const weapons = params.weapons ?? [];
  const ammo = params.ammo ?? 0;
  let damage = params.damage;
  let blockedByCannotDefeat = false;

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

  const effectiveHps: number[] = [];
  const effectiveAttacks: number[] = [];
  let combinedHp = 0;
  let combinedAttack = 0;
  for (let i = 0; i < revealed.length; i++) {
    const target = revealed[i];
    if (target === undefined) { effectiveHps.push(0); effectiveAttacks.push(0); continue; }
    let hp = target.hp + hpBuffFor(i);
    let atk = target.attack + dmgBuffFor(i);
    if (target.infectedEffects?.some(e => e.kind === 'plusHpIfAttackedWithAnotherInfected') && revealed.length > 1) {
      hp += 20;
    }
    const selfBoost = target.infectedEffects?.find(e => e.kind === 'plusHpAndDamagePerAttachedInfected') as { kind: 'plusHpAndDamagePerAttachedInfected'; amount: number } | undefined;
    if (selfBoost) { hp += selfBoost.amount * count; atk += selfBoost.amount * count; }
    const sameName = target.infectedEffects?.find(e => e.kind === 'onRevealPlusHpPerSameNameAttached') as { kind: 'onRevealPlusHpPerSameNameAttached'; amount: number } | undefined;
    if (sameName) hp += sameName.amount * (params.sameNameAttachedCount ?? 0);
    const attachedExploring = target.infectedEffects?.find(e => e.kind === 'onRevealPlusHpPerAttachedToExploring') as { kind: 'onRevealPlusHpPerAttachedToExploring'; amount: number } | undefined;
    if (attachedExploring) hp += attachedExploring.amount * count;
    const hpPenalty = target.infectedEffects?.find(e => e.kind === 'onRevealHealthPenaltyIfMultipleWeapons') as { kind: 'onRevealHealthPenaltyIfMultipleWeapons'; amount: number; count: number } | undefined;
    if (hpPenalty && weapons.length >= hpPenalty.count) hp -= hpPenalty.amount;
    const xpPenalty = target.infectedEffects?.find(e => e.kind === 'onRevealDamagePenaltyIfCharacterXpAtLeast') as { kind: 'onRevealDamagePenaltyIfCharacterXpAtLeast'; amount: number; threshold: number } | undefined;
    if (xpPenalty && (params.characterXp ?? 0) >= xpPenalty.threshold) atk -= xpPenalty.amount;
    const ammoBonus = target.infectedEffects?.find(e => e.kind === 'plusDamagePerFull10AmmoOfAttacker') as { kind: 'plusDamagePerFull10AmmoOfAttacker'; amount: number } | undefined;
    if (ammoBonus) atk += ammoBonus.amount * Math.floor(ammo / 10);
    const weaponPenalty = target.infectedEffects?.find(e => e.kind === 'onRevealWeaponDamagePenalty') as { kind: 'onRevealWeaponDamagePenalty'; amount: number } | undefined;
    if (weaponPenalty) damage -= weaponPenalty.amount * weapons.length;
    // CI-009 Rachael Foley (First Encounter): the discard-pile damage soak
    // applies to the pooled batch just as it does to a single battle.
    const ammoReduction = target.infectedEffects?.find(e => e.kind === 'onRevealDamageReductionPerAmmoX10InDiscard') as { kind: 'onRevealDamageReductionPerAmmoX10InDiscard'; amount: number } | undefined;
    if (ammoReduction) damage -= ammoReduction.amount * (params.ammoX10InDiscardCount ?? 0);
    const charDamageBonus = target.infectedEffects?.find(e => e.kind === 'onRevealBonusDamageIfCharacterDamaged') as { kind: 'onRevealBonusDamageIfCharacterDamaged'; amount: number; threshold: number } | undefined;
    if (charDamageBonus && (params.characterDamage ?? 0) >= charDamageBonus.threshold) damage += charDamageBonus.amount;
    const cannotInv = target.infectedEffects?.some(e => e.kind === 'cannotBeDefeatedIfInventoryAtMost' && (params.inventoryCount ?? 0) <= e.count) ?? false;
    const cannotAct = target.infectedEffects?.some(e => e.kind === 'cannotBeDefeatedIfActionsAtLeast' && (params.actionsInPlayArea ?? 0) >= e.count) ?? false;
    if (cannotInv || cannotAct) blockedByCannotDefeat = true;
    // CI-011 Queen Leech: its Health IS the leading exploring Character's
    // Maximum Health — it replaces the printed value outright.
    if (target.infectedEffects?.some(e => e.kind === 'onRevealHpEqualsExploringCharacterMaxHp')) {
      hp = params.exploringCharacterMaxHp ?? 0;
    }
    combinedHp += hp;
    combinedAttack += atk;
    effectiveHps.push(hp);
    effectiveAttacks.push(atk);
  }

  const defeated = !blockedByCannotDefeat && damage >= combinedHp;
  // SK-036 Bomber LV.3: "Explosive" Weapons deal Damage to all Revealed
  // Infected at the same time. The Explosive damage is applied to EACH
  // revealed Infected individually, so a weaker one can be defeated while a
  // stronger one survives the splash.
  const explosiveDamage = (params.explosiveDamage ?? 0) + (params.splashDamageToEachRevealed ?? 0);
  const splashActive = !blockedByCannotDefeat && explosiveDamage > 0;
  const splashDefeated: boolean[] = revealed.map((_, i) =>
    defeated || (splashActive && (effectiveHps[i] ?? 0) <= explosiveDamage));
  const survivingAttack = defeated
    ? 0
    : revealed.reduce((sum, _, i) => sum + (splashDefeated[i] === true ? 0 : (effectiveAttacks[i] ?? 0)), 0);
  const shuffleBackCards = revealed
    .filter(target => target.infectedEffects?.some(e => e.kind === 'shuffleBackIfNotDefeated' || e.kind === 'onNotDefeatedGainAmmoAndShuffle') ?? false)
    .map(target => target.cardId);

  return {
    defeated,
    combinedHp,
    combinedAttack: Math.max(combinedAttack, 0),
    splashDefeated,
    survivingAttack,
    shuffleBackCards,
    blockedByCannotDefeat,
    effectiveDamage: damage,
  };
}
