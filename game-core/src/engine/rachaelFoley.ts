import type { CardDef, GameState } from '../types';
import { makeRng, shuffle } from '../util/rng';

/**
 * CI-009 "Rachael Foley (First Encounter)" / MA-000 "Rachael Foley (ooze)" —
 * the fan-card pair. CI-009 soaks 10 damage per "Ammo x10" in the exploring
 * player's discard pile and shuffles a fresh Ooze into the Mansion when it is
 * defeated; the Ooze is shuffled straight back whenever it is defeated with
 * 80 or less damage.
 *
 * The damage-soak is a combat modifier, so it is applied inside
 * `resolveExplore` / `resolveMultiExplore` (like Regenerator's weapon
 * penalty); the two defeat effects are applied by the explore reducer, which
 * owns the attached list and the Mansion deck.
 */

/** How many "Ammo x10" cards (ammunition worth 10 Ammo) sit in the seat's discard pile. */
export function ammoX10CountInDiscard(state: GameState, seat: number): number {
  const player = state.seats[seat];
  if (player === undefined) return 0;
  let count = 0;
  for (const id of player.discard) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.type === 'ammunition' && (def.bonuses?.ammo ?? 0) === 10) count += 1;
  }
  return count;
}

/** MA-000: defeated with `damage` or less, it is shuffled back into the Mansion. */
export function oozeShufflesBackOnDefeat(def: CardDef | undefined, damage: number): boolean {
  return (def?.infectedEffects ?? []).some(
    e => e.kind === 'onDefeatShuffleBackIfDamageAtMost' && damage <= e.maxDamage,
  );
}

/** Shuffle an existing instance into the Mansion, threading the RNG state. */
export function shuffleIntoMansion(state: GameState, instanceId: string): GameState {
  const mixed = shuffle(makeRng(state.rngState), [...state.mansionDeck, instanceId]);
  return { ...state, mansionDeck: mixed.value, rngState: mixed.rng.s };
}

/**
 * CI-009 defeat: create a fresh copy of `cardId` and shuffle it into the
 * Mansion. No-op when the def is not in this game (the room did not bring the
 * linked card in).
 */
export function shuffleCopyIntoMansion(state: GameState, cardId: string): GameState {
  if (state.cardDefs[cardId] === undefined) return state;
  let n = 0;
  let instanceId = `${cardId}#m${state.version}`;
  while (state.cards[instanceId] !== undefined) {
    n += 1;
    instanceId = `${cardId}#m${state.version}-${n}`;
  }
  const cards = {
    ...state.cards,
    [instanceId]: { instanceId, cardId, location: { zone: 'mansionDeck' as const, index: 0 } },
  };
  return shuffleIntoMansion({ ...state, cards }, instanceId);
}
