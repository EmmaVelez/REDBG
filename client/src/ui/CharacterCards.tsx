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
 *
 * Both cards use the art-only face (like the resource piles): the rules panel
 * is hidden until hover, and the hover POPUP still shows it in full. The two
 * cards render identically — the partner's attached count is a badge overlaid
 * on the art, in the style of a zone-pile count, not text underneath.
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

  const hp = player.partnerHp ?? player.hp;
  const maxHp = player.partnerMaxHp ?? player.maxHp;
  return (
    <div className="player-character-row" data-character-row>
      {charDef !== null && (
        <div className="player-character-card" data-character-card data-anim-zone="attached">
          <HoverCard def={charDef} decorations={player.decorations} hp={player.hp} maxHp={player.maxHp}>
            <CardView def={charDef} compact artOnly decorations={player.decorations} hp={player.hp} maxHp={player.maxHp} />
          </HoverCard>
          <span className="cc-attached" data-attached-count title="Defeated infected attached to this character">
            {player.attached.length}
          </span>
        </div>
      )}
      {partnerDef !== null && (
        <div className="player-character-card player-partner-card" data-partner-character-card data-anim-zone="attached">
          <HoverCard def={partnerDef} decorations={0} hp={hp} maxHp={maxHp}>
            <CardView def={partnerDef} compact artOnly decorations={0} hp={hp} maxHp={maxHp} />
          </HoverCard>
          <span
            className="cc-attached"
            data-partner-attached-count
            title="Defeated infected attached to your Partner"
          >
            {player.partnerAttached?.length ?? 0}
          </span>
        </div>
      )}
    </div>
  );
}
