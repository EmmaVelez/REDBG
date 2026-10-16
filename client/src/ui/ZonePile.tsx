import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { CardBack } from './CardBack';
import { CardView } from './CardView';

/**
 * A visual card pile (deck / discard / mansion): a fanned stack of card backs
 * with a count badge and label. The container carries a data-anim-zone anchor
 * so the flight layer can measure where cards leave from / arrive at.
 */
export interface PileProps {
  readonly label: string;
  readonly count: number;
  /** Anchor id for the flight layer (e.g. "deck-0"). */
  readonly animZone: string;
  /** Optional face-up top card (e.g. your own discard). */
  readonly topDef?: CardDef | null;
  readonly seat?: number;
}

export function ZonePile({ label, count, animZone, topDef = null, seat }: PileProps): JSX.Element {
  const fan = Math.min(count, 3);
  const visibleCount = Math.max(fan, 1);
  return (
    <div className="zone-pile" data-anim-zone={animZone} data-seat={seat} data-pile-count={count}>
      <span className="zone-pile-label">{label}</span>
      <div className="zone-pile-stack" data-pile-count={count}>
        <div className="zone-pile-cards" data-fan={fan}>
          {Array.from({ length: visibleCount }, (_, i) => (
            <div key={i} className="zone-pile-card" data-depth={i}>
              <CardBack compact />
            </div>
          ))}
        </div>
        {topDef !== null && topDef !== undefined && (
          <div className="zone-pile-top">
            <CardView def={topDef} compact />
          </div>
        )}
        <span className="zone-pile-count">{count}</span>
      </div>
    </div>
  );
}