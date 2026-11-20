import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { CSSProperties } from 'react';
import type { CardDef, GameState } from '@re/game-core';
import { CardView } from './CardView';
import { defForInstance } from './cards';
import { CHARACTER_BACK_ART } from './cardArt';
import { useDamageEffect } from './useDamageEffect';

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
  const hasPoison = (player.counters ?? []).length > 0;
  const mainAttached = attachedTrophies(state, player.attached);
  const partnerAttached = attachedTrophies(state, player.partnerAttached ?? []);

  // Damage flash for both character and partner cards.  The hook fires when HP
  // drops below the previous render's value.  Poison-only detection (no HP
  // drop) is handled separately via the hasPoison flag above.
  //
  // Each card watches its OWN Health: `hp`/`maxHp` below are the PARTNER's
  // (falling back to the Main's when the seat has no partner), so the Main card
  // must not reuse them. Passing the partner's HP here made the Main gauge
  // display — and animate — the partner's Health (verified: hp 80 / partnerHp 30
  // rendered `30/100` on the Main card).
  const { flash: charFlash, animHp: charAnimHp } = useDamageEffect(player.hp, player.maxHp, `${seat}-char`);
  const { flash: partnerFlash, animHp: partnerAnimHp } = useDamageEffect(hp, maxHp, `${seat}-partner`);

  // FACE-DOWN state. The flip is driven by a TRANSITION of the seat's
  // downed flag, so it plays once: down on death, up on revive. A dead
  // seat never flips back (revive is impossible when dead).
  const downed = player.downed;
  const dead = player.dead;
  const wasDownedRef = useRef(downed);
  const [flip, setFlip] = useState<'none' | 'down' | 'up'>('none');
  useEffect(() => {
    const was = wasDownedRef.current;
    wasDownedRef.current = downed;
    if (was === downed) return;
    setFlip(downed ? 'down' : 'up');
  }, [downed]);
  useEffect(() => {
    if (flip === 'none') return;
    const t = setTimeout(() => setFlip('none'), 900);
    return () => clearTimeout(t);
  }, [flip]);
  // The resting state: a downed/dead seat stays face down after the
  // animation finishes.
  const faceDown = downed || dead;
  const flipClass = flip !== 'none' ? ` cc-flipping-${flip}` : (faceDown ? ' cc-face-down' : '');

  return (
    <div className="player-character-row" data-character-row>
      {charDef !== null && (
        <div
          className={`player-character-card${(hasPoison || charFlash) ? ' has-damage' : ''}`}
          data-character-card
          data-anim-zone="attached"
          data-poison={hasPoison ? true : undefined}
          style={{ '--cc-overlap': attachedOverlap(mainAttached.length) } as CSSProperties}
        >
          <div className={`cc-fan${flipClass}`} data-cc-flip={flip !== 'none' ? flip : (faceDown ? 'down' : 'up')}>
            <CardView def={charDef} compact artOnly decorations={player.decorations} hp={player.hp} maxHp={player.maxHp} poisoned={hasPoison} cardAnimHp={charAnimHp} />
            {CHARACTER_BACK_ART !== undefined && (
              <div className="cc-back" data-cc-back style={{ backgroundImage: `url(${CHARACTER_BACK_ART})` }} />
            )}
            {mainAttached.length > 0 && (
              <div className="cc-attached-fan" data-attached-fan={mainAttached.length}>
                {mainAttached.map(x => (
                  <CardView key={x.id} def={x.def} compact artOnly />
                ))}
              </div>
            )}
          </div>
          {/* Counters (Unofficial Expansion Poison) are attached to the seat's
              Character. The board only renders other seats' panels, so without
              this the viewing player's own counter was invisible. */}
          {(player.counters ?? []).length > 0 && (
            <span className="cc-counters" data-player-counters>
              {(player.counters ?? []).map(id => {
                const counterDef = defForInstance(state, id);
                return counterDef === null ? null : <CardView key={id} def={counterDef} compact artOnly />;
              })}
            </span>
          )}
          <span className="cc-attached" data-attached-count title="Defeated infected attached to this character">
            {player.attached.length}
          </span>
        </div>
      )}
      {partnerDef !== null && (
        <div
          className={`player-character-card player-partner-card${(hasPoison || partnerFlash) ? ' has-damage' : ''}`}
          data-partner-character-card
          data-anim-zone="attached"
          style={{ '--cc-overlap': attachedOverlap(partnerAttached.length) } as CSSProperties}
        >
          <div className={`cc-fan${flipClass}`} data-cc-flip={flip !== 'none' ? flip : (faceDown ? 'down' : 'up')}>
            {/* Alliance Partner Modification: "Your Partner's level is determined
                by the total Decorations attached to your Main Character." The
                Partner holds no Decorations of its own, so feed it the Main
                character's count to render the correct level badge / skill
                gating. */}
            <CardView def={partnerDef} compact artOnly decorations={player.decorations} hp={hp} maxHp={maxHp} poisoned={hasPoison} cardAnimHp={partnerAnimHp} />
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
