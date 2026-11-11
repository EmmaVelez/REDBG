import type { GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { abilitiesForLevel } from '../engine/characters';
import { buyCostAfterReduction } from '../engine/abilities';

/**
 * Per-point value of the economy resources an action card grants, matching the
 * state-side pool weights (turnAmmo *3, turnGold *1, buys/actions/explores *40)
 * so that playing an action is scored exactly as the pools it creates.
 */
const GOLD_PER_POINT = 1;
const AMMO_PER_POINT = 3;
/** Ammo beyond the heaviest weapon requirement has no marginal value. */
const AMMO_USEFUL_CAP = 40;
const AMMO_EXCESS_PER_POINT = 0.1;
/** Ammunition x10 cards (>cap) get a small positive weight so the bot still
 *  considers them; otherwise the cap made everything above 40 ammo worthless
 *  and prevented bots from ever upgrading from stock ammo. */
const AMMO_CAP_BONUS = 8;
const POOL_PER_BONUS = 40; // buys / actions / explores each top out at 40/point
/** Value of drawing one card (a fresh draw is worth about an average card). */
const CARD_DRAW_VALUE = 20;
/** Cards are held at half value: you can only play one Action a turn. */
const HOLD_FACTOR = 0.5;
/** Deck total (hand + inventory + discard + playArea) beyond which trash
 * effects gain value and junk cards start to hurt (deck thinning pressure). */
const BLOAT_THRESHOLD = 18;
const TRASH_BLOAT_PER_CARD = 4;
const TRASH_BLOAT_MAX = 24;
/** Market pull for healing items (Green/Red Herb, First Aid Spray). */
const HEAL_ITEM_PULL = 15;
/**
 * Health below this fraction of max is DANGEROUSLY low: the next reveal can
 * down the character, so every missing point of Health is worth more than a
 * point. Without this the bot at 10 HP farms ammo forever (measured: zero
 * heals over 4000-action games that hit the action cap) because the heal's
 * +Health exactly cancels the gold it costs.
 */
const LOW_HP_FRACTION = 0.3;
const LOW_HP_PENALTY = 3;
/** Flat cost of the turn a downed character loses. */
const DOWNED_TURN_PENALTY = 200;
/**
 * Max Health is the downed-recovery budget: every down costs 20 max HP
 * permanently, so a low max is closer to permanent defeat. This is what
 * stops the revive Health credit from making a down look like a heal.
 */
const MAX_HP_WEIGHT = 0.5;
/** Nominal Health a healing item restores (its card value). */
const HEAL_FIXED_HP = 20;   // Green Herb: heal 20
const HEAL_FULL_HP = 40;    // First Aid Spray / Red Herb: heal to full

const HEAL_ITEM_KINDS = new Set([
  'healFixed20OrTrashWithSecondFor60',
  'healToFull',
  'healSelfAndPartnerToFull',
]);
/** True when the item restores Health (any herb / spray). */
function isHealingItem(cardDef: CardDef): boolean {
  return (cardDef.itemEffects ?? []).some(e => HEAL_ITEM_KINDS.has(e.kind));
}

/** A card whose owned value is below this floor is "junk" when the deck bloats. */
const JUNK_FLOOR = 12;
const JUNK_BLOAT_PENALTY = 4;

/**
 * Evaluates the heuristic score of a specific seat in the current game state.
 * Higher score means a better position.
 *
 * The score is CHARACTER-AND-ACTION-AWARE:
 * - machine-readable abilities tilt card value toward the character's kit
 *   (Leon pistols, Barry magnums, Ada action cards, Rebecca trash effects);
 * - action cards are worth their text (draw/gold/ammo/buy/action/explore
 *   bonuses + trash effects), held at half value (one action per turn);
 * - ammo cards are worth their yield, so ammo/gold-ammer are real buys;
 * - past a deck-size threshold, trash effects gain value and low-value
 *   ("junk") cards start to cost points — the bot thins instead of bloating.
 * @param state The current game state.
 * @param seat The index of the seat to evaluate.
 * @returns The heuristic score (number).
 */
export interface EvaluateOptions {
  /**
   * Score cards in the discard zone at HELD value instead of owned value.
   * Used by the policy's endTurn simulation: the hand it dumps was already
   * yours, so shipping it to discard must not create new points (that would
   * make endTurn an arbitrage vs. playing/buying). A buy, in contrast, still
   * scores its new discard at full owned value — that is the buy incentive.
   */
  readonly clampDiscardToHeld?: boolean;
}

export function evaluateState(state: GameState, seat: number, options?: EvaluateOptions): number {
  // 0. Guard: Check if the seat exists
  const player = state.seats[seat];
  if (player === undefined) {
    return -100000;
  }

  // 1. If player is dead
  if (player.dead) {
    return -10000;
  }

  // 0b. Character abilities at the player's current level (empty for generic)
  const abilities = activeAbilities(state, player);

  // 0c. Deck bloat: hand + inventory + discard + playArea. Above the threshold
  // trash effects get better and junk cards get worse.
  const deckSize =
    player.hand.length + player.inventory.length + player.discard.length + player.playArea.length;
  const bloat = Math.max(0, deckSize - BLOAT_THRESHOLD);

  let total = 0;

  // 2. Compute total score

  // 2.1. Downed status — the character revives at the start of its next
  // turn at maxHp - 20 (see `revive`), having lost that turn. Score the
  // revive Health instead of the 0 it shows mid-turn: at 10 hp a down is a
  // +40 hp swing, so a flat penalty made every low-HP explore look fatal
  // and froze the bots out of exploring. The lost turn is charged below,
  // and the permanent max HP loss by the max-HP term.
  if (player.downed) {
    // A down at maxHp <= 20 is permanent defeat (see `revive`), not a recovery.
    if (player.maxHp <= 20) {
      total -= 10000;
    } else {
      total += player.maxHp - 20;
      total -= DOWNED_TURN_PENALTY;
    }
  } else {
    // 2.2. Health (main + partner, when partner mode active)
    total += player.hp;
    if (player.partnerHp !== undefined) {
      total += player.partnerHp;
    }
  }
  // Max Health is the recovery budget — see MAX_HP_WEIGHT.
  total += player.maxHp * MAX_HP_WEIGHT;
  // 2.2b. Dangerously low Health — see LOW_HP_FRACTION. This is what makes
  // the bot pay to heal instead of farming ammo at 10 hp.
  if (!player.downed && player.hp > 0) {
    const lowHpThreshold = Math.ceil(player.maxHp * LOW_HP_FRACTION);
    if (player.hp < lowHpThreshold) {
      total -= (lowHpThreshold - player.hp) * LOW_HP_PENALTY;
    }
  }
  // 2.3. Decorations
  total += player.decorations * 50;

  // 2.4. Level
  if (player.level === 2) {
    total += 200;
  }

  // 2.5. Turn Ammo — CAPPED. Ammo is only worth what weapons can spend; past
  // the biggest ammo requirement it is dead weight. Uncapped, playAmmo was a
  // +40 arbitrage the bot farmed all turn instead of exploring (measured:
  // 1000+ playAmmo per game, 0.05 explores/turn).
  total += Math.min(player.turnAmmo, AMMO_USEFUL_CAP) * AMMO_PER_POINT
    + Math.max(0, player.turnAmmo - AMMO_USEFUL_CAP) * AMMO_EXCESS_PER_POINT;

  // 2.6. Turn Gold — transient: resets at turn end, only matters for buying now.
  total += player.turnGold * GOLD_PER_POINT;

  // 2.7. Actions Left
  total += player.actionsLeft * POOL_PER_BONUS;

  // 2.8. Buys Left
  total += player.buysLeft * POOL_PER_BONUS;

  // 2.9. Explores Left — transient: resets to 1 every turn, so an unused explore
  // is NOT an asset: keeping it must not score (weight 0) or the bot hoards
  // explores and never fights (measured: 0.05 explores/turn, 300+ turn games).
  // Wesker-style exploreGoldBonus still counts — that gold is real on explore.
  total += player.exploresLeft * exploreGoldValue(abilities);

  // 2.10. Hand cards, scored by their real held value (type-featured).
  // Hand AND playArea cards are scored the same way: playArea cards were just
  // spent this turn, so they are worth their held value, not zero.
  const zones = [player.hand, player.playArea] as const;
  for (const zone of zones) {
    for (const instanceId of zone) {
      const cardInstance = state.cards[instanceId];
      if (!cardInstance) continue;
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (!cardDef) continue;
      total += cardHeldValue(cardDef, abilities, state, bloat);
    }
  }

  // 2.11. Discard mirrors the OWNED value of cards (bought cards land here;
  // they reshuffle back into the inventory at turn end — real assets). Owned
  // value for actions/ammo is their full text value (no hold discount: they
  // will be drawn and played), for weapons the full damage value.
  // With clampDiscardToHeld (policy endTurn sim) the dump is scored at held
  // value so ending the turn does not manufacture points.
  for (const instanceId of player.discard) {
    const cardInstance = state.cards[instanceId];
    if (!cardInstance) continue;
    const cardDef = state.cardDefs[cardInstance.cardId];
    if (!cardDef) continue;
    total += options?.clampDiscardToHeld === true
      ? cardHeldValue(cardDef, abilities, state, bloat)
      : cardOwnedValue(cardDef, abilities, state, bloat);
  }

  // 2.12. Inventory (the draw deck) is OWNED value — the same as discard.
  // It used to be a flat 2/card, which created a huge endTurn arbitrage:
  // drawing 5 ammo cards revalued them 2 -> held (~24+ each), so endTurn
  // outscored everything (+169 measured) and the bot hoarded instead of
  // fighting. Valuing inventory like discard makes draws score-neutral.
  // Junk in inventory still gets penalized when the deck is bloated.
  for (const instanceId of player.inventory) {
    const cardInstance = state.cards[instanceId];
    if (!cardInstance) continue;
    const cardDef = state.cardDefs[cardInstance.cardId];
    if (!cardDef) continue;
    total += cardOwnedValue(cardDef, abilities, state, bloat);
    if (bloat > 0 && cardHeldValue(cardDef, abilities, state, 0) < JUNK_FLOOR) {
      total -= Math.min(bloat, 6) * JUNK_BLOAT_PENALTY;
    }
  }

  // 2.13. Affordable piles — market potential is worth LESS than owned cards
  // (affordable = possibility, not possession): base 10 weighted by the card's
  // owned value so that higher-cost / higher-yield cards score above cheaper
  // ones (otherwise bots always buy the cheapest pile first, capping out at
  // whatever fits in starting gold). Market pull gives character-specific
  // preferences on top of raw value.
  let affordablePiles = 0;
  for (const pile of Object.values(state.marketPiles)) {
    const topCardInstanceId = pile.cards[0];
    if (topCardInstanceId === undefined) continue;
    const topCardInstance = state.cards[topCardInstanceId];
    if (topCardInstance === undefined) continue;
    const topCardDef = state.cardDefs[topCardInstance.cardId];
    if (topCardDef === undefined || topCardDef.cost === undefined) continue;
    // Buy-cost discounts (Mikhail L1, Billy melee L1) make the card
    // affordable at a lower gold total — price it the same way validate does.
    if (buyCostAfterReduction(abilities, topCardDef) > player.turnGold) continue;
    const ownedVal = cardOwnedValue(topCardDef, abilities, state, bloat);
    affordablePiles += 8 + Math.floor(ownedVal * 0.6) + marketPull(topCardDef, abilities, bloat);
  }
  total += affordablePiles;

  // 2.14. Attached trophies
  total += player.attached.length * 25;
  // Partner-attached cards (partner mode): same trophy weight
  total += (player.partnerAttached?.length ?? 0) * 25;

  // 2.15. Opponents
  for (let i = 0; i < state.seats.length; i++) {
    if (i === seat) continue;

    const opponent = state.seats[i];
    if (!opponent) continue;
    // Opponent dead
    if (opponent.dead) {
      total += 300;
    }
    // Opponent downed
    if (opponent.downed) {
      total += 150;
    }
    // Opponent decorations penalty
    total -= opponent.decorations * 20;
    // Opponent HP threat
    total -= opponent.hp;
    if (opponent.partnerHp !== undefined) {
      total -= opponent.partnerHp;
    }
  }

  return total;
}

/** Abilities the player has unlocked at their current level. */
function activeAbilities(state: GameState, player: PlayerState): readonly CharacterAbility[] {
  const charInstance = state.cards[player.characterInstanceId];
  if (charInstance === undefined) return [];
  const charDef = state.cardDefs[charInstance.cardId];
  if (charDef?.abilities === undefined) return [];
  return abilitiesForLevel(charDef.abilities, player.level);
}

/**
 * Value of a card while in hand or playArea. Weapons and ammo are "ready"
 * — full value. Actions are held at half their text value: you can only play
 * one Action a turn, so the option is worth less than the effect. Junk cards
 * cost a little when the deck is bloated (you want them gone).
 */
function cardHeldValue(cardDef: CardDef, abilities: readonly CharacterAbility[], state: GameState, bloat: number): number {
  if (cardDef.type === 'weapon') {
    const base = (cardDef.damage === undefined ? 10 : weaponBaseValue(cardDef.damage));
    return base + weaponAffinityBonus(abilities, cardDef);
  }
  if (cardDef.type === 'ammunition') {
    // Ammo is NOT action-gated (every ammo card can be played each turn), so
    // the hold discount does not apply — held == owned for ammo.
    return ammoYieldValue(cardDef) + ammunitionValue(abilities);
  }
  if (cardDef.type === 'action') {
    let v = Math.floor(actionTextValue(cardDef, abilities) * HOLD_FACTOR);
    if (bloat > 0 && hasTrashEffect(cardDef)) {
      v += trashBloatValue(bloat);
    }
    return v;
  }
  if (cardDef.type === 'item') return healItemValue(cardDef);
  // tokens: flat small value
  return 5;
}

/**
 * Value of a card sitting owned in discard (or offered on the market):
 * the full value it will deliver when drawn and used (no hold discount).
 */
function cardOwnedValue(cardDef: CardDef, abilities: readonly CharacterAbility[], state: GameState, bloat: number): number {
  if (cardDef.type === 'weapon') {
    const base = (cardDef.damage === undefined ? 10 : weaponBaseValue(cardDef.damage));
    return base + weaponAffinityBonus(abilities, cardDef);
  }
  if (cardDef.type === 'ammunition') {
    return ammoYieldValue(cardDef) + ammunitionValue(abilities);
  }
  if (cardDef.type === 'action') {
    let v = actionTextValue(cardDef, abilities);
    if (bloat > 0 && hasTrashEffect(cardDef)) {
      v += trashBloatValue(bloat);
    }
    return v;
  }
  if (cardDef.type === 'item') return healItemValue(cardDef);
  return 5;
}

/**
 * A healing item is worth the Health it actually restores — a Green Herb is
 * 20 points of Health, a First Aid Spray or Red Herb roughly 40. Valuing
 * them at the generic 5 made the bot ignore the heal piles entirely.
 */
function healItemValue(cardDef: CardDef): number {
  let v = 0;
  for (const e of cardDef.itemEffects ?? []) {
    if (e.kind === 'healFixed20OrTrashWithSecondFor60') v = Math.max(v, HEAL_FIXED_HP);
    else if (e.kind === 'healToFull' || e.kind === 'healSelfAndPartnerToFull') {
      v = Math.max(v, HEAL_FULL_HP);
    }
  }
  return v;
}

/** The "pull" of a market pile top card: how much the bot wants to own it. */
function marketPull(cardDef: CardDef, abilities: readonly CharacterAbility[], bloat: number): number {
  if (cardDef.type === 'weapon') {
    return weaponAffinityBonus(abilities, cardDef);
  }
  if (cardDef.type === 'action') {
    const pull = actionBonusValue(abilities);
    return pull + (bloat > 0 && hasTrashEffect(cardDef) ? trashBloatValue(bloat) : 0);
  }
  if (cardDef.type === 'item') {
    // Healing items keep the bot alive so it can keep exploring (low-HP freeze:
    // at ~10 hp every explore scores 'downed' and the bot stopped fighting).
    return isHealingItem(cardDef) ? HEAL_ITEM_PULL : 0;
  }
  return 0;
}

/** Base value of a weapon from its damage stat: 10 + damage/5 (floored). */
function weaponBaseValue(damage: number): number {
  return 10 + Math.floor(damage / 5);
}

/**
 * Value of an ammunition card's yield when played: what its bonuses grant in
 * pools, scored at the pool weights (ammo 3/point, gold 1-point). Ammo cards
 * with raw ammo > AMMO_USEFUL_CAP (e.g. ammo x10 = ~50) get a flat bonus so
 * they are worth buying even though turn-ammo is capped; otherwise bots never
 * upgrade from stock ammo.
 */
function ammoYieldValue(cardDef: CardDef): number {
  const b = cardDef.bonuses;
  if (b === undefined) return 8;
  const rawAmmo = b.ammo ?? 0;
  let v = 8 + Math.min(rawAmmo, AMMO_USEFUL_CAP) * AMMO_PER_POINT
    + Math.max(0, rawAmmo - AMMO_USEFUL_CAP) * AMMO_EXCESS_PER_POINT
    + (b.gold ?? 0) * GOLD_PER_POINT;
  // Cap-bonus: push high-ammo x10 cards above zero marginal value
  if (rawAmmo > AMMO_USEFUL_CAP) {
    v += AMMO_CAP_BONUS;
  }
  return v;
}

/** True when the action card trashes cards (deck thinning). */
function hasTrashEffect(cardDef: CardDef): boolean {
  return (
    cardDef.actionEffects?.some(
      e => e.kind === 'trashUpToTwoFromDiscard' || e.kind === 'trashHandCard' || e.kind === 'upgradeAmmoBy30Gold',
    ) ?? false
  );
}

/** Extra value a trash effect delivers per point of deck bloat (capped). */
function trashBloatValue(bloat: number): number {
  return Math.min(bloat * TRASH_BLOAT_PER_CARD, TRASH_BLOAT_MAX);
}

/**
 * Value of an action card's text: its bonus icons scored at pool weights
 * (cards drawn 12 each, gold 1, ammo 3, buys/actions/explores 40) plus
 * trash-effect credit and per-action affinity (Ada).
 */
function actionTextValue(cardDef: CardDef, abilities: readonly CharacterAbility[]): number {
  const b = cardDef.bonuses;
  let v = 0;
  if (b !== undefined) {
    v += (b.cards ?? 0) * CARD_DRAW_VALUE;
    v += (b.gold ?? 0) * GOLD_PER_POINT;
    v += (b.ammo ?? 0) * AMMO_PER_POINT;
    v += (b.buys ?? 0) * POOL_PER_BONUS;
    v += (b.actions ?? 0) * POOL_PER_BONUS;
    v += (b.explores ?? 0) * POOL_PER_BONUS;
  }
  v += truncActionCredit(cardDef);
  v += actionBonusValue(abilities);
  if (hasTrashEffect(cardDef)) {
    v += trashAffinityValue(abilities);
  }
  return v;
}

/** Per-trash-action affinity from trashEffectBonus characters (Rebecca L2). */
function trashAffinityValue(abilities: readonly CharacterAbility[]): number {
  let v = 0;
  for (const ability of abilities) {
    if (ability.kind === 'trashEffectBonus') v += ability.amount;
  }
  return v;
}

/** Base credit for the non-icon text of action cards (healing/recovery/etc.). */
function truncActionCredit(cardDef: CardDef): number {
  if (cardDef.actionEffects === undefined || cardDef.actionEffects.length === 0) return 0;
  let v = 0;
  for (const e of cardDef.actionEffects) {
    if (e.kind === 'allWeaponsPlusDamageThisTurn') v += e.amount * 2;
    else if (e.kind === 'recoverWeaponFromDiscardToHand') v += 12;
    else if (e.kind === 'moveHandCardToTopOfInventory') v += 6;
    else if (e.kind === 'negateWeaponCost40OrLessFromHand') v += 8;
    else if (e.kind === 'stealRevealedWeaponsFromOpponentsTopCards') v += 18;
    else if (e.kind === 'upgradeAmmoBy30Gold') v += 12;
    else if (e.kind === 'trashUpToTwoFromDiscard' || e.kind === 'trashHandCard') v += 6;

  }
  return v;
}

/** Per-action-card affinity from actionBonus characters (Ada L2). */
function actionBonusValue(abilities: readonly CharacterAbility[]): number {
  let v = 0;
  for (const ability of abilities) {
    if (ability.kind === 'actionBonus') v += ability.amount;
  }
  return v;
}

/**
 * Extra value this character gets from holding/buying a weapon, from
 * weaponTagPlusDamage ("Barry L2 magnums", "Krauser L2 knives"),
 * ammoReqReduction ("Leon L1 pistols", "Sheva L2 rifles" — cheaper ammo
 * cost is worth roughly half its number in scoring terms) and Jill L1
 * explosivesPlusDamage ("explosives").
 */
function weaponAffinityBonus(abilities: readonly CharacterAbility[], def: CardDef): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind === 'weaponTagPlusDamage' && def.weaponTags?.includes(ability.tag)) {
      bonus += ability.amount;
    }
    if (ability.kind === 'ammoReqReduction' && def.weaponTags?.includes(ability.tag)) {
      bonus += ability.amount / 2;
    }
    if (ability.kind === 'explosivesPlusDamage' && def.weaponTags?.includes('explosive')) {
      bonus += ability.amount;
    }
  }
  return bonus;
}

/** Extra per-ammo-card value from ammunitionBonus (Claire: +Ammo/+Gold). */
function ammunitionValue(abilities: readonly CharacterAbility[]): number {
  let value = 0;
  for (const ability of abilities) {
    if (ability.kind === 'ammunitionBonus') {
      value += ability.ammoAmount * AMMO_PER_POINT + ability.goldAmount * GOLD_PER_POINT;
    }
  }
  return value;
}

/** Extra value per Explore from exploreGoldBonus (Wesker: +Gold per explore). */
function exploreGoldValue(abilities: readonly CharacterAbility[]): number {
  let value = 0;
  for (const ability of abilities) {
    if (ability.kind === 'exploreGoldBonus') {
      value += ability.amount * GOLD_PER_POINT;
    }
  }
  return value;
}