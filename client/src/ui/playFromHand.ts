import type { Action, GameState } from '@re/game-core';
import { defForInstance } from './cards';

/**
 * Route a hand click to the right action kind by card type.
 *
 * `playActionCard` handles action cards, `playItem` items, `playAmmo`
 * ammunition. Weapons are deliberately absent: the rulebook has you play them
 * as part of an Explore ("that Player plays all of their Weapons they will be
 * using"), never as a standalone action, so the ActionBar opens the explore
 * picker for a clicked weapon instead of dispatching anything here.
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
    default:
      return; // weapons (used via Explore) and characters have no play action from hand
  }
}
