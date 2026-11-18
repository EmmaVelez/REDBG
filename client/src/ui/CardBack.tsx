import type { JSX } from 'react';
import { CARD_BACK_ART } from './cardArt';

/**
 * Face-down card representation — used for deck/discard/mansion piles and as
 * the flying-card visual for face-down travels.
 *
 * The face is the shared CARD-BACK art (the mansion door); the emblem stays
 * as a fallback for when the image has not loaded (or is absent).
 */
export function CardBack({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <div
      className={`card-back ${compact ? 'card-back-compact' : ''}`}
      aria-hidden
      style={CARD_BACK_ART !== undefined ? { backgroundImage: `url(${CARD_BACK_ART})` } : undefined}
    >
      <span className="card-back-emblem">R.E.</span>
    </div>
  );
}