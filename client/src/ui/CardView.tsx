import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { typeLabel, typeClass, statLine, bonusLine, costText } from './cards';
import { HealthRing } from './HealthRing';

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
  /** Current/max HP — character cards swap their cost badge for the HP ring. */
  readonly hp?: number;
  readonly maxHp?: number;
}

export function CardView({ def, compact = false, decorations, hp, maxHp }: CardViewProps): JSX.Element {
  const stats = statLine(def);
  const bonus = bonusLine(def);
  const showRing = def.type === 'character' && hp !== undefined && maxHp !== undefined;
  return (
    <div className={`card ${typeClass(def.type)}`} data-card-id={def.id} data-card-type={def.type}>
      <div className="card-top">
        <span className="card-type">{typeLabel(def.type)}</span>
        {showRing ? (
          <HealthRing hp={hp} maxHp={maxHp} size={34} strokeWidth={5} />
        ) : (
          <span className="card-cost" data-card-cost>{costText(def)}</span>
        )}
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
  // Level model (user ruling): characters start at Level 0 — the panel shows
  // Lv{level − 1}. Each tier carries its own decoration gate: Level 1 at
  // level1At (0 for most, so it is active and green from the start — e.g.
  // Chris starts with his L1; Krauser's L1 gate is 1, so his stays greyed
  // until the first decoration), Level 2 at level2At.
  const level1At = def.level1At ?? 0;
  const level2At = def.level2At ?? 0;
  const levels = def.levels ?? [];
  if (levels.length === 0) {
    return <div className="card-text">{def.text}</div>;
  }
  return (
    <div className="card-skills" data-decorations={decorations} data-level1-at={level1At} data-level2-at={level2At}>
      {levels.map(entry => {
        // Each tier has its own decoration gate. Level 1 uses level1At — 0 for
        // most characters (active from the start, e.g. Chris), 1 for Krauser —
        // and Level 2 uses level2At. Greyed only while decorations are below
        // that tier's gate.
        const gate = entry.level === 1 ? level1At : level2At;
        const need = Math.max(gate - decorations, 0);
        const unlocked = need === 0;
        return (
          <div
            key={entry.level}
            className={`skill-row ${unlocked ? 'skill-unlocked' : 'skill-locked'}`}
            data-skill-level={entry.level}
            data-unlocked={unlocked || undefined}
          >
            <span className="skill-header">
              <span className="skill-level">Lv{entry.level}</span>
              <span className="skill-gate" data-skill-gate>★ {need}</span>
            </span>
            <span className="skill-text">{entry.text}</span>
          </div>
        );
      })}
    </div>
  );
}