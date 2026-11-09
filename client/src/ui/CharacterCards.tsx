import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

/**
 * The character and partner cards for one seat, as a horizontal pair.
 *
 * Rendered in the ACTION BAR for the viewing player (see ActionBar) and, for
 * every other seat, inside that seat's PlayerPanel — the markup lives here so
 * the two placements can never drift apart.
 */

export interface CharacterCardsProps {
  readonly state: GameState;
  readonly seat: number;
}

export function CharacterCards({ state, seat }: CharacterCardsProps): JSX.Element | null {
  const player = state.seats[seat];
  if (player === undefined) return null;
  const charDef = defForInstance(state, player.characterInstanceId);
  const partnerDef = defForInstance(state, player.partnerInstanceId);
  if (charDef === null && partnerDef === null) return null;

  return (
    <div className="player-character-row" data-character-row>
      {charDef !== null && (
        <div className="player-character-card" data-character-card data-anim-zone="attached">
          <HoverCard def={charDef} decorations={player.decorations} hp={player.hp} maxHp={player.maxHp}>
            <CardView def={charDef} compact decorations={player.decorations} hp={player.hp} maxHp={player.maxHp} />
          </HoverCard>
        </div>
      )}
      {partnerDef !== null && (
        <div className="player-character-card player-partner-card" data-partner-character-card data-anim-zone="attached">
          <HoverCard def={partnerDef} decorations={0} hp={player.partnerHp ?? player.hp} maxHp={player.partnerMaxHp ?? player.maxHp}>
            <CardView def={partnerDef} compact decorations={0} hp={player.partnerHp ?? player.hp} maxHp={player.partnerMaxHp ?? player.maxHp} />
          </HoverCard>
          <span className="player-partner-hp" data-partner-hp>
            HP {player.partnerHp ?? player.hp}/{player.partnerMaxHp ?? player.maxHp}
          </span>
          <span className="player-partner-attached">Attached {player.partnerAttached?.length ?? 0}</span>
        </div>
      )}
    </div>
  );
}
