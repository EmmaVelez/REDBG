import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import type { ChatEntry } from '../store';

/**
 * M4-T09: GameLog — turn indicator, chat feed, and the last server error
 * (action rejections surface here).
 */

export interface GameLogProps {
  readonly state: GameState | null;
  readonly chat: readonly ChatEntry[];
  readonly lastError: string | null;
  readonly seatNames: readonly string[];
}

export function GameLog({ state, chat, lastError, seatNames }: GameLogProps): JSX.Element {
  const activeName = state !== null ? seatNames[state.activeSeat] ?? `Seat ${state.activeSeat}` : '—';
  return (
    <div className="game-log">
      <div className="log-turn">
        <span className="turn-number" data-turn={state?.turnNumber ?? 0}>Turn {state?.turnNumber ?? 0}</span>
        <span className="turn-active" data-active-seat={state?.activeSeat ?? -1}>Active: {activeName}</span>
        {state !== null && state.phase === 'turnEnd' && <span className="phase-note">— resolving turn end —</span>}
        {state !== null && state.phase === 'gameOver' && <span className="phase-note">— GAME OVER —</span>}
      </div>
      {lastError !== null && <div className="log-error" data-kind="error">{lastError}</div>}
      <ul className="log-chat">
        {chat.map((c, i) => (
          <li key={i} className="log-line">
            <span className="log-seat">[{seatNames[c.seat] ?? `Seat ${c.seat}`}]</span>
            <span className="log-text">{c.text}</span>
          </li>
        ))}
        {chat.length === 0 && <li className="log-empty">No messages yet</li>}
      </ul>
    </div>
  );
}