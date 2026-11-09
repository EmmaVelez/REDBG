import type { GameState, PlayerView } from '../types';

/**
 * Per-seat views (M4-T10 shared with the browser hot-seat driver; previously
 * server-only). A player may only ever see the cards it is entitled to see.
 */

/** Placeholder id used for hidden cards in sanitized views (not in cardDefs). */
const HIDDEN_ID = 'hidden';

/**
 * Returns a copy of the state in which every OTHER seat's HAND and INVENTORY
 * are replaced with placeholder ids (length preserved).
 *
 * That is the whole of what is secret, matching a real table: the discard
 * pile, the play area, the market, the mansion and the ACTION LOG are all
 * public, so the log carries real card ids for every seat and the turn history
 * can name the cards each player actually used. Only the two face-down zones
 * differ between viewers.
 *
 * viewerSeat -1 = spectator view: EVERY seat's hand/inventory is hidden,
 * preserving lengths and the public board.
 */
export function sanitize(state: GameState, viewerSeat: number): GameState {
  const hiddenFor = (zone: readonly string[]): readonly string[] => zone.map((_, i) => `${HIDDEN_ID}-${i}`);
  // Mercenaries Skill draft: each seat's draft hand is private, and the
  // undealt deck is face-down. Only the viewer's own draft cards stay visible
  // (spectators see counts only).
  const hiddenDraft = state.skillDraft === undefined
    ? undefined
    : {
        ...state.skillDraft,
        deck: state.skillDraft.deck.map((_, i) => `hidden-draft-${i}`),
        hands: Object.fromEntries(Object.entries(state.skillDraft.hands).map(([seat, hand]) => [
          seat,
          Number(seat) === viewerSeat ? hand : hand.map((_, i) => `hidden-draft-hand-${i}`),
        ])),
        kept: Object.fromEntries(Object.entries(state.skillDraft.kept).map(([seat, cards]) => [
          seat,
          Number(seat) === viewerSeat ? cards : cards.map((_, i) => `hidden-draft-kept-${i}`),
        ])),
        pendingPass: Object.fromEntries(Object.entries(state.skillDraft.pendingPass).map(([seat, cards]) => [
          seat,
          Number(seat) === viewerSeat ? cards : cards.map((_, i) => `hidden-draft-pass-${i}`),
        ])),
        final: Object.fromEntries(Object.entries(state.skillDraft.final).map(([seat, cards]) => [
          seat,
          Number(seat) === viewerSeat ? cards : cards.map((_, i) => `hidden-draft-final-${i}`),
        ])),
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
      };
    }),
    // The log is deliberately NOT transformed: everything a player does is
    // public once done (the card leaves their hand), exactly as across a real
    // table. Only the two face-down zones above differ between viewers.
    ...(hiddenDraft !== undefined ? { skillDraft: hiddenDraft } : {}),
  };
}

/** The view one seat is entitled to: their own zone contents, everyone elses hidden. */
export function viewForSeat(state: GameState, seat: number): PlayerView {
  return { seat, state: sanitize(state, seat) };
}