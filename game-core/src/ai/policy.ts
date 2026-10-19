
import type { Action, GameState } from '../types';
import { enumerateLegalActions } from './enumerate';
import { evaluateState } from './evaluate';
import { applyAction } from '../engine/actions';

/**
 * Flat score bonus applied to explore candidates (all difficulties).
 *
 * Why: the evaluator is position-based and 1-ply greedy. Exploring only pays
 * off WHEN the fight is won (decorations/attach/level-ups) — an explore the
 * bot cannot win scores as pure damage, so without a bias the bot hoards
 * (endless playAmmo/buy loops, measured 0.05 explores per turn and 300+
 * turn games). Fighting is how the game is played: decorations win, the
 * mansion must be thinned to reach Uroboros, and reveals can be loot. The
 * bias cannot override catastrophe — a lethal explore still scores downed
 * (-4000) — so the bot stays shy at low HP but trades chip damage for
 * progress when healthy.
 */
export const EXPLORE_BIAS = 80;

/**
 * True when applying the action changed nothing meaningful (only version/log
 * counters moved). No-op candidates (e.g. useCharacterAbility on a generic
 * ability is a pass-through in the apply layer) must NEVER win: they score at
 * least as high as any resource-spending action (nothing was spent) and would
 * make the bot loop on them forever, stalling the game.
 */
function sameCoreState(a: GameState, b: GameState): boolean {
  return (
    a.phase === b.phase &&
    a.activeSeat === b.activeSeat &&
    a.turnNumber === b.turnNumber &&
    a.winners.length === b.winners.length &&
    JSON.stringify(a.seats) === JSON.stringify(b.seats) &&
    JSON.stringify(a.marketPiles) === JSON.stringify(b.marketPiles) &&
    JSON.stringify(a.mansionDeck) === JSON.stringify(b.mansionDeck) &&
    JSON.stringify(a.mansionBottom) === JSON.stringify(b.mansionBottom) &&
    JSON.stringify(a.prompts) === JSON.stringify(b.prompts) &&
    JSON.stringify(a.removed) === JSON.stringify(b.removed)
  );
}

/**
 * Chooses the greedy 1-ply action for a given seat.
 * It simulates every legal action, evaluates the resulting state, and selects the action
 * that yields the highest score. Ties are broken deterministically by action order.
 * No-op candidates (state unchanged) are skipped — see sameCoreState.
 *
 * End-turn honesty: the apply layer's endTurn keeps the seat's turn pools (gold,
 * ammo, actions) in the state, but the game loop's startTurn zeroes them when
 * that seat's next turn begins — the pools can never buy anything after the turn
 * ends. Simulating endTurn against the raw post-state would let it win purely on
 * phantom unspent gold, so the evaluated post-state zeroes them.
 *
 * @param state The current game state.
 * @param seat The seat ID for which to choose an action.
 * @returns The chosen Action.
 */
export function chooseGreedyAction(state: GameState, seat: number): Action {
  // Terminal board: every seat dead (or none alive). The game is over — no
  // action can advance it, and simulating endTurn would throw inside
  // nextAliveSeat('no alive seats'). Defensively return the fallback; callers
  // should check checkWin() before asking the policy for a move.
  if (state.seats.every(s => s.dead)) {
    return { type: 'endTurn', seat };
  }

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

    // a2. Skip no-ops — the state did not change (generic ability uses are
    // pass-throughs). Without this the bot would choose the same non-move
    // forever: it spends nothing, so it always scores >= any real action.
    if (sameCoreState(state, next)) {
      continue;
    }

    // b. Score the resulting state — with honest end-turn carry-over: endTurn
        // keeps the seat's turn pools in the raw post-state, but the game loop's
        // startTurn zeroes them; the dumped hand must also score at held value
        // (no arbitrage). Non-endTurn actions score normally. Explores get the
        // flat fighting bias (see EXPLORE_BIAS).
        const raw = action.type === 'endTurn'
          ? evaluateState(withSpentTurnPoolsZeroed(next, seat), seat, { clampDiscardToHeld: true })
          : evaluateState(next, seat);
        const score = action.type === 'explore' ? raw + EXPLORE_BIAS : raw;

    // c. If best is undefined OR score is STRICTLY GREATER, update best.
    // This ensures deterministic tie-breaking (first action wins).
    if (best === undefined || score > best.score) {
      best = { action, score };
    }
  }

  // 4. Return best.action. If every legal action was a no-op (extreme edge),
  // fall back to endTurn — the one action that always changes the turn state.
  if (best === undefined) {
    return { type: 'endTurn', seat };
  }
  return best.action;
}

/**
 * Returns a copy of the state where the given seat's turn-scoped pools are
 * zeroed — the state that seat actually faces once its turn has ended and
 * startTurn has wiped the pools (spent gold/ammo cannot carry into the next
 * round by design of the engine loop).
 */
function withSpentTurnPoolsZeroed(state: GameState, seat: number): GameState {
  return {
    ...state,
    seats: state.seats.map(s =>
      s.seat === seat
        ? {
            ...s,
            turnGold: 0,
            turnAmmo: 0,
            actionsLeft: 0,
            buysLeft: 0,
            exploresLeft: 0,
            weaponDamageBonusThisTurn: 0,
          }
        : s,
    ),
  };
}
