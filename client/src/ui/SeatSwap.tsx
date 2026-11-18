import type { JSX } from 'react';
import type { GameStanding } from './standings';

export type { GameStanding } from './standings';

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
  /**
   * Why the match ended. `allHumansDead` is the server's conclusion when every
   * human seat is dead and the bot-only endgame cannot finish — the Mansion is
   * NOT cleared in that case, so the subtitle must not claim it was.
   */
  readonly endReason?: string;
  readonly playerNames?: readonly string[];
  /** Ranked players, best first (game over). Optional so the old winner line
   *  still renders when the caller has no standings to hand. */
  readonly standings?: readonly GameStanding[];
  readonly onContinue: () => void;
}

export function SeatSwap({ mode, nextName, winners, endReason, playerNames, standings, onContinue }: SeatSwapProps): JSX.Element {
  if (mode === 'gameOver') {
    const names = (winners ?? [])
      .map(s => playerNames?.[s] ?? `Player ${s + 1}`)
      .filter(Boolean);
    const title = names.length > 1 ? 'SHARED VICTORY' : 'CHAMPION';
    const sub = endReason === 'allHumansDead'
      ? 'Your character has fallen. The match is over.'
      : endReason === 'sherryLastAlive'
        ? 'Sherry Birkin is the last Character standing. The match is over.'
        : 'The Mansion is cleared. Congratulations!';

    return (
      <div className="seat-swap-backdrop" data-seat-swap="gameover">
        <div className="seat-swap-frame">
          <h1 className="seat-swap-title">{title}</h1>
          <p className="seat-swap-winner">{names.join(' & ') || 'No one'}</p>
          <p className="seat-swap-sub">{sub}</p>
          {standings !== undefined && standings.length > 0 && (
            <ol className="seat-swap-standings" data-standings>
              {standings.map((s, i) => (
                <li
                  key={s.seat}
                  className={s.winner ? 'seat-swap-standing is-winner' : 'seat-swap-standing'}
                  data-standing={s.seat}
                >
                  <span className="seat-swap-rank">{i + 1}</span>
                  <span className="seat-swap-name">{s.name}</span>
                  <span className="seat-swap-decorations">{s.decorations} ★</span>
                </li>
              ))}
            </ol>
          )}
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