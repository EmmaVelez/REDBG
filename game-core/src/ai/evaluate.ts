import type { GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { abilitiesForLevel } from '../engine/characters';

/**
 * Evaluates the heuristic score of a specific seat in the current game state.
 * Higher score means a better position.
 *
 * The score is CHARACTER-AWARE: machine-readable abilities tilt the value of
 * cards toward what the character is good at (e.g. Leon values pistols more,
 * Barry values magnums, Claire values ammo cards, Wesker values explores).
 * Abilities apply only at levels the player has reached (abilitiesForLevel).
 * Generic/text-only abilities add nothing.
 * @param state The current game state.
 * @param seat The index of the seat to evaluate.
 * @returns The heuristic score (number).
 */
export function evaluateState(state: GameState, seat: number): number {
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

  let total = 0;

  // 2. Compute total score

  // 2.1. Downed status
  if (player.downed) {
    total -= 4000;
  }

  // 2.2. Health
  total += player.hp;

  // 2.3. Decorations
  total += player.decorations * 50;

  // 2.4. Level
  if (player.level === 2) {
    total += 200;
  }

  // 2.5. Turn Ammo
  total += player.turnAmmo * 3;

  // 2.6. Turn Gold — transient: resets at turn end, only matters for buying now.
  // Weighted at 1/point so spending it on an owned card can actually win.
  total += player.turnGold;

  // 2.7. Actions Left
  total += player.actionsLeft * 40;

  // 2.8. Buys Left
  total += player.buysLeft * 40;

  // 2.9. Explores Left — plus Wesker-style exploreGoldBonus (gold per explore
  // at the 5-points-per-gold weight).
  total += player.exploresLeft * (40 + exploreGoldValue(abilities));

  // 2.10. Hand cards, split by def type; weapon/ammo cards get ability affinity
  let weaponCount = 0;
  let weaponValue = 0;
  let weaponAffinity = 0;
  let ammoCount = 0;
  let actionCount = 0;
  let itemCount = 0;
  let infectedTokenCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (!cardInstance) continue;
    const cardDef = state.cardDefs[cardInstance.cardId];
    if (!cardDef) continue;
    if (cardDef.type === 'weapon') {
      weaponCount += 1;
      weaponAffinity += weaponAffinityBonus(abilities, cardDef);
      // Weapons are worth more the harder they hit — a buy/keep decision should
      // prefer real damage dealers, not just "a gun". Base 10 + damage/5:
      // Rusty Knife 5 → 11, Handgun 10 → 12, Six Shooter 50 → 20, Rocket 100 → 30.
      weaponValue += cardDef.damage === undefined ? 10 : weaponBaseValue(cardDef.damage);
    } else if (cardDef.type === 'ammunition') {
      ammoCount += 1;
    } else if (cardDef.type === 'action') {
      actionCount += 1;
    } else if (cardDef.type === 'item') {
      itemCount += 1;
    } else if (cardDef.type === 'infected' || cardDef.type === 'token') {
      infectedTokenCount += 1;
    }
  }
  total += weaponValue + weaponAffinity;
  // 2.11. Hand ammo — Claire-style ammunitionBonus adds extra value per card
  total += ammoCount * (8 + ammunitionValue(abilities));
  // 2.12. Hand action
  total += actionCount * 5;
  // 2.13. Hand item
  total += itemCount * 5;
  // 2.14. Hand infected/token
  total += infectedTokenCount * 5;

  // 2.14b. Discard mirrors hand value (bought cards land here; they reshuffle
  // back into the inventory at turn end, so they are real assets). Same type
  // values + affinity so buying a favored weapon is not scored as a total loss.
  for (const instanceId of player.discard) {
    const cardInstance = state.cards[instanceId];
    if (!cardInstance) continue;
    const cardDef = state.cardDefs[cardInstance.cardId];
    if (!cardDef) continue;
    if (cardDef.type === 'weapon') {
      total += (cardDef.damage === undefined ? 10 : weaponBaseValue(cardDef.damage)) + weaponAffinityBonus(abilities, cardDef);
    } else if (cardDef.type === 'ammunition') {
      total += 8 + ammunitionValue(abilities);
    } else if (cardDef.type === 'action' || cardDef.type === 'item' || cardDef.type === 'infected' || cardDef.type === 'token') {
      total += 5;
    }
  }

  // 2.15. Inventory size
  total += player.inventory.length * 2;

  // 2.16. Affordable piles — favored weapon types are worth more to buy
  let affordablePiles = 0;
  for (const pile of Object.values(state.marketPiles)) {
    const topCardInstanceId = pile.cards[0];
    if (topCardInstanceId === undefined) continue;
    const topCardInstance = state.cards[topCardInstanceId];
    if (topCardInstance === undefined) continue;
    const topCardDef = state.cardDefs[topCardInstance.cardId];
    if (topCardDef === undefined || topCardDef.cost === undefined || topCardDef.cost > player.turnGold) continue;
    // Market potential is worth LESS than owned cards (affordable = possibility,
    // not possession) — a fractional 10 (plus affinity) vs owned 15 (+ affinity).
    affordablePiles += 10 + (topCardDef.type === 'weapon' ? weaponAffinityBonus(abilities, topCardDef) : 0);
  }
  total += affordablePiles;

  // 2.17. Attached trophies
  total += player.attached.length * 25;

  // 2.18. Opponents
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

/** Base value of a weapon from its damage stat: 10 + damage/5 (floored). */
function weaponBaseValue(damage: number): number {
  return 10 + Math.floor(damage / 5);
}

/**
 * Extra value this character gets from holding/buying a weapon, from
 * weaponTagBonus ("Leon L2 pistols", "Barry L2 magnums", "Sheva L2 rifles",
 * "Krauser L2 knives") and Jill L1 explosivesPlusDamage ("explosives").
 */
function weaponAffinityBonus(abilities: readonly CharacterAbility[], def: CardDef): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind === 'weaponTagBonus' && def.weaponTags?.includes(ability.tag)) {
      bonus += ability.amount;
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
      value += ability.ammoAmount * 3 + ability.goldAmount * 5;
    }
  }
  return value;
}

/** Extra value per Explore from exploreGoldBonus (Wesker: +Gold per explore). */
function exploreGoldValue(abilities: readonly CharacterAbility[]): number {
  let value = 0;
  for (const ability of abilities) {
    if (ability.kind === 'exploreGoldBonus') {
      value += ability.amount * 5;
    }
  }
  return value;
}