
import type { Action, GameState } from '../types';
import { enumerateLegalActions } from './enumerate';
import { evaluateState } from './evaluate';
import { applyAction } from '../engine/actions';
import { checkWin } from '../engine/game';
import { mustExploreNow } from '../engine/abilities';

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
    JSON.stringify(a.prompts) === JSON.stringify(b.prompts) &&
    JSON.stringify(a.removed) === JSON.stringify(b.removed)
  );
}

/**
 * True when the action is the SKIP option of a `skipTurn` prompt (PR-002
 * Jill: option 0 skips the turn, option 1 declines).
 */
function isSkipTurnOption(state: GameState, action: Action): boolean {
  if (action.type !== 'chooseOption') return false;
  const prompt = state.prompts.find(p => p.id === action.promptId);
  return prompt?.payload?.kind === 'skipTurn' && action.option === 0;
}

/**
 * A seat that can never fight again: no Weapon card anywhere in its deck,
 * discard, hand, play area, Character or Partner, and no Weapon it can afford
 * in the Resource Area this turn.
 *
 * Why this matters: the policies never VOLUNTEER an unarmed explore (it only
 * takes damage), so such a seat has no line that can ever change its position
 * — it loops playAmmo/endTurn forever and the game never reaches 'all players
 * dead'. Measured on seed 4 with no custom cards (cap at turn 1982, four seats
 * alive) and on the EX-001..EX-009 seed 3 (cap at turn 2467). The seat is
 * still allowed to buy/play its way out first - the override below only fires
 * once the normal scoring has chosen to end the turn.
 */
export function isUnarmedDeadEnd(state: GameState, seat: number): boolean {
  const player = state.seats[seat];
  if (player === undefined) return false;
  const zones: ReadonlyArray<readonly string[]> = [
    player.hand,
    player.inventory,
    player.discard,
    player.playArea,
    player.attached,
    player.partnerAttached ?? [],
  ];
  const hasWeapon = zones.some(ids =>
    ids.some(id => state.cardDefs[state.cards[id]?.cardId ?? '']?.type === 'weapon'),
  );
  if (hasWeapon) return false;
  // A Weapon it could still buy this turn breaks the dead end (the buy is a
  // normal candidate and will be scored on its own merits).
  if (player.buysLeft < 1) return true;
  for (const pile of Object.values(state.marketPiles)) {
    for (const id of pile.cards) {
      const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
      if (def?.type !== 'weapon') continue;
      if (def.cost !== undefined && def.cost <= player.turnGold) return false;
    }
  }
  return true;
}

/**
 * Actions that can actually move the game forward. A turn made only of
 * playAmmo / playWeapon / prompts / endTurn is a passing turn: the seat has
 * spent nothing and gained nothing that persists.
 */
function isProgressAction(action: Action): boolean {
  switch (action.type) {
    case 'explore':
    case 'buy':
    case 'attack':
    case 'playItem':
    case 'playActionCard':
    case 'useCharacterAbility':
    case 'useWeaponAbility':
      return true;
    default:
      return false;
  }
}

/**
 * Consecutive completed turns of `seat` with no progress action at all.
 *
 * The log is chronological, so walking backwards sees the seat's actions of
 * its LAST turn before that turn's endTurn; the first turn that actually did
 * something stops the count.
 */
export function idleTurnsInARow(state: GameState, seat: number): number {
  let idle = 0;
  let progressed = false;
  // The seat's CURRENT turn is still open: everything logged after its last
  // endTurn belongs to this turn, so it must not be judged. Start counting at
  // that endTurn and evaluate each completed turn by the actions before it.
  let judging = false;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const action = state.log[i]?.action;
    if (action === undefined) continue;
    if (!('seat' in action) || action.seat !== seat) continue;
    if (action.type === 'endTurn') {
      if (!judging) {
        judging = true;
        progressed = false;
        continue;
      }
      if (progressed) break;
      idle += 1;
      progressed = false;
      continue;
    }
    if (judging && isProgressAction(action)) progressed = true;
  }
  return idle;
}

