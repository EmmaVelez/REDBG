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
  infectedFought: number,
  handCount: number = 0
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
    if (ability.kind === 'plusDamagePerCardInHand') {
      bonus += ability.amount * Math.max(handCount, 0);
    }
    if (ability.kind === 'differentWeaponTypesDamageBonus') {
      const tags = new Set<string>();
      for (const def of weaponDefs) {
        for (const t of def?.weaponTags ?? []) tags.add(t);
      }
      if (tags.size >= 2) bonus += ability.amount;
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

/**
 * PR-009 Rebecca L2: while exploring, +amount damage per player (including
 * herself — the card says "each Player") with more than `threshold` cards
 * in hand.
 */
export function exploreBigHandBonus(
  abilities: readonly CharacterAbility[],
  seats: readonly { readonly hand: readonly string[]; readonly dead?: boolean }[]
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind !== 'exploreDamagePerPlayerWithBigHand') continue;
    const count = seats.filter(s => !s.dead && s.hand.length > ability.threshold).length;
    bonus += ability.amount * count;
  }
  return bonus;
}

/**
 * PR-010 Hunk L2: while exploring, +amount damage when the play area holds
 * at least `minActions` Action cards.
 */
export function exploreActionsBonus(
  abilities: readonly CharacterAbility[],
  playAreaCardTypes: readonly string[],
  isActionType: (cardType: string) => boolean
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind !== 'exploreBonusIfActionsInPlayArea') continue;
    const actions = playAreaCardTypes.filter(t => isActionType(t)).length;
    if (actions >= ability.minActions) bonus += ability.amount;
  }
  return bonus;
}

/** Jill L2: explosive weapons go to discard instead of being trashed. */
/**
 * Survival Knife (WE-005): "This Weapon gets +5 Damage for every other
 * 'Knife' Weapon used this turn." Counts Knife-tagged weapons the seat has
 * already used in EARLIER explores this turn (log scan back to the seat's
 * last endTurn; the in-flight explore is not in the log yet). Knives in the
 * current attack are counted separately by computeDamage.
 */
export function knifeWeaponsUsedThisTurn(state: GameState, seat: number): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const logged = state.log[i]?.action;
    if (logged === undefined) continue;
    if (logged.type === 'endTurn' && logged.seat === seat) break;
    if (logged.type === 'explore' && logged.seat === seat) {
      for (const weaponId of logged.weapons) {
        const inst = state.cards[weaponId];
        const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
        if ((def?.weaponTags ?? []).includes('knife')) count += 1;
      }
    }
  }
  return count;
}

export function revealHighHpInfectedBonusDamage(
  abilities: readonly CharacterAbility[],
  revealedHp: number
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind !== 'revealHighHpInfectedBonusDamage') continue;
    if (revealedHp >= a.threshold) bonus += a.amount;
  }
  return bonus;
}

export function explosivesGoToDiscard(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'explosivesGoToDiscardInsteadOfTrash');
}

/** True when the weapon def is an explosive (tagged). */
export function actionBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): number {
  if (def?.type !== 'action') return 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'actionBonus') gold += ability.amount;
  }
  return gold;
}

export const actionCardBonus = actionBonus;

/**
 * Rebecca L2: trash actions/effects are worth more gold when played.
 * Returns extra gold for an action card whose actionEffects include a trash
 * effect (deck thinning). 0 for non-trash actions or characters without
 * the ability.
 */
export function trashEffectBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): number {
  if (def?.type !== 'action') return 0;
  const hasTrash = (def.actionEffects ?? []).some(e =>
    e.kind === 'trashUpToTwoFromDiscard' ||
    e.kind === 'trashHandCard' ||
    e.kind === 'upgradeAmmoBy30Gold'
  );
  if (!hasTrash) return 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'trashEffectBonus') gold += ability.amount;
  }
  return gold;
}

/** True when the weapon def is an explosive (tagged). */
export function isExplosive(def: CardDef | undefined): boolean {
  return def?.type === 'weapon' && (def.weaponTags ?? []).includes('explosive');
}

export function exploreOnInfectedDefeat(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce((s, a) => (a.kind === 'exploreOnInfectedDefeat' ? s + a.amount : s), 0);
}

export function trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat');
}

export function plusOneCardOnGainCard(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'plusOneCardOnGainCard');
}

export function trashCardFromDiscardOnInfectedDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'trashCardFromDiscardOnInfectedDefeat');
}

