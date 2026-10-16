import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

/**
 * M4-T04: Hand — the active player's cards with click-to-play.
 */

export interface HandProps {
  readonly state: GameState;
  readonly seat: number;
  /** Play a card from hand (caller dispatches playActionCard/playItem/playAmmo). */
  readonly onPlay?: (instanceId: string) => void;
  readonly disabled?: boolean;
}

export function Hand({ state, seat, onPlay, disabled = false }: HandProps): JSX.Element {
  const hand = state.seats[seat]?.hand ?? [];
  if (hand.length === 0) {
    return <div className="hand-empty">No cards in hand</div>;
  }
  return (
    <div className="hand" data-seat={seat}>
      {hand.map((instanceId, i) => {
        const def = defForInstance(state, instanceId);
        if (def === null) {
          return <div key={`${seat}-${i}`} className="card card-hidden">?</div>;
        }
        return (
          <HoverCard key={instanceId} def={def}>
            <button
              type="button"
              className="hand-card"
              onClick={() => onPlay?.(instanceId)}
              disabled={disabled || onPlay === undefined}
              title={`Play ${def.name}`}
            >
              <CardView def={def} compact />
            </button>
          </HoverCard>
        );
      })}
    </div>
  );
}