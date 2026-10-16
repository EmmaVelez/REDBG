import {
  setup,
  startTurn,
  checkWin,
  applyAction,
  validateAction,
  viewForSeat,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
} from '@re/game-core';
import type { Action, GameState, PlayerView } from '@re/game-core';

/**
 * M4-T10 pass-and-play hot-seat driver. The full engine runs IN THE BROWSER
 * (no server): this module owns the authoritative state and applies actions
 * exactly like server/src/host.ts does — validate, apply, startTurn after
 * endTurn, then checkWin. Per-seat views come from game-core's `viewForSeat`
 * (the same sanitize implementation the server broadcasts), so the hot-seat
 * game hides every hand except the device holder's.
 */

export type HotseatResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly gameOver: boolean;
      readonly winners: readonly number[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly state: GameState;
      readonly gameOver: false;
      readonly winners: readonly [];
    };

export function createHotseatGame(names: readonly string[], seed: number): GameState {
  if (names.length < 2 || names.length > 4) {
    throw new Error(`pass-and-play needs 2-4 players, got ${names.length}`);
  }
  const players = names.map(name => ({
    name,
    controller: 'human' as const,
    characterCardId: undefined,
  }));
  return setup({ seed, players }, PREMIER_CARDS, FIRST_TIMER_PILES);
}

/** The view the device holder is entitled to: their seats cards, everyone elses hidden. */
export function hotseatView(state: GameState, viewerSeat: number): PlayerView {
  return viewForSeat(state, viewerSeat);
}

/**
 * Applies one action to the authoritative state, mirroring the server host:
 * validate -> apply -> startTurn (after endTurn) -> checkWin.
 */
export function applyHotseatAction(state: GameState, action: Action): HotseatResult {
  const checked = validateAction(state, action);
  if (!checked.ok) {
    return { ok: false, reason: checked.reason, state, gameOver: false, winners: [] };
  }
  let next = applyAction(state, action);
  if (action.type === 'endTurn') {
    next = startTurn(next);
  }
  const win = checkWin(next);
  return { ok: true, state: next, gameOver: win.gameOver, winners: win.winners };
}