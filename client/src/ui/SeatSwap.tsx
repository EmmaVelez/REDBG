import type { JSX } from 'react';

/**
 * M4-T10 seat-swap screen. Two modes:
 * - pass: the turn moved to another seat — show whose device it is now, and
 *   reveal their hand only when they tap through (hidden-hand reveal).
 * - gameOver: show the winners and offer a return to the lobby.
 */
export interface SeatSwapProps {
  readonly mode: 'pass' | 'gameOver';
  /** Name of the player the device is being passed to (pass mode). */
  readonly nextName?: string;
  readonly winners?: readonly number[];
  readonly playerNames?: readonly string[];
  readonly onContinue: () => void;
}

export function SeatSwap({ mode, nextName, winners, playerNames, onContinue }: SeatSwapProps): JSX.Element {
  if (mode === 'gameOver') {
    const names = (winners ?? [])
      .map(s => playerNames?.[s] ?? `Player ${s + 1}`)
      .filter(Boolean);
    const title = names.length > 1 ? 'SHARED VICTORY' : 'CHAMPION';
    return (
      <div className="seat-swap-backdrop" data-seat-swap="gameover">
        <div className="seat-swap-frame">
          <h1 className="seat-swap-title">{title}</h1>
          <p className="seat-swap-winner">{names.join(' & ') || 'No one'}</p>
          <p className="seat-swap-sub">The Mansion is cleared. Congratulations!</p>
          <button type="button" className="btn-primary" onClick={onContinue}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="seat-swap-backdrop" data-seat-swap="pass">
      <div className="seat-swap-frame">
        <h1 className="seat-swap-title">PASS THE DEVICE</h1>
        <p className="seat-swap-winner">{nextName ?? 'Next player'}</p>
        <p className="seat-swap-sub">It&apos;s your turn. Tap to reveal your hand.</p>
        <button type="button" className="btn-primary" onClick={onContinue}>
          Reveal my hand
        </button>
      </div>
    </div>
  );
}