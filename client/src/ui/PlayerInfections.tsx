import type { JSX } from 'react';
import type { GameState, PlayerState } from '@re/game-core';
import { MAX_INFECTION_LEVEL } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

export interface PlayerInfectionsProps {
  readonly state: GameState;
  readonly seat: number;
}

/**
 * The viewing player's OWN face-up infection cards (IN-001..IN-007), drawn as
 * small art chips in the action dock, immediately right of their character
 * cards. Their count IS the Infection Level, so this is also where a player
 * reads how close they are to the reanimation threshold.
 *
 * Renders nothing outside Outbreak mode or while the seat holds no infections —
 * an empty column would just push the deck/hand apart.
 */
export function PlayerInfections({ state, seat }: PlayerInfectionsProps): JSX.Element | null {
  const player: PlayerState | undefined = state.seats[seat];
  if (player === undefined || state.infectionDeck === undefined) return null;
  const infections = player.infectionCards ?? [];
  if (infections.length === 0) return null;

  return (
    <div className="action-col action-col-infections" data-player-infections>
      <span
        className="player-zone-label"
        title={`Infection Level ${infections.length} of ${MAX_INFECTION_LEVEL}. Reaching ${MAX_INFECTION_LEVEL} kills the character, who reanimates as an Infected Character.`}
      >
        Infections {infections.length}/{MAX_INFECTION_LEVEL}
      </span>
      <div className="player-infections-list">
        {infections.map(id => {
          const def = defForInstance(state, id);
          if (def === null) return null;
          return (
            <HoverCard key={id} def={def}>
              <CardView def={def} compact artOnly />
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
}
