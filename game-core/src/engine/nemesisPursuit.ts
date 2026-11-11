import type { CardDef, GameState } from '../types';

/**
 * EV-002 Nemesis Pursuit — "When this event is revealed, the exploring
 * character must explore again. This turn, all infected gain +10 health and
 * +20 damage. Remove this event from the game afterwards."
 *
 * The event is removed from the game by the explore reducers that reveal it;
 * this module owns the two ongoing effects (the turn-long infected buff and
 * the "must explore again" obligation) so every reveal path applies them the
 * same way.
 */

export const NEMESIS_PURSUIT_ID = 'ev-002';

/** Health/Damage every Infected gains while the event is in effect. */
export const NEMESIS_PURSUIT_BUFF = { hp: 10, attack: 20 } as const;

/** True when `def` is the Nemesis Pursuit event card. */
export function isNemesisPursuit(def: Pick<CardDef, 'type' | 'id'> | undefined): boolean {
  return def?.type === 'event' && def.id === NEMESIS_PURSUIT_ID;
}

/** The buff an Infected gets this turn, or 0/0 when the event is not active. */
export function nemesisPursuitBuff(state: GameState): { readonly hp: number; readonly attack: number } {
  return state.infectedBuffThisTurn ?? { hp: 0, attack: 0 };
}

/** Add the turn's +10/+20 infected buff (stacks if the event is revealed twice). */
export function withNemesisPursuitBuff(state: GameState): GameState {
  const prev = state.infectedBuffThisTurn;
  return {
    ...state,
    infectedBuffThisTurn: {
      hp: (prev?.hp ?? 0) + NEMESIS_PURSUIT_BUFF.hp,
      attack: (prev?.attack ?? 0) + NEMESIS_PURSUIT_BUFF.attack,
    },
  };
}

/** The exploring character must explore again: +1 Explore and an obligation to
 *  use it before ending the turn (`mustExplore` blocks endTurn). */
export function withExploreAgain(state: GameState, seat: number): GameState {
  return {
    ...state,
    seats: state.seats.map(s => (s.seat === seat
      ? { ...s, exploresLeft: s.exploresLeft + 1, mustExplore: true }
      : s)),
  };
}

/** Both Nemesis Pursuit effects, applied to a finished explore result. */
export function applyNemesisPursuit(state: GameState, seat: number): GameState {
  return withExploreAgain(withNemesisPursuitBuff(state), seat);
}
