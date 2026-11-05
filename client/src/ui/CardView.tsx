import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { typeLabel, typeClass, statLine, bonusLine, costText } from './cards';
import { HealthRing } from './HealthRing';

/**
 * M4-T03/T11: CardView — card frames. No Bandai artwork; the frame carries
 * type color, name, cost, stat line, bonuses and rules text.
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
}

export function CardView({ def, compact = false, decorations, hp, maxHp, hideCost = false }: CardViewProps): JSX.Element {
  if (def.type === 'character') {
    return <CharacterCard def={def} compact={compact} decorations={decorations} hp={hp} maxHp={maxHp} />;
  }
  const stats = statLine(def);
  const bonus = bonusLine(def);
  return (
    <div className={`card ${typeClass(def.type)}`} data-card-id={def.id} data-card-type={def.type}>
      <div className="card-top">
        <span className="card-type">{typeLabel(def.type)}</span>
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
  readonly decorations?: number;
  readonly hp?: number;
  readonly maxHp?: number;
}

function CharacterCard({ def, compact, decorations, hp, maxHp }: CharacterCardProps): JSX.Element {
  const showRing = hp !== undefined && maxHp !== undefined;
  const level1At = def.level1At ?? 0;
  const level2At = def.level2At ?? 0;
  const levels = def.levels ?? [];
  return (
    <div className="card card-character" data-card-id={def.id} data-card-type="character">
      <div className="cc-head">
        <span className="card-type">[{typeLabel(def.type)}]</span>
        {showRing ? (
          <span className="cc-hp-ring"><HealthRing hp={hp} maxHp={maxHp} size={compact ? 18 : 26} strokeWidth={4} /></span>
        ) : !compact && def.maxHp !== undefined ? (
          <span className="cc-hp">HP {def.maxHp}</span>
        ) : null}
      </div>
      <div className="card-portrait" aria-label="character portrait placeholder" />
      <div className="card-name">{def.name}</div>
      {!compact && (decorations !== undefined && levels.length > 0 ? (
        <div className="card-skills" data-decorations={decorations} data-level1-at={level1At} data-level2-at={level2At}>
          {levels.map(entry => {
            // Each tier has its own decoration gate. Level 1 uses level1At — 0 for
            // most characters (active and green from the start, e.g. Chris), 1 for
            // Krauser — and Level 2 uses level2At. Greyed while decorations are
            // below that tier's gate. The stat box shows [level, gate] like the
            // reference card ("1 2" = level 1, gate 2).
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
                  <SkillIcon text={entry.text} />
                  <span className="skill-level">{entry.level}</span>
                  <span className="skill-gate" data-skill-gate>{gate}</span>
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

/** Pixel glyph for a skill row's stat box: bullet for ammo lines, coin for
 *  gold lines, star otherwise. 8×8 crisp rects for the pixel-art frame. */
function SkillIcon({ text }: { text: string }): JSX.Element {
  const t = text.toLowerCase();
  const kind = t.includes('ammo') ? 'ammo' : t.includes('gold') ? 'gold' : 'star';
  return (
    <svg className="skill-icon" viewBox="0 0 8 8" width="8" height="8" shapeRendering="crispEdges" aria-hidden>
      {kind === 'ammo' && (
        <g fill="currentColor">
          <rect x="3" y="0" width="2" height="1" />
          <rect x="2" y="1" width="4" height="4" />
          <rect x="2" y="5" width="4" height="3" />
        </g>
      )}
      {kind === 'gold' && (
        <g fill="currentColor">
          <rect x="3" y="0" width="2" height="1" />
          <rect x="1" y="1" width="6" height="6" />
          <rect x="3" y="7" width="2" height="1" />
          <rect x="3" y="3" width="2" height="2" fill="#23242a" />
        </g>
      )}
      {kind === 'star' && (
        <g fill="currentColor">
          <rect x="4" y="1" width="1" height="1" />
          <rect x="3" y="2" width="3" height="1" />
          <rect x="2" y="3" width="5" height="2" />
          <rect x="3" y="5" width="2" height="1" />
          <rect x="2" y="6" width="1" height="1" />
          <rect x="5" y="6" width="1" height="1" />
        </g>
      )}
    </svg>
  );
}