import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

/**
 * M4-T04: Zones — deck/discard counts and the face-up play area for a seat.
 */

export interface ZonesProps {
  readonly state: GameState;
  readonly seat: number;
}

export function Zones({ state, seat }: ZonesProps): JSX.Element {
  const player = state.seats[seat];
  if (player === undefined) {
    return <div className="zones" data-seat={seat} />;
  }
  const playArea = player.playArea;
  return (
    <div className="zones" data-seat={seat}>
      <div className="zone-counts">
        <span className="zone-count" title="Inventory (draw pile)">Deck: {player.inventory.length}</span>
        <span className="zone-count" title="Discard pile">Discard: {player.discard.length}</span>
        <span className="zone-count" title="Cards in hand">Hand: {player.hand.length}</span>
      </div>
      {playArea.length > 0 && (
        <div className="play-area" data-zone="playArea">
          <span className="zone-label">In play</span>
          <div className="play-area-cards">
            {playArea.map((instanceId, i) => {
              const def = defForInstance(state, instanceId);
              if (def === null) {
                return <div key={`${seat}-pa-${i}`} className="card card-hidden">?</div>;
              }
              return (
                <HoverCard key={instanceId} def={def}>
                  <CardView def={def} compact />
                </HoverCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}