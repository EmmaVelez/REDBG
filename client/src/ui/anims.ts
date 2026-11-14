import type { Action, CardReveal, GameState } from '@re/game-core';
import { exploreDamage } from '@re/game-core';

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
  for (const id of state.removed) map.set(id, { zone: 'removed' });
  return map;
}

/** Face-down whenever the card travels from or into a hidden pile. */
function travelsFaceDown(from: AnimZone, to: AnimZone): boolean {
  const hidden: ReadonlySet<AnimZone> = new Set([
    'deck',
    'discard',
    'mansion',
    'removed',
  ]);
  return hidden.has(from) || hidden.has(to);
}

/**
 * Explore-reveal support: when the OWN seat explores and an Infected is
 * revealed, the engine resolves the fight in the same action — the client
 * detects it via the same instance-diff and pauses on a readable reveal.
 */

export interface Reveal {
  readonly instanceId: string;
  /** Zone the revealed card ended up in after the fight resolved. `mansion`
   *  means it was RE-INSERTED into the deck (MX-001 Mr. X). `pending` means a
   *  NON-Infected reveal is parked in limbo while its Take / Send-to-bottom
   *  prompt is open — it is in no zone at all until the prompt is answered. */
  readonly outcomeZone: 'attached' | 'removed' | 'mansion' | 'pending';
  /** Seat that actually explored (the forced-explore target, if any). */
  readonly explorerSeat: number;
  /** Total damage the player's explore dealt (weapons + effects + turn bonus). */
  readonly damage: number;
  /** Weapon instance ids the exploring player used for this attack. */
  readonly weapons: readonly string[];
}

function sameLoc(a: ZoneLoc, b: ZoneLoc): boolean {
  return a.zone === b.zone && a.pileId === b.pileId;
}

/**
 * The cards revealed by the viewing player's most recent explore, if any, in
 * REVEAL ORDER (the order they came out of the Mansion — top card first).
 *
 * A single explore reveals one card, but a multi-explore (`exploreCount > 1`),
 * a CI-002 Crow chain or a MA-039/MA-072 event expansion reveals SEVERAL in one
 * action; the reveal panel steps through them one at a time.
 *
 * Requires the newest logged action to be an explore by `mySeat` (or a forced
 * explore by it) AND a revealed instance that is now somewhere other than the
 * top of the mansion. Returns null when there is no fresh reveal (bots
 * exploring, reshuffles, non-infected prompts).
 */
export function detectReveals(prev: GameState, next: GameState, mySeat: number): readonly Reveal[] {
  const last = next.log[next.log.length - 1];
  if (last === undefined) return [];
  const action = last.action;
  if (action.type !== 'explore') return [];
  // A forced explore (FCH-008 Sherry) is shown to the exploring seat AND to the
  // seat that forced it: in pass-and-play that is the device holder, and in a
  // server room the target may be a bot with no client of its own.
  if (action.seat !== mySeat && action.forcedBy !== mySeat) return [];

  const damage = exploreDamage(prev, action.seat, action.weapons);
  const weapons = action.weapons;
  const base = { explorerSeat: action.seat, damage, weapons };

  const prevZones = zoneIndex(prev);
  const nextZones = zoneIndex(next);

  // The engine records the exact revealed set on the logged action. The
  // top-`exploreCount` prefix is only a FALLBACK for logs written before that
  // field existed: a CI-002 Crow chain or a MA-039 / MA-072 expansion reveals
  // MORE cards than `exploreCount`, and the extra ones cannot be recovered
  // from the deck diff — a revealed card that is returned (bottomed / shuffled
  // back) looks exactly like an unrevealed deck card.
  const engineOrder = action.revealedInstanceIds ?? null;
  const revealedIds = engineOrder ?? prev.mansionDeck.slice(0, Math.max(1, action.exploreCount ?? 1));

  // Reveal order: the engine's list IS the reveal order. The pre-explore deck
  // order is the fallback (top-first; a WE-019 bottom reveal is the LAST card).
  const revealOrder = new Map<string, number>();
  if (engineOrder !== null) engineOrder.forEach((id, i) => revealOrder.set(id, i));
  else prev.mansionDeck.forEach((id, i) => revealOrder.set(id, i));

  const outcomes = new Map<string, Reveal['outcomeZone']>();
  for (const [instanceId, nextLoc] of nextZones) {
    if (instanceId.startsWith('hidden-')) continue;
    const prevLoc = prevZones.get(instanceId);
    if (prevLoc === undefined) continue;
    if (prevLoc.zone !== 'mansion') continue;
    if (sameLoc(prevLoc, nextLoc)) continue;
    if (nextLoc.zone === 'attached' || nextLoc.zone === 'removed') {
      outcomes.set(instanceId, nextLoc.zone);
    }
  }

  // The revealed set is the engine's list (or, for older logs, the top
  // `exploreCount` of the pre-explore deck). Two cases are invisible to the
  // zone diff above:
  //  - a revealed card found back in the deck was RE-INSERTED (MX-001 Mr. X:
  //    "place it on top of the mansion as the 5th upcoming card" — revealing
  //    REMOVES it from the deck, so being back means re-inserted);
  //  - a revealed NON-Infected card sits in NO zone at all. The engine parks it
  //    in limbo while its Take / Send-to-bottom prompt is open, so it is
  //    neither in the deck nor in any seat zone until the prompt is answered.
  for (const instanceId of revealedIds) {
    if (instanceId.startsWith('hidden-')) continue;
    if (outcomes.has(instanceId)) continue;
    if (next.mansionDeck.includes(instanceId)) outcomes.set(instanceId, 'mansion');
    else if (!nextZones.has(instanceId)) outcomes.set(instanceId, 'pending');
  }

  return [...outcomes.entries()]
    .map(([instanceId, outcomeZone]) => ({ instanceId, outcomeZone, ...base }))
    .sort(
      (a, b) =>
        (revealOrder.get(a.instanceId) ?? Number.MAX_SAFE_INTEGER) -
        (revealOrder.get(b.instanceId) ?? Number.MAX_SAFE_INTEGER),
    );
}

