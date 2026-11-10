import type { JSX } from 'react';
import type { CSSProperties } from 'react';
import type { CardDef, GameState } from '@re/game-core';
import { CardView } from './CardView';
import { defForInstance } from './cards';

/**
 * The character and partner cards for one seat, as a horizontal pair.
 *
 * Rendered in the ACTION BAR for the viewing player (see ActionBar) and, for
 * every other seat, inside that seat's PlayerPanel — the markup lives here so
 * the two placements can never drift apart.
 *
 * Both cards use the art-only face (like the resource piles) and there is NO
 * hover popup: hovering a character card scales the whole `.cc-fan` unit up and
 * fades the rules panel in OVER the art. The defeated Infected attached to that
 * character fan out to its right at the same enlarged scale, overlapping the
 * way the hand does.
 */

/**
 * Overlap for the attached-trophy fan, as a fraction of the card width.
 *
 * It grows with the number of trophies — a long row overlaps more so the fan
 * still fits in roughly the same space — and is capped at 0.85 so the cards
 * never stack backwards. At one or two trophies it lands near the hand's own
 * 25-30% overlap.
 */
export function attachedOverlap(count: number): string {
  if (count <= 1) return '0.25';
  return Math.min(0.85, 0.15 + 0.08 * count).toFixed(2);
}

/** Resolve a seat's attached instance ids to defs, keeping the ids as keys. */
function attachedTrophies(state: GameState, ids: readonly string[]): ReadonlyArray<{ id: string; def: CardDef }> {
  return ids
    .map(id => ({ id, def: defForInstance(state, id) }))
    .filter((x): x is { id: string; def: CardDef } => x.def !== null);
}

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
  const mainAttached = attachedTrophies(state, player.attached);
  const partnerAttached = attachedTrophies(state, player.partnerAttached ?? []);
  return (
    <div className="player-character-row" data-character-row>
      {charDef !== null && (
        <div
          className="player-character-card"
          data-character-card
          data-anim-zone="attached"
          style={{ '--cc-overlap': attachedOverlap(mainAttached.length) } as CSSProperties}
        >
          <div className="cc-fan">
            <CardView def={charDef} compact artOnly decorations={player.decorations} hp={player.hp} maxHp={player.maxHp} />
            {mainAttached.length > 0 && (
              <div className="cc-attached-fan" data-attached-fan={mainAttached.length}>
                {mainAttached.map(x => (
                  <CardView key={x.id} def={x.def} compact artOnly />
                ))}
              </div>
            )}
          </div>
          <span className="cc-attached" data-attached-count title="Defeated infected attached to this character">
            {player.attached.length}
          </span>
        </div>
      )}
      {partnerDef !== null && (
        <div
          className="player-character-card player-partner-card"
          data-partner-character-card
          data-anim-zone="attached"
          style={{ '--cc-overlap': attachedOverlap(partnerAttached.length) } as CSSProperties}
        >
          <div className="cc-fan">
            {/* Alliance Partner Modification: "Your Partner's level is determined
                by the total Decorations attached to your Main Character." The
                Partner holds no Decorations of its own, so feed it the Main
                character's count to render the correct level badge / skill
                gating. */}
            <CardView def={partnerDef} compact artOnly decorations={player.decorations} hp={hp} maxHp={maxHp} />
            {partnerAttached.length > 0 && (
              <div className="cc-attached-fan" data-partner-attached-fan={partnerAttached.length}>
                {partnerAttached.map(x => (
                  <CardView key={x.id} def={x.def} compact artOnly />
                ))}
              </div>
            )}
          </div>
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
