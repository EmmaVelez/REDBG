import type { JSX } from 'react';

/**
 * Face-down card representation — used for deck/discard/mansion piles and as
 * the flying-card visual for face-down travels.
 */
export function CardBack({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <div className={`card-back ${compact ? 'card-back-compact' : ''}`} aria-hidden>
      <span className="card-back-emblem">R.E.</span>
    </div>
  );
}