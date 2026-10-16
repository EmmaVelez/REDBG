
import type { Action, GameState } from '../types';
import { enumerateLegalActions } from './enumerate';
import { evaluateState } from './evaluate';
import { applyAction } from '../engine/actions';

/**
 * Chooses the greedy 1-ply action for a given seat.
 * It simulates every legal action, evaluates the resulting state, and selects the action
 * that yields the highest score. Ties are broken deterministically by action order.
 *
 * @param state The current game state.
 * @param seat The seat ID for which to choose an action.
 * @returns The chosen Action.
 */
export function chooseGreedyAction(state: GameState, seat: number): Action {
  const legal = enumerateLegalActions(state, seat);

  // 2. If legal.length === 0, return endTurn as a safe deterministic fallback.
  if (legal.length === 0) {
    return { type: 'endTurn', seat };
  }

  // 3. Simulate each candidate
  let best: { action: Action; score: number } | undefined = undefined;

  for (const action of legal) {
    // a. Simulate the action
    const next = applyAction(state, action);
    // b. Score the resulting state
    const score = evaluateState(next, seat);

    // c. If best is undefined OR score is STRICTLY GREATER, update best.
    // This ensures deterministic tie-breaking (first action wins).
    if (best === undefined || score > best.score) {
      best = { action, score };
    }
  }

  // 4. Return best.action. Since legal.length > 0, best must be defined.
  // We use a guard to satisfy strict typing requirements, returning the fallback if somehow undefined.
  if (best === undefined) {
    return { type: 'endTurn', seat };
  }
  return best.action;
}
