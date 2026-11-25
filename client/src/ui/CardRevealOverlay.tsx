import type { JSX } from 'react';
import type { Action, CardReveal, CardRevealPile, GameState } from '@re/game-core';
import { CardView } from './CardView';
import { defForInstance } from './cards';

/**
 * Non-explore ability/effect reveal overlay.
 *
 * When an ability or effect reveals a card from any pile (Ada's Mansion peek,
 * the PDA, Master of Unlocking, Ricardo's Inventory reveal, Hunk's hand,
 * SK-029's pistols, Cover-up, Wesker's Secret, the Bolt-Action Rifle, …) the
 * engine records the revealed cards on the action's log entry and the app
 * pauses on this overlay until the player taps it away.
 *
 * This is deliberately separate from the mansion-door overlay: an explore
 * reveal resolves a fight and shows a battle line, while these are single
 * peeks that leave the card where it was.
 */

const PILE_LABEL: Record<CardRevealPile, string> = {
  mansion: 'the Mansion',
  inventory: 'the Inventory',
  hand: 'a hand',
  discard: 'the Discard Pile',
  market: 'the Resource Area',
  deck: 'the Deck',
};

export interface CardRevealOverlayProps {
  readonly state: GameState;
  readonly reveals: readonly CardReveal[];
  readonly action: Action;
  readonly mySeat: number;
  readonly onDismiss: () => void;
}

/** Short human label for what caused the reveal, derived from the action. */
function sourceLabel(state: GameState, action: Action): string {
  if (action.type === 'playActionCard') {
    return defForInstance(state, action.instanceId)?.name ?? 'An action card';
  }
  if (action.type === 'useCharacterAbility') {
    const player = state.seats[action.seat];
    // Aya Brea L2: the ability belongs to ANOTHER character, so label it from
    // the donor named in `borrowedFrom`, not the activating seat.
    const def = action.borrowedFrom !== undefined
      ? state.cardDefs[action.borrowedFrom]
      : defForInstance(state, player?.characterInstanceId);
    const name = def?.name ?? 'A character';
    return name.includes(' ') ? name.split(' ')[0] ?? name : name;
  }
  if (action.type === 'explore') return 'A weapon effect';
  return 'An effect';
}

export function CardRevealOverlay({ state, reveals, action, mySeat, onDismiss }: CardRevealOverlayProps): JSX.Element {
  const actorSeat = 'seat' in action ? action.seat : mySeat;
  const source = sourceLabel(state, action);
  return (
    <div className="ability-reveal-backdrop" data-card-reveal onClick={onDismiss}>
      <div className="ability-reveal-panel" data-card-reveal-panel>
        <span className="ability-reveal-title">Revealed</span>
        <span className="ability-reveal-source" data-card-reveal-source={source}>{source}</span>
        <div className="ability-reveal-cards">
          {reveals.map(r => {
            const def = defForInstance(state, r.instanceId);
            if (def === null) return null;
            const owner = r.ownerSeat ?? actorSeat;
            const ownerName = state.seats[owner]?.name;
            const mine = owner === actorSeat;
            return (
              <div className="ability-reveal-card" key={r.instanceId} data-card-reveal-card={r.instanceId}>
                <CardView def={def} compact />
                <span className="ability-reveal-caption">
                  {ownerName !== undefined && !mine ? `${ownerName} · ` : ''}{PILE_LABEL[r.pile]}
                </span>
              </div>
            );
          })}
        </div>
        <span className="ability-reveal-hint">Tap to continue</span>
      </div>
    </div>
  );
}