/**
 * How many fully idle turns a seat may take before the policy makes it fight
 * anyway. Tuned by simulation on seeds 1-8 (4 hard bots, firstTimer): 2 or 3
 * ended most games with every seat dead (bots suicide right after a quiet
 * start) and roughly halved the decoration totals; 5 ends every seed while
 * keeping 4 survivors and the baseline decoration spread (8/2/29/13 vs
 * 6/10/28/21 and similar). Games also get shorter - the deadlocks are gone.
 */
export const STALL_TURNS = 5;

/**
 * True when the seat must be pushed to act: it can never arm itself, or it has
 * already spent STALL_TURNS turns passing. Left alone, such a seat loops
 * playAmmo/endTurn forever and the game never reaches 'all players dead'.
 */
function mustForceProgress(state: GameState, seat: number): boolean {
  return isUnarmedDeadEnd(state, seat) || idleTurnsInARow(state, seat) >= STALL_TURNS;
}

/**
 * Legal actions the greedy policies may consider.
 *
 * `attachToPartnerStart` is a UI prompt starter, not a resolvable move: it only
 * raises a prompt and leaves the seat's pools untouched, so a 1-ply simulation
 * scores it as a free win (it beats every real action and stalls the bot). It is
 * enumerated for human seats — bots get the direct per-card `attachToPartner`
 * actions instead — but the greedy policies are bot-only and must never pick it.
 */
