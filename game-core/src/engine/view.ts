import type { Action, GameState, PlayerView } from '../types';

/**
 * Per-seat views (M4-T10 shared with the browser hot-seat driver; previously
 * server-only). A player may only ever see the cards it is entitled to see.
 */

/** Placeholder id used for hidden cards in sanitized views (not in cardDefs). */
const HIDDEN_ID = 'hidden';

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
  // Redact logged card ids of OTHER seats so the action history never leaks
  // hidden info (hand plays, inventory draws, discard buys). The action kind
  // and public data (pileId, seat, counts) stay visible; the viewer's own
  // log entries keep real ids.
  const redactAction = (action: Action): Action => {
    if (!('seat' in action) || action.seat === viewerSeat) return action;
    switch (action.type) {
      case 'playActionCard':
      case 'playItem':
      case 'playAmmo':
        return { ...action, instanceId: `${HIDDEN_ID}-card` };
      case 'explore':
        return { ...action, weapons: action.weapons.map((_, i) => `${HIDDEN_ID}-w${i}`) };
      default:
        return action;
    }
  };
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
    log: state.log.map(entry => ({ seq: entry.seq, action: redactAction(entry.action) })),
  };
}

/** The view one seat is entitled to: their own zone contents, everyone elses hidden. */
export function viewForSeat(state: GameState, seat: number): PlayerView {
  return { seat, state: sanitize(state, seat) };
}