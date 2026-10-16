import type { JSX, ReactNode } from 'react';
import type { GameState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { ZonePile } from './ZonePile';
import { defForInstance } from './cards';

/**
 * M4-T04: Zones — the player's table area, laid out as
 *   [ Deck ]  [ hand slot ]  [ Discard ]
 *   [ play area ]
 * Each zone carries a data-anim-zone anchor for the card-flight layer.
 */

export interface ZonesProps {
  readonly state: GameState;
  readonly seat: number;
  /** Rendered in the middle slot (the player's Hand). */
  readonly children?: ReactNode;
}

export function Zones({ state, seat, children }: ZonesProps): JSX.Element {
  const player = state.seats[seat];
  if (player === undefined) {
    return <div className="zones" data-seat={seat} />;
  }
  const playArea = player.playArea;
  const discardTopId = player.discard[0];
  const discardTopDef = discardTopId === undefined ? null : defForInstance(state, discardTopId);
  return (
    <div className="zones" data-seat={seat}>
      <div className="zone-row">
        <ZonePile label="Deck" count={player.inventory.length} animZone="deck" seat={seat} />
        <div className="zone-hand-slot">{children}</div>
        <ZonePile
          label="Discard"
          count={player.discard.length}
          animZone="discard"
          seat={seat}
          topDef={discardTopDef}
        />
      </div>
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