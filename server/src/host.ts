import {
  setup,
  startTurn,
  checkWin,
  applyAction,
  validateAction,
  chooseBotAction,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
} from '@re/game-core';
import type { Action, GameState, PlayerView, BotDifficulty } from '@re/game-core';
import type { PlayerInfo } from './protocol';
import type { Room } from './rooms';

/**
 * Authoritative game host (M3-T03). Owns the engine state for one room and
 * exposes the only way to mutate it:
 * - humans act via apply(clientId, action) — identity-checked against the
 *   room's seat, then validated by the engine's validator;
 * - bot seats are driven through stepBot() (chooseBotAction, hard difficulty);
 * - every seat sees only its own sanitized view (other hands/inventory
 *   contents are hidden as placeholder ids).
 * The host itself is agnostic of WebSockets — the ws layer (T04) translates
 * protocol messages into these calls and broadcasts the per-seat views.
 */

export type HostResult =
  | { readonly ok: true; readonly state: GameState; readonly gameOver: boolean; readonly winners: readonly number[] }
  | { readonly ok: false; readonly reason: string };

export interface GameHost {
  readonly room: Room;
  /** The current authoritative engine state, or undefined before start()/if the game ended. */
  readonly state: GameState | undefined;
  /** Builds the initial engine state from the room's seated players. */
  start(seed: number): GameState;
  /**
   * Validates and applies an action on behalf of a client. The client must be
   * a seated human player whose action's seat matches their room seat.
   */
  apply(clientId: string, action: Action): HostResult;
  /** Steps the bot sitting in the currently active seat (if any). */
  stepBot(seed: number, difficulty?: BotDifficulty): HostResult | undefined;
  /** Sanitized per-seat view: own hand/inventory visible, others hidden. */
  viewFor(clientId: string): PlayerView | undefined;
}

/** Placeholder id used for hidden cards in sanitized views (not in cardDefs). */
const HIDDEN_ID = 'hidden';

/** True when the room is in the lobby (no game running). */
function isLobby(room: Room): boolean {
  return room.phase !== 'playing';
}

export function createHost(room: Room): GameHost {
  let state: GameState | undefined = undefined;

  const findHuman = (clientId: string): PlayerInfo | undefined =>
    room.players.find(p => p.clientId === clientId && !p.isBot);

  const seatOf = (clientId: string): number | undefined =>
    room.players.find(p => p.clientId === clientId)?.seat;

  const seededPlayers = () =>
    [...room.players]
      .sort((a, b) => a.seat - b.seat)
      .filter(p => p.seat >= 0)
      .map(p => ({
        name: p.name,
        controller: (p.isBot ? 'bot' : 'human') as 'bot' | 'human',
        characterCardId: undefined,
      }));

  return {
    room,

    get state() {
      return state;
    },

    start(seed: number): GameState {
      if (state !== undefined) {
        throw new Error('game already started');
      }
      const players = seededPlayers();
      if (players.length === 0) {
        throw new Error('no seated players');
      }
      state = setup({ seed, players }, PREMIER_CARDS, FIRST_TIMER_PILES);
      return state;
    },

    apply(clientId: string, action: Action): HostResult {
      if (state === undefined) {
        return { ok: false, reason: 'game not started' };
      }
      const human = findHuman(clientId);
      if (human === undefined) {
        return { ok: false, reason: 'unknown or unseated player' };
      }
      if ('seat' in action && action.seat !== human.seat) {
        return { ok: false, reason: 'action seat does not match your seat' };
      }
      const ok = validateAction(state, action);
      if (!ok.ok) {
        return { ok: false, reason: ok.reason };
      }
      let next = applyAction(state, action);
      if (action.type === 'endTurn') {
        next = startTurn(next);
      }
      state = next;
      const win = checkWin(state);
      return { ok: true, state, gameOver: win.gameOver, winners: win.winners };
    },

    stepBot(seed: number, difficulty: BotDifficulty = 'hard'): HostResult | undefined {
      if (state === undefined) {
        return undefined;
      }
      const active = state.seats[state.activeSeat];
      if (active === undefined) return undefined;
      const sitter = room.players.find(p => p.seat === active.seat);
      if (sitter === undefined || !sitter.isBot) {
        return undefined;
      }
      const action = chooseBotAction(state, state.activeSeat, difficulty, () => 0.5);
      let next = applyAction(state, action);
      if (action.type === 'endTurn') {
        next = startTurn(next);
      }
      state = next;
      const win = checkWin(state);
      return { ok: true, state, gameOver: win.gameOver, winners: win.winners };
    },

    viewFor(clientId: string): PlayerView | undefined {
      if (state === undefined) {
        return undefined;
      }
      const seat = seatOf(clientId);
      if (seat === undefined) {
        return undefined;
      }
      return { seat, state: sanitize(state, seat) };
    },
  };
}

/**
 * Returns a copy of the state in which every OTHER seat's hand, inventory,
 * discard and play-area contents are replaced with placeholder ids (length
 * preserved), so a client only sees the cards it is entitled to see. The
 * viewing seat's own zones, the market, mansion, and defs stay intact.
 *
 * viewerSeat -1 = spectator view: EVERY seat's zones are hidden (including the
 * active player's), preserving lengths and the public board.
 */
export function sanitize(state: GameState, viewerSeat: number): GameState {
  const hiddenFor = (zone: readonly string[]): readonly string[] => zone.map((_, i) => `${HIDDEN_ID}-${i}`);
  return {
    ...state,
    seats: state.seats.map(s => {
      if (s.seat === viewerSeat) {
        return s;
      }
      return {
        ...s,
        hand: hiddenFor(s.hand),
        inventory: hiddenFor(s.inventory),
        discard: hiddenFor(s.discard),
        playArea: hiddenFor(s.playArea),
      };
    }),
  };
}