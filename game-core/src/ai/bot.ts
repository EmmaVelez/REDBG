
import type { Action, GameState } from '../types';
import { enumerateLegalActions } from './enumerate';
import { chooseGreedyAction } from './policy';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

/**
 * Chooses an action for the bot based on difficulty.
 * Hard bots play greedily. Easy/Normal bots introduce noise.
 *
 * @param state The current game state.
 * @param seat The seat of the bot.
 * @param difficulty The difficulty level ('easy', 'normal', 'hard').
 * @param rand A deterministic random number generator (0..1).
 * @returns The chosen Action.
 */
export function chooseBotAction(state: GameState, seat: number, difficulty: BotDifficulty, rand: () => number = Math.random): Action {
  // 1. Get all legal actions
  const legal = enumerateLegalActions(state, seat);

  // 2. Safe fallback if no actions are legal
  if (legal.length === 0) {
    return { type: 'endTurn', seat };
  }

  // 3. Hard mode: always greedy
  if (difficulty === 'hard') {
    return chooseGreedyAction(state, seat);
  }

  // 4. Compute noise probability (Normal defaults to 0.2)
  const noiseProbability = difficulty === 'easy' ? 0.5 : 0.2;

  // 5. Single rand() call decides noisy vs greedy AND selects random index
  const r = rand();

  if (r < noiseProbability) {
    // Noisy branch: pick a random legal action
    const idx = Math.floor((r / noiseProbability) * legal.length);

    // Guard against undefined access (required by noUncheckedIndexedAccess)
    const chosen = legal[idx];
    if (chosen === undefined) {
      // Defensive fallback, should not happen if calculation is correct
      return { type: 'endTurn', seat };
    }
    return chosen;
  } else {
    // Greedy branch
    return chooseGreedyAction(state, seat);
  }
}
