import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

/**
 * M4-T04: Zones — the player's table area.
 *
 * The deck / hand / discard row moved into the ACTION BAR (see ActionBar), so
 * what stays on the board is the play area. It keeps its `data-anim-zone`
 * anchor so the card-flight layer still has a stable target.
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
      <div className="play-area" data-zone="playArea" data-anim-zone="play">
        <span className="zone-label">In play</span>
        <div className="play-area-cards">
          {playArea.length === 0 && <span className="zone-empty">none</span>}
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
    </div>
  );
}