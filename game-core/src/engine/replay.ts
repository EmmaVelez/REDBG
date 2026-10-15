import type { GameSetup, GameState, Action, PlayerState, CardDef } from '../types';
import { setup } from './game';
import { applyAction } from './actions';

/**
 * Records an action in the game state log without applying it.
 * @param start - The initial game state.
 * @param action - The action to record.
 * @returns A new game state with the action recorded in the log.
 */
export function record(start: GameState, action: Action): GameState {
  return {
    ...start,
    version: start.version + 1,
    log: [...start.log, { seq: start.log.length + 1, action }],
  };
}

/**
 * Replays a full game from scratch using the given setup configuration, card database, pile specifications, and actions.
 * @param setupConfig - The game setup configuration.
 * @param cardDatabase - The card database.
 * @param pileSpecs - The pile specifications.
 * @param actions - The sequence of actions to apply.
 * @returns The final game state after applying all actions.
 */
export function replay(setupConfig: GameSetup, cardDatabase: ReadonlyArray<CardDef>, pileSpecs: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>, actions: readonly Action[]): GameState {
  let state = setup(setupConfig, cardDatabase, pileSpecs);
  for (const action of actions) {
    state = applyAction(state, action);
  }
  return state;
}

/**
 * Asserts that replaying the reference state's log produces a byte-identical GameState.
 * @param reference - The reference game state to replay.
 * @returns True if the replayed state deep-equals the reference state for the core slice; false otherwise.
 */
export function assertReplayDeterministic(reference: GameState): boolean {
  if (reference.log.length === 0) return false;
  if (reference.seed === undefined || Object.keys(reference.cards).length === 0) return false;

  const setupConfig = {
    seed: reference.seed,
    players: reference.seats.map(s => ({
      name: s.name,
      controller: s.controller,
      ...(s.botLevel !== undefined ? { botLevel: s.botLevel } : {}),
    })),
  };

  let rebuilt = setup(setupConfig, Object.values(reference.cardDefs), pileSpecsFrom(reference));

  for (const logEntry of reference.log) {
    rebuilt = applyAction(rebuilt, logEntry.action);
  }

  const coreSlice = {
    seats: rebuilt.seats,
    mansionDeck: rebuilt.mansionDeck,
    mansionBottom: rebuilt.mansionBottom,
    marketPiles: rebuilt.marketPiles,
    prompts: rebuilt.prompts,
    phase: rebuilt.phase,
    activeSeat: rebuilt.activeSeat,
    turnNumber: rebuilt.turnNumber,
    winners: rebuilt.winners,
    removed: rebuilt.removed,
    rngState: rebuilt.rngState,
    seed: rebuilt.seed,
  };

  return JSON.stringify(coreSlice) === JSON.stringify({
    seats: reference.seats,
    mansionDeck: reference.mansionDeck,
    mansionBottom: reference.mansionBottom,
    marketPiles: reference.marketPiles,
    prompts: reference.prompts,
    phase: reference.phase,
    activeSeat: reference.activeSeat,
    turnNumber: reference.turnNumber,
    winners: reference.winners,
    removed: reference.removed,
    rngState: reference.rngState,
    seed: reference.seed,
  });
}

/**
 * Helper function to reconstruct pile specifications from a game state.
 * @param reference - The reference game state.
 * @returns The reconstructed pile specifications.
 */
function pileSpecsFrom(reference: GameState): ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> {
  return Object.entries(reference.marketPiles).map(([pileId, pile]) => ({
    pileId,
    cardIds: Array.from(new Set(pile.cards.map(id => reference.cards[id]?.cardId).filter((c): c is string => c !== undefined))),
  }));
}
