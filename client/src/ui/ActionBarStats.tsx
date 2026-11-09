import type { JSX } from 'react';
import type { ConnectionStatus } from '../net/ws';

export interface ActionBarStatsProps {
  /** Current health. */
  readonly hp: number;
  /** Maximum health. */
  readonly maxHp: number;
  /** Gold remaining this turn. */
  readonly gold: number;
  /** Ammo remaining this turn. */
  readonly ammo: number;
  /** Actions remaining this turn. */
  readonly actions: number;
  /** Buys remaining this turn. */
  readonly buys: number;
  /** Game-wide turn counter. */
  readonly turn?: number;
  /** Decorations held by EVERY player, summed — the game's shared progress. */
  readonly decorations?: number;
  /** Room code chip; null/undefined in pass-and-play. */
  readonly roomCode?: string | null;
  /** Connection status chip. */
  readonly status?: ConnectionStatus;
}

/**
 * The action bar's stat chips: the viewing player's per-turn numbers, then the
 * game-level counters (turn, total decorations) and finally the room code and
 * connection status, which used to sit in the dock's lower-right corner.
 */
export function ActionBarStats({ hp, maxHp, gold, ammo, actions, buys, turn, decorations, roomCode = null, status }: ActionBarStatsProps): JSX.Element {
  return (
    <div className="action-stats" data-action-stats>
      <span className="action-stat action-stat-hp" data-stat="hp">HP <strong>{hp}/{maxHp}</strong></span>
      <span className="action-stat action-stat-gold" data-stat="gold">Gold <strong>{gold}</strong></span>
      <span className="action-stat action-stat-ammo" data-stat="ammo">Ammo <strong>{ammo}</strong></span>
      <span className="action-stat action-stat-actions" data-stat="actions">Actions <strong>{actions}</strong></span>
      <span className="action-stat action-stat-buys" data-stat="buys">Buys <strong>{buys}</strong></span>
      {turn !== undefined && (
        <span className="action-stat action-stat-turn" data-stat="turn">Turn <strong>{turn}</strong></span>
      )}
      {decorations !== undefined && (
        <span
          className="action-stat action-stat-decorations"
          data-stat="decorations"
          title="Total decorations held by all players"
        >
          ★ <strong>{decorations}</strong>
        </span>
      )}
      {roomCode !== null && roomCode !== undefined && (
        <span className="action-stat action-stat-room app-room" data-stat="room">Room <strong>{roomCode}</strong></span>
      )}
      {status !== undefined && (
        <span
          className={`action-stat action-stat-status app-status app-status-${status}`}
          data-app-status={status}
          data-stat="status"
        >
          <strong>{status}</strong>
        </span>
      )}
    </div>
  );
}
