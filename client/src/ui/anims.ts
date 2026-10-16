import type { GameState } from '@re/game-core';

/**
 * Card-flight animation support (M4 polish).
 *
 * `diffCardMoves` compares two consecutive GameStates and reports which card
 * INSTANCES changed zone. Only animated for the viewing seat's own zones plus
 * public zones (market, mansion, attached, removed) — the server sanitizes
 * other seats' cards to `hidden-N` placeholders, so their moves are skipped.
 */

/** Canonical zone keys used for anchoring flights. */
export type AnimZone =
  | 'hand'
  | 'deck' // inventory (draw pile)
  | 'discard'
  | 'play' // playArea
  | 'market'
  | 'mansion'
  | 'mansionBottom'
  | 'attached'
  | 'removed';

export interface CardMove {
  readonly instanceId: string;
  readonly fromZone: AnimZone;
  readonly toZone: AnimZone;
  /** Market pileId when from/to is the market (for anchoring the source). */
  readonly fromPileId?: string;
  readonly toPileId?: string;
  /** True when the card travels face-down (drawn from or sent to a hidden zone). */
  readonly faceDown: boolean;
}

interface PlayerZoneRef {
  readonly zone: AnimZone;
  readonly key: 'hand' | 'inventory' | 'discard' | 'playArea' | 'attached';
}

const PLAYER_ZONES: readonly PlayerZoneRef[] = [
  { zone: 'hand', key: 'hand' },
  { zone: 'deck', key: 'inventory' },
  { zone: 'discard', key: 'discard' },
  { zone: 'play', key: 'playArea' },
  { zone: 'attached', key: 'attached' },
];

interface ZoneLoc {
  readonly zone: AnimZone;
  readonly seat?: number;
  readonly pileId?: string;
}

/** Index every instance's zone in one pass (player zones + public zones). */
function zoneIndex(state: GameState): Map<string, ZoneLoc> {
  const map = new Map<string, ZoneLoc>();
  for (const seat of state.seats) {
    const player = state.seats[seat.seat];
    if (player === undefined) continue;
    for (const ref of PLAYER_ZONES) {
      const list = player[ref.key];
      for (const id of list) {
        map.set(id, { zone: ref.zone, seat: seat.seat });
      }
    }
  }
  for (const pile of Object.values(state.marketPiles)) {
    for (const id of pile.cards) {
      map.set(id, { zone: 'market', pileId: pile.pileId });
    }
  }
  for (const id of state.mansionDeck) map.set(id, { zone: 'mansion' });
  for (const id of state.mansionBottom) map.set(id, { zone: 'mansionBottom' });
  for (const id of state.removed) map.set(id, { zone: 'removed' });
  return map;
}

/** Face-down whenever the card travels from or into a hidden pile. */
function travelsFaceDown(from: AnimZone, to: AnimZone): boolean {
  const hidden: ReadonlySet<AnimZone> = new Set([
    'deck',
    'discard',
    'mansion',
    'mansionBottom',
    'removed',
  ]);
  return hidden.has(from) || hidden.has(to);
}

function sameLoc(a: ZoneLoc, b: ZoneLoc): boolean {
  return a.zone === b.zone && a.pileId === b.pileId;
}

/**
 * Zone changes between two consecutive states, capped to keep the table
 * readable. Identifiers the server hides (`hidden-*`) are skipped.
 */
export function diffCardMoves(prev: GameState, next: GameState, max = 10): readonly CardMove[] {
  const prevZones = zoneIndex(prev);
  const nextZones = zoneIndex(next);

  const moves: CardMove[] = [];
  for (const [instanceId, nextLoc] of nextZones) {
    if (instanceId.startsWith('hidden-')) continue; // sanitized other-seat cards
    const prevLoc = prevZones.get(instanceId);
    if (prevLoc === undefined) continue; // newly created this step (rare)
    if (sameLoc(prevLoc, nextLoc)) continue;
    moves.push({
      instanceId,
      fromZone: prevLoc.zone,
      toZone: nextLoc.zone,
      fromPileId: prevLoc.pileId,
      toPileId: nextLoc.pileId,
      faceDown: travelsFaceDown(prevLoc.zone, nextLoc.zone),
    });
    if (moves.length >= max) break;
  }
  return moves;
}