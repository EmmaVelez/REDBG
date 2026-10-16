import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { GameState } from '@re/game-core';
import type { ChatEntry } from '../store';
import { formatTurnHistory } from './turnHistory';

/**
 * M4-T09/T11: GameLog — turn indicator, scrollable TURN HISTORY (all seats),
 * chat feed, and the last server error.
 */

export interface GameLogProps {
  readonly state: GameState | null;
  readonly chat: readonly ChatEntry[];
  readonly lastError: string | null;
  readonly seatNames: readonly string[];
}

export function GameLog({ state, chat, lastError, seatNames }: GameLogProps): JSX.Element {
  const historyRef = useRef<HTMLDivElement>(null);
  const history = state !== null ? formatTurnHistory(state) : [];
  const logLength = history.length;

  // keep the history pinned to the newest entry
  useEffect(() => {
    const el = historyRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logLength]);

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

      <div className="log-history">
        <span className="log-section">Turn history</span>
        <div className="log-history-scroll" ref={historyRef} data-kind="history">
          {history.map(line => (
            <div key={line.seq} className="history-line" data-history>
              <span className="history-turn">T{line.turn}</span>
              <span className="history-seat">{line.seatName}:</span>
              <span className="history-text">{line.text}</span>
            </div>
          ))}
          {history.length === 0 && <div className="log-empty">No actions yet</div>}
        </div>
      </div>

      <div className="log-chat-block">
        <span className="log-section">Chat</span>
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
    </div>
  );
}