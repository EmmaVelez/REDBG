
import type { Action, GameState, GameSetup, CardDef } from '../types';
import { setup, startTurn, checkWin } from '../engine/game';
import { applyAction } from '../engine/actions';
import { chooseBotAction, type BotDifficulty } from './bot';
import { cardsForScenario, pilesForScenario, SCENARIOS } from '../data/cards';
import type { ScenarioId } from '../data/cards';
import { makeRng, nextFloat } from '../util/rng';

export interface SimConfig {
  readonly seed: number;
  /** Difficulty per seat, in seat order. Length must equal the player count. */
  readonly difficulties: readonly BotDifficulty[];
  /** Hard cap on applied actions; the game stops there if no winner yet. */
  readonly maxActions: number;
  /** Scenario to play (default `firstTimer`). Selects piles + mansion. */
  readonly scenario?: ScenarioId;
  /** Card database override; defaults to `cardsForScenario(scenario)`. */
  readonly cards?: ReadonlyArray<CardDef>;
  /** Pile override; defaults to `pilesForScenario(scenario)`. */
  readonly piles?: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>;
  /** Mansion override; defaults to the scenario's own `mansionCards`. */
  readonly mansionCards?: ReadonlyArray<{ cardId: string; count: number }>;
  /** Outbreak mode (infection levels, Infection Deck). */
  readonly outbreakMode?: boolean;
  /** Partner Modification rules (Alliance). */
  readonly partnerMode?: boolean;
}

export interface SimResult {
  readonly state: GameState;
  readonly actionsApplied: number;
  /** 'gameOver' when checkWin fired; 'cap' when maxActions was hit first. */
  readonly ended: 'gameOver' | 'cap';
}

/**
 * Creates a deterministic random number generator function based on a seed.
 */
function rngFromSeed(seed: number): () => number {
  let rng = makeRng(seed);
  return () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
}

/**
 * Runs a single bot game simulation from the initial setup.
 */
export function playBotGame(config: SimConfig): SimResult {
  const scenario = config.scenario ?? 'firstTimer';
  const cards = config.cards ?? cardsForScenario(scenario);
  const piles = config.piles ?? pilesForScenario(scenario);
  const scenarioDef = SCENARIOS.find(s => s.id === scenario);
  const mansionCards =
    config.mansionCards ??
    (scenarioDef as { mansionCards?: ReadonlyArray<{ cardId: string; count: number }> } | undefined)
      ?.mansionCards;
  const winInfectedCardId =
    (scenarioDef as { winInfectedCardId?: string } | undefined)?.winInfectedCardId;

  // Build players array
  const players = config.difficulties.map((d, i) => ({
    name: 'Bot' + i,
    controller: 'bot' as const,
    botLevel: (d === 'hard' ? 3 : d === 'normal' ? 2 : 1),
  }));

  const setupConfig: GameSetup = {
    seed: config.seed,
    players,
    outbreakMode: config.outbreakMode ?? scenario === 'outbreak',
    partnerMode: config.partnerMode,
  };

  const initialState = setup(setupConfig, cards, piles, mansionCards, winInfectedCardId);
  const rand = rngFromSeed(config.seed);

  return playBotGameFrom(initialState, config.difficulties, rand, config.maxActions);
}

/**
 * Runs the game loop simulation from a given GameState.
 *
 * @param state The starting GameState.
 * @param difficulties The difficulty array corresponding to seat indices.
 * @param rand The deterministic random number generator function.
 * @param maxActions The hard cap on actions.
 * @returns The final simulation result.
 */
export function playBotGameFrom(
  state: GameState,
  difficulties: readonly BotDifficulty[],
  rand: () => number,
  maxActions: number
): SimResult {
  let current = state;
  let actions = 0;

  // Engineering comment: The loop is deterministic for a fixed seed.
  // Engineering comment: applyAction throws on illegal actions by design.
  while (actions < maxActions) {
    // 2a. Check for win condition before action
    const win = checkWin(current);
    if (win.gameOver) {
      return { state: current, actionsApplied: actions, ended: 'gameOver' };
    }

    // 2b. Determine active seat and difficulty
    const seat = current.activeSeat;
    // Defensive lookup: fallback to 'easy' if seat index is out of bounds
        const difficultyRaw = seat < difficulties.length ? difficulties[seat] : undefined;
        const difficulty: BotDifficulty = difficultyRaw ?? 'easy';

    // 2c. Choose action
    const action = chooseBotAction(current, seat, difficulty, rand);

    // 2d. Apply action (throws if illegal, which should not happen)
    current = applyAction(current, action);

    // 2e. Increment actions
    actions += 1;

    // 2f. Advance turn if action was endTurn
    if (action.type === 'endTurn') {
      current = startTurn(current);
    }
  }

  // 3. After the loop: Check final win state
  const final = checkWin(current);
  const ended: 'gameOver' | 'cap' = final.gameOver ? 'gameOver' : 'cap';

  // 4. Return result
  return { state: current, actionsApplied: actions, ended };
}
