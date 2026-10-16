import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { typeLabel, typeClass, statLine, bonusLine, costText } from './cards';

/**
 * M4-T03/T11: CardView — a placeholder card frame. No Bandai artwork; the
 * frame carries type color, name, cost, stat line, bonuses and rules text.
 *
 * Character cards additionally render their SKILL LIST when `decorations` is
 * provided: one row per level with the decoration-point unlock gate; locked
 * skills are greyed out until the player's decoration total reaches the
 * level-2 threshold (`level2At`).
 */

export interface CardViewProps {
  readonly def: CardDef;
  /** Rendered smaller for zone/lobby contexts (default false). */
  readonly compact?: boolean;
  /** Player's current decorations — enables the character skill list. */
  readonly decorations?: number;
}

export function CardView({ def, compact = false, decorations }: CardViewProps): JSX.Element {
  const stats = statLine(def);
  const bonus = bonusLine(def);
  return (
    <div className={`card ${typeClass(def.type)}`} data-card-id={def.id} data-card-type={def.type}>
      <div className="card-top">
        <span className="card-type">{typeLabel(def.type)}</span>
        <span className="card-cost" data-card-cost>{costText(def)}</span>
      </div>
      <div className="card-name">{def.name}</div>
      {def.type === 'character' && decorations !== undefined ? (
        <CharacterSkills def={def} decorations={decorations} />
      ) : (
        <>
          {!compact && stats !== '' && <div className="card-stats">{stats}</div>}
          {!compact && bonus !== '' && <div className="card-bonus">{bonus}</div>}
          {!compact && <div className="card-text">{def.text}</div>}
        </>
      )}
    </div>
  );
}

function CharacterSkills({ def, decorations }: { def: CardDef; decorations: number }): JSX.Element {
  const level2At = def.level2At ?? 0;
  const levels = def.levels ?? [];
  if (levels.length === 0) {
    return <div className="card-text">{def.text}</div>;
  }
  return (
    <div className="card-skills" data-decorations={decorations} data-level2-at={level2At}>
      {levels.map(entry => {
        // Level 1 is always unlocked; level 2 unlocks at the decoration gate.
        const unlocked = entry.level === 1 || decorations >= level2At;
        const need = entry.level === 1 ? 0 : Math.max(level2At - decorations, 0);
        return (
          <div
            key={entry.level}
            className={`skill-row ${unlocked ? 'skill-unlocked' : 'skill-locked'}`}
            data-skill-level={entry.level}
            data-unlocked={unlocked || undefined}
          >
            <span className="skill-header">
              <span className="skill-level">Lv{entry.level}</span>
              {!unlocked && <span className="skill-gate" data-skill-gate>★ {need}</span>}
              {unlocked && entry.level > 1 && <span className="skill-gate skill-gate-open">unlocked</span>}
            </span>
            <span className="skill-text">{entry.text}</span>
          </div>
        );
      })}
    </div>
  );
}