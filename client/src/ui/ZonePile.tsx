import type { JSX } from 'react';
import type { CSSProperties } from 'react';
import type { CardDef } from '@re/game-core';
import { CardBack } from './CardBack';
import { CardView } from './CardView';

/** Cap on the hover fan — a long discard must not span the whole dock. */
const ZONE_FAN_MAX = 8;

/** Overlap between fanned cards as a fraction of the pile card width. */
function fanOverlap(n: number): number {
  if (n <= 1) return 0.3;
  return Math.max(0.16, Math.min(0.3, 26 / (n * 60)));
}

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
  /** Cards fanned out to the LEFT on hover (the discard's contents). */
  readonly fanDefs?: readonly CardDef[];
}

export function ZonePile({ label, count, animZone, topDef = null, seat, fanDefs }: PileProps): JSX.Element {
  const fan = Math.min(count, 3);
  const visibleCount = Math.max(fan, 1);
  // The hover fan mirrors the character's attached-trophy fan, but opens
  // to the LEFT (the discard is the rightmost column of the dock).
  const fanCards = (fanDefs ?? []).slice(0, ZONE_FAN_MAX);
  const overlap = fanOverlap(fanCards.length);
  return (
    <div className="zone-pile" data-anim-zone={animZone} data-seat={seat} data-pile-count={count}>
      <span className="zone-pile-label">{label}</span>
      <div className="zone-pile-stack" data-pile-count={count}>
        <div className="zone-pile-cards" data-fan={fan}>
          {Array.from({ length: visibleCount }, (_, i) => (
            <div key={i} className="zone-pile-card" data-depth={i}>
              <CardBack compact variant="resource" />
            </div>
          ))}
        </div>
        {topDef !== null && topDef !== undefined && (
          <div className="zone-pile-top">
            <CardView def={topDef} compact />
          </div>
        )}
        {fanCards.length > 0 && (
          <div
            className="zone-pile-fan"
            data-zone-fan={fanCards.length}
            style={{ '--zf-overlap': overlap } as CSSProperties}
          >
            {fanCards.map((def, i) => (
              <div className="zone-pile-fan-card" key={`${def.id}-${i}`} data-fan-index={i}>
                <CardView def={def} compact />
              </div>
            ))}
          </div>
        )}
        <span className="zone-pile-count">{count}</span>
      </div>
    </div>
  );
}