export function discardActionCardFromHandForPlusTwoCards(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'discardActionCardFromHandForPlusTwoCards');
}
/**
 * Ada (Nightmare CH-043) L1: during your turn, if she takes damage, you get
 * +2 cards. `isSelfTurn` is false when the damaged seat is not the active
 * player (e.g. an opponent's AoE reveal effect), which never triggers this.
 */
export function cardsOnDamageTakenDuringTurn(abilities: readonly CharacterAbility[], isSelfTurn: boolean): number {
  if (!isSelfTurn) return 0;
  let draw = 0;
  for (const a of abilities) {
    if (a.kind === 'cardsOnDamageTakenDuringTurn') draw += a.amount;
  }
  return draw;
}

/**
 * Ada (Nightmare CH-043) L2: the HP to set when damage would reduce her to
 * 0 or less (10), or undefined when she has no such ability.
 */
export function setHpToOnLethal(abilities: readonly CharacterAbility[]): number | undefined {
  for (const a of abilities) {
    if (a.kind === 'setHpToOnLethal') return a.amount;
  }
  return undefined;
}

/**
 * Applies an HP loss, then Ada's L2 replacement: when the result would be
 * 0 or less, set it to `amount` instead (user ruling: applies EVERY time).
 * `seatDownedOrDead` skips the replacement so stray AoE damage cannot revive
 * a downed Ada for free.
 */
export function applyHpLoss(abilities: readonly CharacterAbility[], hp: number, amount: number, seatDownedOrDead = false): number {
  const next = Math.max(hp - amount, 0);
  if (next > 0 || seatDownedOrDead) return next;
  return setHpToOnLethal(abilities) ?? next;
}

/**
 * Luis Sera (Nightmare CH-036) L2: once he defeats an Infected, the player
 * may move any number of cards from the discard pile to the bottom of the
 * Inventory.
 */
export function movesDiscardToInventoryOnDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'onDefeatMoveDiscardToInventoryBottom');
}

/**
 * Steve Burnside (Alliance CH-013) L1: recover `amount` HP at the start of
 * each turn (capped at max HP by the caller).
 */
export function healAtTurnStart(abilities: readonly CharacterAbility[]): number {
  let heal = 0;
  for (const a of abilities) {
    if (a.kind === 'healAtTurnStart') heal += a.amount;
  }
  return heal;
}

/**
 * Chris Redfield (Alliance CH-019) L1: -amount ammo requirement, but only
 * when the explore uses exactly one weapon.
 */
export function singleWeaponAmmoDiscount(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'singleWeaponAmmoDiscount') amount += a.amount;
  }
  return amount;
}

/**
 * Chris Redfield (Alliance CH-019) L2: -amount ammo requirement for weapons
 * whose type is in the player's chosen set.
 */
export function chosenWeaponTypeAmmoDiscount(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'chosenWeaponTypeAmmoDiscount') amount += a.amount;
  }
  return amount;
}

/**
 * Jill Valentine (Alliance CH-016) L1: +amount explore damage when her
 * partner has `threshold` or fewer cards attached. No partner -> no bonus.
 */
/**
 * Josh Stone (Alliance CH-012) L1: cannot use weapons costing maxCost or
 * more. Returns undefined when the character has no such restriction.
 */
export function weaponCostCap(abilities: readonly CharacterAbility[]): number | undefined {
  for (const a of abilities) {
    if (a.kind === 'weaponCostCap') return a.maxCost;
  }
  return undefined;
}

/**
 * Claire Redfield (Alliance CH-020) L1: +amount damage this turn when a
 * Green Herb or Red Herb is trashed from hand.
 */
export function herbTrashDamageBonus(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'herbTrashDamageBonus') amount += a.amount;
  }
  return amount;
}

/** Carlos Oliveira (Alliance CH-011) L2: perfect-explore reward. */
export function hasPerfectExploreReward(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'perfectExploreReward');
}
/** Claire Redfield (Alliance CH-020) L2: double all damage this turn. */
export function hasDoubleDamageOnBothHerbs(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'doubleDamageOnBothHerbs');
}
/** Partner attach cap: 2 by default, Josh L2 adds 2. */
export function partnerAttachCap(abilities: readonly CharacterAbility[]): number {
  let cap = 2;
  for (const a of abilities) {
    if (a.kind === 'partnerAttachCapBonus') cap += a.amount;
  }
  return cap;
}
export function partnerAttachedDamageBonus(
  abilities: readonly CharacterAbility[],
  partnerAttached: readonly string[] | undefined,
): number {
  if (partnerAttached === undefined) return 0;
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'partnerAttachedCountDamageBonus' && partnerAttached.length <= a.threshold) bonus += a.amount;
  }
  return bonus;
}
