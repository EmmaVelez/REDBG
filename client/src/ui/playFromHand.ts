import type { Action, GameState } from '@re/game-core';
import { defForInstance } from './cards';

/**
 * Route a hand click to the right action kind by card type.
 *
 * `playActionCard` handles all cards (weapons/actions/items/ammo); the engine's
 * `applyAction` switch only knows these four kinds, so misrouting a card type
 * to an unknown action throws "unknown action type" in the browser console.
 */

export function playFromHand(
  state: GameState,
  seat: number,
  instanceId: string,
  onAction: (a: Action) => void,
): void {
  const def = defForInstance(state, instanceId);
  if (def === null) return;
  switch (def.type) {
    case 'action':
      onAction({ type: 'playActionCard', seat, instanceId });
      return;
    case 'item':
      onAction({ type: 'playItem', seat, instanceId });
      return;
    case 'ammunition':
      onAction({ type: 'playAmmo', seat, instanceId });
      return;
    case 'weapon':
      // Weapons are card-type items that play into the hand → play area pipeline.
      onAction({ type: 'playActionCard', seat, instanceId });
      return;
    default:
      return; // characters/others have no play action from hand
  }
}
