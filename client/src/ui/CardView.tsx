import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { typeLabel, typeClass, statLine, bonusLine, costText } from './cards';
import { cardArtUrl } from './cardArt';
import { HealthRing } from './HealthRing';

/**
 * M4-T03/T11: CardView — card frames. The frame carries type color, name, cost,
 * stat line, bonuses and rules text.
 *
 * Cards that have a PNG in `game-core/src/data/CARD-ART/<ID>.png` render it
 * as the card face instead of the plain placeholder frame:
 *   - non-character cards: the art fills the card (it ships with its own
 *     decorative border) and the text rows sit on a scrim at the bottom;
 *   - character cards: the art fills the portrait window above the name bar
 *     and skill list, which stay intact.
 * Cards without art keep the placeholder frame unchanged.
 *
 * Character cards (M5 redesign) use the pixel-art reference frame:
 *   - thick dark outer border with a thin light inner line + corner ticks
 *   - centered `[CHARACTER]` banner under the top border
 *   - large art window (portrait artwork to be supplied later)
 *   - red name on a maroon bar
 *   - pale rules panel holding the SKILL LIST when `decorations` is provided:
 *     one row per level; each row's stat box reads [icon, level, decoration
 *     gate] — the reference card's "1 2" / "2 6" boxes are Claire's level 1
 *     at 2 decorations and level 2 at 6. Locked rows stay greyed until the
 *     player's decorations reach that tier's gate.
 * HP rides in the top-right corner (ring in play, `HP n` chip on static
 * cards) so the frame still reads like the reference.
 */

export interface CardViewProps {
  readonly def: CardDef;
  /** Rendered smaller for zone/lobby contexts (default false). */
  readonly compact?: boolean;
  /** Player's current decorations — enables the character skill list. */
  readonly decorations?: number;
  /** Current/max HP — character cards swap their cost badge for the HP ring. */
  readonly hp?: number;
  readonly maxHp?: number;
  /** Hide the cost badge (e.g. for revealed mansion cards). */
  readonly hideCost?: boolean;
  /**
   * Art-only face for the hand / resource piles: the printed text rows, the
   * type banner and the cost badge are hidden so the artwork fills the card,
   * and fade back in when the card is hovered. Cards WITHOUT art ignore this
   * (there is nothing to show but the text).
   */
  readonly artOnly?: boolean;
}

export function CardView({ def, compact = false, decorations, hp, maxHp, hideCost = false, artOnly = false }: CardViewProps): JSX.Element {
  const art = cardArtUrl(def.id);
  if (def.type === 'character') {
    return <CharacterCard def={def} compact={compact} artOnly={artOnly} decorations={decorations} hp={hp} maxHp={maxHp} art={art} />;
  }
  const stats = statLine(def);
  const bonus = bonusLine(def);
  const artOnlyMode = artOnly && art !== undefined;
  return (
    <div
      className={`card ${typeClass(def.type)}${art !== undefined ? ' card-has-art' : ''}${artOnlyMode ? ' card-art-only' : ''}`}
      data-card-id={def.id}
      data-card-type={def.type}
      data-has-art={art !== undefined || undefined}
      data-art-only={artOnlyMode || undefined}
    >
      {art !== undefined && (
        <img className="card-art-img" src={art} alt="" draggable={false} loading="lazy" decoding="async" />
      )}
      <div className="card-top">
        <span className="card-type">{typeLabel(def.type)}</span>
        {def.type === 'infected' && def.hp !== undefined && (
          <HealthRing hp={def.hp} maxHp={def.hp} size={27} />
        )}
        {!hideCost && <span className="card-cost" data-card-cost>{costText(def)}</span>}
      </div>
      <div className="card-name">{def.name}</div>
      {!compact && stats !== '' && <div className="card-stats">{stats}</div>}
      {!compact && bonus !== '' && <div className="card-bonus">{bonus}</div>}
      {!compact && <div className="card-text">{def.text}</div>}
    </div>
  );
}

interface CharacterCardProps {
  readonly def: CardDef;
  readonly compact: boolean;
  /** Art-only face, matching the resource piles: the rules panel is hidden
   *  until hover. Ignored when the character has no art. */
  readonly artOnly?: boolean;
  readonly decorations?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly art: string | undefined;
}

function CharacterCard({ def, compact, artOnly = false, decorations, hp, maxHp, art }: CharacterCardProps): JSX.Element {
  const showRing = hp !== undefined && maxHp !== undefined;
  const level1At = def.level1At ?? 0;
  const level2At = def.level2At ?? 0;
  const levels = def.levels ?? [];
  // Same rule as a resource card: art-only only means anything when there IS
  // art to show — a character without a PNG keeps its printed rules panel.
  const artOnlyMode = artOnly && art !== undefined;
  return (
    <div
      className={`card card-character${def.set === 'promo' ? ' card-promo' : ''}${artOnlyMode ? ' card-art-only' : ''}`}
      data-card-id={def.id}
      data-card-type="character"
      data-has-art={art !== undefined || undefined}
      data-art-only={artOnlyMode || undefined}
    >
      <div className={`card-portrait${art !== undefined ? ' card-portrait-has-art' : ''}`}>
        {art !== undefined && (
          <img className="card-portrait-img" src={art} alt="" draggable={false} loading="lazy" decoding="async" />
        )}
        {/* The character card scan already prints the [CHARACTER] banner, the
            name and the Health badge, so the app draws none of those. The live
            ring is overlaid on the printed badge instead of sitting in a header
            row — see the --cc-badge-* custom properties in styles.css. */}
        {showRing && (
          <span className="cc-hp-ring"><HealthRing hp={hp} maxHp={maxHp} size={compact ? 24 : 26} strokeWidth={compact ? 3 : 6} /></span>
        )}
      </div>
      {/* The art-only face has no hover POPUP any more (character cards are not
          wrapped in HoverCard). Instead the rules panel is rendered here and
          absolutely positioned OVER the art by CSS, invisible until hover —
          the same reveal a resource card gives its printed rows. It is rendered
          even when `compact` because the overlay replaces the popup. */}
      {(artOnlyMode || !compact) && (decorations !== undefined && levels.length > 0 ? (
        <div className="card-skills" data-decorations={decorations} data-level1-at={level1At} data-level2-at={level2At}>
          {levels.map(entry => {
            // Each tier has its own decoration gate. Level 1 uses level1At — 0 for
            // most characters (active and green from the start, e.g. Chris), 1 for
            // Krauser — and Level 2 uses level2At. The stat box reads "Lv1:★" when
            // that tier is unlocked and "Lv1:☆" while it is still gated (the gate
            // itself is in the tooltip and in data-level1-at / data-level2-at).
            const gate = entry.level === 1 ? level1At : level2At;
            const unlocked = decorations >= gate;
            return (
              <div
                key={entry.level}
                className={`skill-row ${unlocked ? 'skill-unlocked' : 'skill-locked'}`}
                data-skill-level={entry.level}
                data-unlocked={unlocked || undefined}
              >
                <span className="skill-box" title={`Level ${entry.level} · unlocks at ${gate} ★`}>
                  Lv{entry.level}:{unlocked ? '★' : '☆'}
                </span>
                <span className="skill-text">{entry.text}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-text">{def.text}</div>
      ))}
    </div>
  );
}