/** The first revealed card — the single-card view of `detectReveals`. */
export function detectReveal(prev: GameState, next: GameState, mySeat: number): Reveal | null {
  return detectReveals(prev, next, mySeat)[0] ?? null;
}

/** One batch of non-explore ability/effect reveals, as recorded by the engine. */
export interface CardRevealBatch {
  readonly seq: number;
  readonly action: Action;
  readonly reveals: readonly CardReveal[];
}

/**
 * The newest NON-explore ability/effect reveal batch present in `next` but not
 * in `prev`, or null.
 *
 * The engine fills `LoggedAction.reveals` at every peek/reveal site (Ada's
 * Mansion look, the PDA, Master of Unlocking, Ricardo's Inventory reveal,
 * Hunk's hand, SK-029's pistols, Cover-up, Wesker's Secret, the Bolt-Action
 * Rifle, …). A peek leaves the card in its pile, so there is no zone diff to
 * observe — the log field is the only signal. Explore reveals are NOT included
 * here; those belong to the mansion-door overlay.
 *
 * Like `detectReveals`, the batch is reported only to a seat that is INVOLVED:
 * the seat that caused it, or a seat whose own card was revealed (Master of
 * Unlocking / Mind Control expose an opponent's card to the actor, and the
 * opponent sees their own card being revealed). A bot's private peek must not
 * pop the overlay on the human's screen.
 */
export function detectCardReveals(prev: GameState, next: GameState, mySeat: number): CardRevealBatch | null {
  const prevMaxSeq = prev.log.length === 0 ? 0 : (prev.log[prev.log.length - 1]?.seq ?? 0);
  for (let i = next.log.length - 1; i >= 0; i--) {
    const entry = next.log[i];
    if (entry === undefined || entry.seq <= prevMaxSeq) break;
    if (entry.reveals !== undefined && entry.reveals.length > 0) {
      const actorSeat = 'seat' in entry.action ? entry.action.seat : -1;
      const involved = actorSeat === mySeat || entry.reveals.some(r => r.ownerSeat === mySeat);
      return involved ? { seq: entry.seq, action: entry.action, reveals: entry.reveals } : null;
    }
  }
  return null;
}

/**
 * Downed/death detection for the viewing player (RE-style "YOU DIED" screen).
 * Returns "downed" when their HP just hit 0 (they recover with -20 max HP),
 * or "dead" when the character is permanently dead this step.
 */
export function detectPlayerDowned(
  prev: GameState,
  next: GameState,
  mySeat: number
): 'downed' | 'dead' | null {
  const prevPlayer = prev.seats[mySeat];
  const nextPlayer = next.seats[mySeat];
  if (prevPlayer === undefined || nextPlayer === undefined) return null;
  // Permanent death (maxHp token reached 0 / revive impossible).
  if (!prevPlayer.dead && nextPlayer.dead) return 'dead';
  // HP dropped to zero this step -> downed (recoverable).
  if (prevPlayer.hp > 0 && nextPlayer.hp === 0 && !nextPlayer.dead) return 'downed';
  return null;
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