import type { GameState } from '../types';

/**
 * Drops prompts that offer no options.
 *
 * A prompt tells the engine "this seat must choose before it can act", and
 * `validateAction` gates EVERY other action behind "resolve pending prompt
 * first". A prompt with an empty option list can therefore never be resolved:
 * the seat is deadlocked — bots fall back to endTurn (which the validator
 * rejects, so a simulated game throws) and a human client renders an empty
 * dialog with no way to dismiss it.
 *
 * An empty option list means the optional effect simply has no valid target
 * right now, so the correct outcome is that the prompt never existed.
 * Builders guard individually (see the `candidates.length === 0` checks);
 * this is the choke point that makes the deadlock impossible no matter which
 * builder forgets one.
 */
export function dropEmptyPrompts(state: GameState): GameState {
  if (state.prompts.every(prompt => prompt.options.length > 0)) {
    return state;
  }
  return { ...state, prompts: state.prompts.filter(prompt => prompt.options.length > 0) };
}
