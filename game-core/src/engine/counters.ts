import type { GameState, PlayerState } from '../types';

/**
 * Unofficial Expansion: counter cards (EX-009 Poison).
 *
 * A counter is a card that lives in a SHARED SUPPLY by the board (never in the
 * market or the Mansion) and is attached to a Character by an Infected effect.
 * At the beginning of that Character's turns it deals its damage; when the
 * Character dies the counter returns to the supply ("return this card to the
 * Resource Area"). A maximum of one of each counter may be attached to a
 * Character at a time.
 */

/** Total damage a seat's attached counters deal at the start of its turn. */
export function poisonDamageAtTurnStart(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const id of player.counters ?? []) {
    const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
    for (const e of def?.counterEffects ?? []) {
      if (e.kind === 'damageAtTurnStart') total += e.amount;
    }
  }
  return total;
}

/** Whether the seat's Character already carries a counter of this card. */
export function hasCounter(state: GameState, seat: number, counterCardId: string): boolean {
  const player = state.seats[seat];
  if (player === undefined) return false;
  return (player.counters ?? []).some(id => state.cards[id]?.cardId === counterCardId);
}

/** Move one counter of `counterCardId` from the shared supply onto the seat's
 *  Character. No-op when the Character already carries one or the supply is
 *  empty (the "maximum of one" rule). */
export function attachCounterToSeat(state: GameState, seat: number, counterCardId: string): GameState {
  if (hasCounter(state, seat, counterCardId)) return state;
  const supply = state.supply ?? [];
  const counterId = supply.find(id => state.cards[id]?.cardId === counterCardId);
  if (counterId === undefined) return state;
  return {
    ...state,
    supply: supply.filter(id => id !== counterId),
    seats: state.seats.map(s => (s.seat === seat ? { ...s, counters: [...(s.counters ?? []), counterId] } : s)),
  };
}

/** Return every counter on the seat's Character to the shared supply. */
export function returnCountersToSupply(state: GameState, seat: number): GameState {
  const player = state.seats[seat];
  if (player === undefined) return state;
  const counters = player.counters ?? [];
  if (counters.length === 0) return state;
  const supply = [...(state.supply ?? [])];
  for (const id of counters) {
    if (!supply.includes(id)) supply.push(id);
  }
  return {
    ...state,
    supply,
    seats: state.seats.map(s => (s.seat === seat ? { ...s, counters: [] } : s)),
  };
}