function greedyCandidates(state: GameState, seat: number): Action[] {
  return enumerateLegalActions(state, seat).filter((a) => a.type !== 'attachToPartnerStart');
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

  const legal = greedyCandidates(state, seat);

  // A seat that can never arm itself, or that keeps passing, must be pushed to
  // explore: otherwise it loops playAmmo/endTurn and the game never ends (see
  // mustForceProgress).
  const forceProgress = mustForceProgress(state, seat);

  // 2. If legal.length === 0, return endTurn as a safe deterministic fallback.
  if (legal.length === 0) {
    return { type: 'endTurn', seat };
  }

  // 3. Simulate each candidate
  let best: { action: Action; score: number } | undefined = undefined;
  // Best explore (armed or not), kept aside: it is the stall-breaking move.
  let progressExplore: { action: Action; score: number } | undefined = undefined;

  for (const action of legal) {
    // a. Simulate the action
    const next = applyAction(state, action);

    // a2. Skip no-ops — the state did not change (generic ability uses are
    // pass-throughs). Without this the bot would choose the same non-move
    // forever: it spends nothing, so it always scores >= any real action.
    if (sameCoreState(state, next)) {
      continue;
    }
    const isExplore = action.type === 'explore';
    const isUnarmed = isExplore && action.weapons.length === 0;
    // An unarmed explore is only worth playing when a forced-Explore
    // obligation leaves no alternative — or when the seat must be pushed to
    // act and exploring is the only way the game can still move.
    if (isUnarmed && !mustExploreNow(state, seat) && !forceProgress) {
      continue;
    }

    // b. Score the resulting state — with honest end-turn carry-over: endTurn
        // keeps the seat's turn pools in the raw post-state, but the game loop's
        // startTurn zeroes them; the dumped hand must also score at held value
        // (no arbitrage). Non-endTurn actions score normally. Explores get the
        // flat fighting bias (see EXPLORE_BIAS).
        // A skip option ENDS the turn exactly like endTurn (the resolver
        // calls advanceTurn), so it needs the same honest simulation: the
        // seat's turn pools are gone by its next startTurn, and the hand it
        // ships to the discard must not be revalued from held to owned.
        // Without both, skipping manufactures points and the greedy bot
        // skips every turn forever — the game never ends.
        // Buys are the exception to the discard clamp: a bought card
        // landing in the discard at owned value IS the buy incentive.
        const endsTurn = action.type === 'endTurn' || isSkipTurnOption(state, action);
        const raw = evaluateState(
          endsTurn ? withSpentTurnPoolsZeroed(next, seat) : next,
          seat,
          { clampDiscardToHeld: action.type === 'buy' ? false : true },
        );
        // No bias for an unarmed explore: it is only taken through the
        // dead-end override below, after normal scoring has chosen to end the
        // turn (playing Ammo, buying etc. must win first).
        const score = action.type === 'explore' && action.weapons.length > 0 ? raw + EXPLORE_BIAS : raw;

        // The seat's best explore, kept aside as the stall-breaking move.
        if (isExplore && (progressExplore === undefined || score > progressExplore.score)) {
          progressExplore = { action, score };
        }

    // c. If best is undefined OR score is STRICTLY GREATER, update best.
    // This ensures deterministic tie-breaking (first action wins).
    if (best === undefined || score > best.score) {
      best = { action, score };
    }
  }

  // 4. Return best.action. If every legal action was a no-op (extreme edge),
  // fall back to endTurn — the one action that always changes the turn state.
  if (best === undefined) {
    return progressExplore?.action ?? { type: 'endTurn', seat };
  }
  // Stall override: passing here is how the game deadlocks (the seat is stuck
  // or has been idle for STALL_TURNS turns), so explore instead — even at a
  // score the evaluator dislikes. Losing fights still drain Health, and Health
  // reaching zero is what ends these games.
  if (forceProgress && (best.action.type === 'endTurn' || isSkipTurnOption(state, best.action)) && progressExplore !== undefined) {
    return progressExplore.action;
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

// ---------------------------------------------------------------------------
// Greedy playout (rollout) - the "hard" bot's action selection.
//
// chooseGreedyAction scores each candidate by the state ONE action ahead, so
// it cannot see a line like "play Ammo, then Explore, then Buy": the payoff
// lands two actions away and never appears in the 1-ply comparison. The
// playout fixes that by simulating the rest of the turn with the same greedy
// policy and scoring the position the seat actually ends up in.
//
// Cost control: every candidate is still 1-ply scored (cheap), only the best
// candidate of each kind is rolled out (ROLLOUT_CANDIDATE_CAP), and each
// rollout stops after ROLLOUT_MAX_STEPS actions or when the turn ends.
// ---------------------------------------------------------------------------

/** Max actions a single rollout simulates after the candidate action. */
export const ROLLOUT_MAX_STEPS = 5;
/** Max candidate first-actions the rollout compares. */
export const ROLLOUT_CANDIDATE_CAP = 6;
/** Terminal bonus for a line that wins the game - dwarfs any positional score. */
const WIN_BONUS = 100000;
/** Per-step cost applied to winning lines so the FASTEST win wins ties. */
const STEP_COST = 1;

/** Coarse grouping used to build the rollout shortlist. */
function candidateKind(action: Action): string {
  switch (action.type) {
    case 'buy':
      // One kind for every pile: with 8+ market piles, per-pile kinds would
      // fill the shortlist with buys and crowd out the explore/play lines.
      return 'buy';
    case 'playActionCard':
    case 'playItem':
    case 'playAmmo':
      return 'play:' + action.instanceId;
    case 'attack':
      return 'attack:' + action.targetSeat;
    case 'useCharacterAbility':
      return 'ability:' + action.abilityIndex;
    case 'useWeaponAbility':
      return 'weaponAbility:' + action.instanceId;
    case 'attachToPartner':
      return 'attach:' + action.instanceId;
    case 'chooseOption':
      return 'prompt:' + action.promptId + ':' + action.option;
    default:
      return action.type;
  }
}

interface RolloutOutcome {
  /** Final comparison score; -Infinity when the line could not be simulated. */
  readonly score: number;
  /** True when the line ends with the seat having won the game. */
  readonly won: boolean;
  /** Actions simulated after the candidate (0 when the candidate ends the turn). */
  readonly steps: number;
}

/**
 * Simulates the rest of the seat's turn after `first` using the 1-ply greedy
 * policy, then scores the resulting position.
 *
 * The turn ends when the greedy policy picks endTurn, when a skip-turn option
 * advances the seat, or when the step cap is hit. A won game adds WIN_BONUS
 * minus a small per-step cost, so among winning lines the fastest win wins.
 */
function rollout(state: GameState, seat: number, first: Action): RolloutOutcome {
  let current: GameState;
  try {
    current = applyAction(state, first);
  } catch {
    return { score: -Infinity, won: false, steps: 0 };
  }

  let turnOver = first.type === 'endTurn' || isSkipTurnOption(state, first);
  let steps = 0;

  while (!turnOver && steps < ROLLOUT_MAX_STEPS) {
    if (checkWin(current).gameOver) break;

    const action = chooseGreedyAction(current, seat);
    if (action.type === 'endTurn') {
      try {
        current = applyAction(current, action);
      } catch {
        break;
      }
      turnOver = true;
      break;
    }
    try {
      current = applyAction(current, action);
    } catch {
      break;
    }
    steps += 1;
    // A skip-turn prompt option advances the seat without an endTurn action.
    if (current.activeSeat !== seat) {
      turnOver = true;
      break;
    }
  }

  const win = checkWin(current);
  const won = win.gameOver && win.winners.includes(seat);
  // A won line is judged by SPEED alone: leftover turn pools are worthless
  // once the game is over, and scoring them would rank a slower win higher.
  const score = won
    ? WIN_BONUS - steps * STEP_COST
    : evaluateState(
        turnOver ? withSpentTurnPoolsZeroed(current, seat) : current,
        seat,
        { clampDiscardToHeld: true },
      );
  return { score, won, steps };
}

/**
 * Chooses the action whose completing the turn greedily yields the best
 * end-of-turn position. This is the "hard" bot: it still uses the 1-ply
 * evaluator, but it compares whole lines instead of single moves.
 *
 * Deterministic: no rng is consumed, and every simulation runs on copies.
 */
export function choosePlayoutAction(state: GameState, seat: number): Action {
  if (state.seats.every(s => s.dead)) {
    return { type: 'endTurn', seat };
  }

  const legal = greedyCandidates(state, seat);
  if (legal.length === 0) {
    return { type: 'endTurn', seat };
  }

  // Stuck or idle seat: every rollout line is equally dead, so delegate — the
  // 1-ply policy carries the explore override that keeps the game moving.
  if (mustForceProgress(state, seat)) {
    return chooseGreedyAction(state, seat);
  }

  // 1-ply score every candidate (cheap) and keep the best of each kind.
  const byKind = new Map<string, { action: Action; score: number }>();
  for (const action of legal) {
    let next: GameState;
    try {
      next = applyAction(state, action);
    } catch {
      continue;
    }
    if (sameCoreState(state, next)) continue;
    // See chooseGreedyAction: never volunteer an unarmed explore.
    if (action.type === 'explore' && action.weapons.length === 0 && !mustExploreNow(state, seat)) continue;

    const endsTurn = action.type === 'endTurn' || isSkipTurnOption(state, action);
    const raw = evaluateState(
      endsTurn ? withSpentTurnPoolsZeroed(next, seat) : next,
      seat,
      { clampDiscardToHeld: action.type === 'buy' ? false : true },
    );
    const score = action.type === 'explore' && action.weapons.length > 0 ? raw + EXPLORE_BIAS : raw;

    const kind = candidateKind(action);
    const prev = byKind.get(kind);
    if (prev === undefined || score > prev.score) {
      byKind.set(kind, { action, score });
    }
  }

  const shortlist = [...byKind.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, ROLLOUT_CANDIDATE_CAP);

  let best: { action: Action; score: number } | undefined;
  for (const candidate of shortlist) {
    let outcome: RolloutOutcome;
    try {
      outcome = rollout(state, seat, candidate.action);
    } catch {
      continue;
    }
    if (outcome.score === -Infinity) continue;
    if (best === undefined || outcome.score > best.score) {
      best = { action: candidate.action, score: outcome.score };
    }
  }

  // Fallback: the best 1-ply candidate (shortlist is never empty here, but an
  // every-line-throws edge must still return a legal action).
  return best?.action ?? shortlist[0]?.action ?? { type: 'endTurn', seat };
}
