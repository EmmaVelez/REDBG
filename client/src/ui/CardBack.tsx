import type { JSX } from 'react';
import { CARD_BACK_ART, RESOURCE_BACK_ART } from './cardArt';

/**
 * Face-down card representation — used for deck/discard/mansion piles and as
 * the flying-card visual for face-down travels.
 *
 * The face is the shared CARD-BACK art (the mansion door); the emblem stays
 * as a fallback for when the image has not loaded (or is absent).
 */
/** Which back art to use. `mansion` (default) is the door used by the
 *  reveal flip; `resource` is the biohazard cover for the deck/discard
 *  piles. */
export function CardBack({ compact = false, variant = 'mansion' }: {
  readonly compact?: boolean;
  readonly variant?: 'mansion' | 'resource';
}): JSX.Element {
  const art = variant === 'resource' ? RESOURCE_BACK_ART : CARD_BACK_ART;
  return (
    <div
      className={`card-back ${compact ? 'card-back-compact' : ''}`}
      aria-hidden
      data-back-variant={variant}
      style={art !== undefined ? { backgroundImage: `url(${art})` } : undefined}
    >
      <span className="card-back-emblem">R.E.</span>
    </div>
  );
}