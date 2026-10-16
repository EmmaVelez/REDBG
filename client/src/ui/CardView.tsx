import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { typeLabel, typeClass, statLine, bonusLine, costText } from './cards';

/**
 * M4-T03: CardView — a placeholder card frame. No Bandai artwork; the frame
 * carries type color, name, cost, stat line, bonuses and rules text.
 */

export interface CardViewProps {
  readonly def: CardDef;
  /** Rendered smaller for zone/lobby contexts (default false). */
  readonly compact?: boolean;
}

export function CardView({ def, compact = false }: CardViewProps): JSX.Element {
  const stats = statLine(def);
  const bonus = bonusLine(def);
  return (
    <div className={`card ${typeClass(def.type)}`} data-card-id={def.id} data-card-type={def.type}>
      <div className="card-top">
        <span className="card-type">{typeLabel(def.type)}</span>
        <span className="card-cost" data-card-cost>{costText(def)}</span>
      </div>
      <div className="card-name">{def.name}</div>
      {!compact && stats !== '' && <div className="card-stats">{stats}</div>}
      {!compact && bonus !== '' && <div className="card-bonus">{bonus}</div>}
      {!compact && <div className="card-text">{def.text}</div>}
    </div>
  );
}