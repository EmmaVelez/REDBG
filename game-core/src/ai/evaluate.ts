
import type { GameState, PlayerState, CardDef } from '../types';

/**
 * Evaluates the heuristic score of a specific seat in the current game state.
 * Higher score means a better position.
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

  // 2.6. Turn Gold
  total += player.turnGold * 5;

  // 2.7. Actions Left
  total += player.actionsLeft * 40;

  // 2.8. Buys Left
  total += player.buysLeft * 40;

  // 2.9. Explores Left
  total += player.exploresLeft * 40;

  // 2.10. Hand weapon count
  let weaponCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (cardInstance) {
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (cardDef && cardDef.type === 'weapon') {
        weaponCount += 1;
      }
    }
  }
  total += weaponCount * 15;

  // 2.11. Hand ammo count
  let ammoCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (cardInstance) {
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (cardDef && cardDef.type === 'ammunition') {
        ammoCount += 1;
      }
    }
  }
  total += ammoCount * 8;

  // 2.12. Hand action count
  let actionCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (cardInstance) {
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (cardDef && cardDef.type === 'action') {
        actionCount += 1;
      }
    }
  }
  total += actionCount * 5;

  // 2.13. Hand item count
  let itemCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (cardInstance) {
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (cardDef && cardDef.type === 'item') {
        itemCount += 1;
      }
    }
  }
  total += itemCount * 5;

  // 2.14. Hand infected/token count
  let infectedTokenCount = 0;
  for (const instanceId of player.hand) {
    const cardInstance = state.cards[instanceId];
    if (cardInstance) {
      const cardDef = state.cardDefs[cardInstance.cardId];
      if (cardDef && (cardDef.type === 'infected' || cardDef.type === 'token')) {
        infectedTokenCount += 1;
      }
    }
  }
  total += infectedTokenCount * 5;

  // 2.15. Inventory size
  total += player.inventory.length * 2;

  // 2.16. Affordable piles
    let affordablePiles = 0;
    for (const pile of Object.values(state.marketPiles)) {
      const topCardInstanceId = pile.cards[0];
      if (topCardInstanceId === undefined) continue;
      const topCardInstance = state.cards[topCardInstanceId];
      if (topCardInstance === undefined) continue;
      const topCardDef = state.cardDefs[topCardInstance.cardId];
      if (topCardDef !== undefined && topCardDef.cost !== undefined && topCardDef.cost <= player.turnGold) {
        affordablePiles += 15;
      }
    }
    total += affordablePiles;

  // 2.17. Attached trophies
  total += player.attached.length * 25;

  // 2.18. Opponents
  for (let i = 0; i < state.seats.length; i++) {
    if (i === seat) continue;

    const opponent = state.seats[i];
    if (opponent) {
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
  }

  return total;
}
