import type { CardDef, GameState, LocationEffect, LocationScoreEffect, PlayerState } from '../types';
import { makeRng, shuffle } from '../util/rng';
import { draw } from './deck';

/**
 * Fan "Locations" line — GLOBAL / 1X / investment room cards.
 *
 * A location lives on the board (state.locations), not in a player's zones.
 * `cubes` maps seat -> number of investment cubes on it; GLOBAL and 1X cards
 * never carry cubes. The face-down locationDeck is searched when the Mansion is
 * explored; a location on top is revealed (flipped face-up) and its On Reveal
 * effect fires.
 */

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function locationDefs(state: GameState): ReadonlyArray<CardDef> {
  return Object.values(state.cardDefs).filter(d => d.type === 'location');
}

/** The revealed location records, in reveal order. */
export function revealedLocations(state: GameState): ReadonlyArray<{ readonly instanceId: string; readonly def: CardDef; readonly cubes: Readonly<Record<number, number>>; readonly revealedBy: number }> {
  const out: Array<{ instanceId: string; def: CardDef; cubes: Readonly<Record<number, number>>; revealedBy: number }> = [];
  for (const loc of state.locations ?? []) {
    const def = state.cardDefs[state.cards[loc.instanceId]?.cardId ?? ''];
    if (def !== undefined) out.push({ instanceId: loc.instanceId, def, cubes: loc.cubes, revealedBy: loc.revealedBy ?? -1 });
  }
  return out;
}

/** Investment cubes `seat` has on the given location instance. */
export function cubesOn(state: GameState, instanceId: string, seat: number): number {
  const loc = (state.locations ?? []).find(l => l.instanceId === instanceId);
  return loc?.cubes[seat] ?? 0;
}

/** True when `seat` has at least one cube on the location (its invest effect is live). */
export function hasInvested(state: GameState, instanceId: string, seat: number): boolean {
  return cubesOn(state, instanceId, seat) > 0;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Count the Ammunition cards of each "set" size (10/20/30) a seat holds. */
function ammoSetCount(state: GameState, seat: number): number {
  const p = state.seats[seat];
  if (p === undefined) return 0;
  const held = [...p.hand, ...p.discard, ...p.playArea, ...p.inventory];
  const sets = [10, 20, 30].map(n =>
    held.filter(id => (state.cardDefs[state.cards[id]?.cardId ?? '']?.bonuses?.ammo ?? 0) === n).length,
  );
  return Math.min(...sets);
}

/** A seat's held cards by weapon `weaponType`. */
function weaponTypeCounts(state: GameState, seat: number): Readonly<Record<string, number>> {
  const p = state.seats[seat];
  const counts: Record<string, number> = {};
  if (p === undefined) return counts;
  for (const id of [...p.hand, ...p.discard, ...p.playArea, ...p.inventory]) {
    const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
    if (def?.type !== 'weapon') continue;
    const t = def.weaponType;
    if (t === undefined) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/** Card ids in the seat's hand/discard/play area/inventory whose ORIGINAL
 *  market pile is now empty — the Lounge scoring reading. */
function cardsFromEmptyPiles(state: GameState, seat: number): number {
  const p = state.seats[seat];
  if (p === undefined) return 0;
  // A MarketPile holds INSTANCE ids, and a pile may be EMPTY, so derive
  // each pile's cardId from every instance whose location names that pile.
  const pileCard = new Map<string, string>();
  for (const [id, inst] of Object.entries(state.cards)) {
    const loc = inst.location;
    if (loc.zone !== 'marketPile' || !('pileId' in loc) || loc.pileId === undefined) continue;
    if (!pileCard.has(loc.pileId)) pileCard.set(loc.pileId, inst.cardId);
    void id;
  }
  const pileOf = new Map<string, string>();
  for (const [pileId, cid] of pileCard) pileOf.set(cid, pileId);
  let total = 0;
  for (const id of [...p.hand, ...p.discard, ...p.playArea, ...p.inventory]) {
    const cid = state.cards[id]?.cardId;
    if (cid === undefined) continue;
    const pileId = pileOf.get(cid);
    if (pileId === undefined) continue;
    const pile = state.marketPiles[pileId];
    if (pile !== undefined && pile.cards.length === 0) total += 1;
  }
  return total;
}

/** Copies the seat holds of its 2nd most common weapon card NAME (a tie
 *  counts one name, not both — "count either, not both"). */
function secondMostCommonWeaponCopies(state: GameState, seat: number): number {
  const p = state.seats[seat];
  if (p === undefined) return 0;
  const counts = new Map<string, number>();
  for (const id of [...p.hand, ...p.discard, ...p.playArea, ...p.inventory]) {
    const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
    if (def?.type !== 'weapon') continue;
    counts.set(def.name, (counts.get(def.name) ?? 0) + 1);
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  return sorted.length >= 2 ? (sorted[1] ?? 0) : 0;
}

/** Distinct card names in a seat's Inventory. */
function distinctInventoryNames(state: GameState, seat: number): number {
  const p = state.seats[seat];
  if (p === undefined) return 0;
  const names = new Set<string>();
  for (const id of p.inventory) {
    const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
    if (def !== undefined) names.add(def.name);
  }
  return names.size;
}

/** Distinct ACTION card names of which a seat holds 2+ copies. */
function duplicateActionNames(state: GameState, seat: number): number {
  const p = state.seats[seat];
  if (p === undefined) return 0;
  const counts = new Map<string, number>();
  for (const id of [...p.hand, ...p.discard, ...p.playArea, ...p.inventory]) {
    const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
    if (def?.type !== 'action') continue;
    counts.set(def.name, (counts.get(def.name) ?? 0) + 1);
  }
  let n = 0;
  for (const c of counts.values()) if (c >= 2) n += 1;
  return n;
}

function scoreEffectValue(state: GameState, seat: number, effect: LocationScoreEffect): number {
  const p = state.seats[seat];
  switch (effect.kind) {
    case 'scorePerAmmoSet':
      return ammoSetCount(state, seat) * effect.perSet;
    case 'scorePerWeaponTypeMajority': {
      const mine = weaponTypeCounts(state, seat);
      const others = state.seats.filter(s => s.seat !== seat && !s.dead).map(s => weaponTypeCounts(state, s.seat));
      let total = 0;
      for (const [type, count] of Object.entries(mine)) {
        const bestOther = Math.max(0, ...others.map(o => o[type] ?? 0));
        if (count >= bestOther && count > 0) total += effect.perType;
      }
      return total;
    }
    case 'scorePerXp':
      return Math.floor((p?.xp ?? 0) / effect.perXp);
    case 'scorePerDistinctInventoryName':
      return distinctInventoryNames(state, seat) * effect.perName;
    case 'scorePerDuplicateActionName':
      return duplicateActionNames(state, seat) * effect.perName;
    case 'scorePerCardFromEmptyPile':
      return cardsFromEmptyPiles(state, seat) * effect.perCard;
    case 'scorePerCopyOfSecondMostCommonWeapon':
      return secondMostCommonWeaponCopies(state, seat) * effect.perCopy;
    case 'scorePenaltyPerInventoryOver':
      return -Math.max(0, (p?.inventory.length ?? 0) - effect.freeCards) * effect.perCard;
    case 'scorePenaltyPerSingletonInInventory': {
      const counts = new Map<string, number>();
      for (const id of p?.inventory ?? []) {
        const name = state.cardDefs[state.cards[id]?.cardId ?? '']?.name;
        if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      let singletons = 0;
      for (const c of counts.values()) if (c === 1) singletons += 1;
      return -singletons * effect.perCard;
    }
    case 'scoreLowHpInfectedWorth': {
      let total = 0;
      for (const id of p?.attached ?? []) {
        const def = state.cardDefs[state.cards[id]?.cardId ?? ''];
        if (def?.type === 'infected' && (def.hp ?? 0) <= effect.hpThreshold) total += effect.decorations;
      }
      return total;
    }
  }
}

/**
 * The Location-score bonus for a seat: the sum of every "When scoring" effect
 * on a REVEALED location that applies to them. GLOBAL locations apply to all;
 * an INVEST location's score effect applies only to seats with a cube.
 */
export function locationScore(state: GameState, seat: number): number {
  let total = 0;
  for (const loc of revealedLocations(state)) {
    const isGlobal = loc.def.locationKind === 'global';
    const applies = isGlobal || hasInvested(state, loc.instanceId, seat);
    if (!applies) continue;
    for (const effect of loc.def.locationScoreEffects ?? []) {
      total += scoreEffectValue(state, seat, effect);
    }
  }
  return total;
}

/** Decorations + location score, used by the end-game ranking. */
export function scoreTotal(state: GameState, seat: number): number {
  const p = state.seats[seat];
  return (p?.decorations ?? 0) + locationScore(state, seat);
}

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

/** The On Reveal effects of a location, for the given revealing seat. */
export function revealEffectsOf(def: CardDef): readonly LocationEffect[] {
  return def.locationRevealEffects ?? [];
}

/** The next location on the face-down location deck, if any. */
export function topLocationId(state: GameState): string | undefined {
  return state.locationDeck?.[0];
}

/** True when the seat is eligible to invest in this location. */
export function canInvest(state: GameState, instanceId: string, seat: number): boolean {
  const def = state.cardDefs[state.cards[instanceId]?.cardId ?? ''];
  if (def === undefined || def.type !== 'location') return false;
  if (def.locationKind !== 'invest') return false;
  const costs = def.locationCosts ?? [];
  const cubes = cubesOn(state, instanceId, seat);
  return cubes < costs.length;
}

/** The gold price of the seat's NEXT cube on this location. */
export function nextCubeCost(state: GameState, instanceId: string, seat: number): number | undefined {
  const def = state.cardDefs[state.cards[instanceId]?.cardId ?? ''];
  const costs = def?.locationCosts ?? [];
  const cubes = cubesOn(state, instanceId, seat);
  return costs[cubes];
}

/** Place a cube for `seat` on the location (price already paid). */
export function addCube(state: GameState, instanceId: string, seat: number): GameState {
  const locations = (state.locations ?? []).map(loc =>
    loc.instanceId === instanceId
      ? { ...loc, cubes: { ...loc.cubes, [seat]: (loc.cubes[seat] ?? 0) + 1 } }
      : loc,
  );
  return { ...state, locations };
}

/** Reveal the given location instance (moves it from the deck to the board). */
export function revealLocation(state: GameState, instanceId: string, seat: number): GameState {
  const deck = (state.locationDeck ?? []).filter(id => id !== instanceId);
  const locations = [...(state.locations ?? []), { instanceId, cubes: {}, revealedBy: seat }];
  return applyRevealEffects({ ...state, locationDeck: deck, locations }, instanceId, seat);
}

/** Apply a location's On Reveal effects. Returns the new state (and any
 *  prompts raised). */
export function applyRevealEffects(state: GameState, instanceId: string, seat: number): GameState {
  const def = state.cardDefs[state.cards[instanceId]?.cardId ?? ''];
  if (def === undefined) return state;
  let s = state;
  let prompts = s.prompts;
  for (const effect of revealEffectsOf(def)) {
    switch (effect.kind) {
      case 'revealGainHealth': {
        // "On Reveal" fires for EVERY living player, whatever the card's kind —
        // the GLOBAL/1X/invest label governs the ONGOING effect, not the reveal.
        const seats = s.seats.filter(x => !x.dead).map(x => x.seat);
        s = {
          ...s,
          seats: s.seats.map(x => (seats.includes(x.seat)
            ? { ...x, hp: Math.min(x.maxHp, x.hp + effect.amount) }
            : x)),
        };
        break;
      }
      case 'revealLoseHealth': {
        // "On Reveal" fires for every living player (see revealGainHealth).
        const seats = s.seats.filter(x => !x.dead).map(x => x.seat);
        s = {
          ...s,
          seats: s.seats.map(x => (seats.includes(x.seat) ? { ...x, hp: Math.max(0, x.hp - effect.amount) } : x)),
        };
        break;
      }
      case 'revealTurnTopMansionCardFaceUp':
        // Represented as a marker on the top mansion card; the card is already
        // face-up in the engine (the deck is private). No state change needed.
        break;
      case 'revealEachOtherPlayerMayDrawAndGainXp': {
        const others = s.seats.filter(x => x.seat !== seat && !x.dead && !x.downed);
        for (const other of others) {
          prompts = [...prompts, {
            id: `loc-draw-${other.seat}-${s.version}`,
            seat: other.seat,
            text: `${def.name}: draw a card?`,
            options: ['Draw', 'Decline'],
            payload: { kind: 'locDrawChoice', fromSeat: String(seat) },
          }];
        }
        break;
      }
      case 'revealEachOtherPlayerRevealsHandAndDiscard': {
        const others = s.seats.filter(x => x.seat !== seat && !x.dead && !x.downed && x.hand.length > 0);
        for (const other of others) {
          prompts = [...prompts, {
            id: `loc-discard-${other.seat}-${s.version}`,
            seat,
            text: `${def.name}: discard a card from ${other.name}'s hand?`,
            options: [...other.hand, 'Decline'],
            payload: { kind: 'locDiscardChoice', targetSeat: String(other.seat) },
          }];
        }
        break;
      }
      case 'revealRemoveInfectionAndCounters': {
        // Lounge: the REVEALING seat's top attached Infected and every
        // counter on their Character leave play.
        const attached = s.seats[seat]?.attached ?? [];
        const top = attached[attached.length - 1];
        const counters = s.seats[seat]?.counters ?? [];
        const leaving = [...counters, ...(top !== undefined ? [top] : [])];
        if (leaving.length > 0) {
          const moved = { ...s.cards };
          for (const id of leaving) {
            const inst = moved[id];
            if (inst !== undefined) moved[id] = { ...inst, location: { zone: 'removed', index: 0 } };
          }
          s = {
            ...s,
            cards: moved,
            removed: [...s.removed, ...leaving],
            seats: s.seats.map(x => (x.seat === seat
              ? { ...x, counters: x.counters?.filter(c => !counters.includes(c)), attached: x.attached.filter(a => a !== top) }
              : x)),
          };
        }
        break;
      }
      case 'revealInfectedHpReductionThisTurn':
        s = { ...s, infectedHpReductionThisTurn: { amount: effect.amount, min: effect.min } };
        break;
      case 'revealInfectedHpBonusThisTurn':
        // Attic Landing: Infected revealed this turn are harder to kill.
        s = { ...s, infectedHpBonusThisTurn: effect.amount };
        break;
      case 'revealEachPlayerMayGainItem': {
        // Terrace: every living player may take one item from the Resource Area.
        for (const other of s.seats.filter(x => !x.dead && !x.downed)) {
          const itemIds = itemMarketIds(s);
          if (itemIds.length === 0) continue;
          prompts = [...prompts, {
            id: `loc-item-${other.seat}-${s.version}`,
            seat: other.seat,
            text: `${def.name}: gain an item from the Resource Area?`,
            options: [...itemIds, 'Decline'],
            payload: { kind: 'locGainItemChoice' },
          }];
        }
        break;
      }
      case 'revealEachPlayerMayPayXpToRemoveInfection': {
        // Trevor's Tomb: pay 1 XP to remove one of your own infection cards.
        for (const other of s.seats.filter(x => !x.dead && !x.downed)) {
          const infected = other.infectionCards ?? [];
          if (infected.length === 0 || (other.xp ?? 0) < effect.xp) continue;
          prompts = [...prompts, {
            id: `loc-payxp-${other.seat}-${s.version}`,
            seat: other.seat,
            text: `${def.name}: pay ${effect.xp} XP to remove an infection?`,
            options: ['Pay', 'Decline'],
            payload: { kind: 'locPayXpRemoveInfectionChoice', xp: String(effect.xp) },
          }];
        }
        break;
      }
      case 'revealEachPlayerMayDiscardForXp': {
        // Tiger Statue Room: every living player may discard a card for XP.
        for (const other of s.seats.filter(x => !x.dead && !x.downed && x.hand.length > 0)) {
          prompts = [...prompts, {
            id: `loc-discardxp-${other.seat}-${s.version}`,
            seat: other.seat,
            text: `${def.name}: discard a card for ${effect.xp} XP?`,
            options: [...other.hand, 'Decline'],
            payload: { kind: 'locDiscardForXpChoice', xp: String(effect.xp) },
          }];
        }
        break;
      }
      case 'ongoingDrawAtTurnEnd':
      case 'ongoingGainXpOnTrash':
      case 'onexGainAmmoAndDamagePerCardGained':
      case 'onexLookThroughDiscard':
      case 'onexGainBuyAndAmmo':
      case 'atticUpgrade':
      case 'postTurnCleanup':
        // Ongoing / 1X effects are applied at their own trigger sites.
        break;
    }
  }
  return { ...s, prompts };
}

/** Ongoing invest effects for a seat (from locations they have cubed). */
export function investEffectsFor(state: GameState, seat: number): readonly LocationEffect[] {
  const out: LocationEffect[] = [];
  for (const loc of revealedLocations(state)) {
    if (loc.def.locationKind === 'global') {
      // A GLOBAL card's effects normally apply to everyone; a card may
      // scope one to the seat that revealed it.
      for (const effect of loc.def.locationInvestEffects ?? []) {
        if (effect.kind === 'ongoingDrawAtTurnEnd' && effect.scope === 'revealer' && seat !== loc.revealedBy) continue;
        out.push(effect);
      }
      continue;
    }
    const cubes = loc.cubes[seat] ?? 0;
    if (cubes <= 0) continue;
    for (const effect of loc.def.locationInvestEffects ?? []) {
      const need = (effect as { cubes?: number }).cubes ?? 1;
      if (cubes >= need) out.push(effect);
    }
  }
  return out;
}

/** The player's extra end-of-turn draws from revealed GLOBAL locations. */
export function locationEndOfTurnDraws(state: GameState, seat: number): number {
  let total = 0;
  for (const effect of investEffectsFor(state, seat)) {
    if (effect.kind === 'ongoingDrawAtTurnEnd') total += effect.count;
  }
  return total;
}

/** Lord Spencer's Study: XP the seat earns when it trashes a card. */
export function locationXpOnTrash(state: GameState, seat: number): number {
  let total = 0;
  for (const effect of investEffectsFor(state, seat)) {
    if (effect.kind === 'ongoingGainXpOnTrash') total += effect.amount;
  }
  return total;
}

/** Instance ids of every ITEM card on top of a Resource Area pile. */
function itemMarketIds(state: GameState): string[] {
  const out: string[] = [];
  for (const pile of Object.values(state.marketPiles)) {
    const top = pile.cards[0];
    if (top === undefined) continue;
    if (state.cardDefs[state.cards[top]?.cardId ?? '']?.type === 'item') out.push(top);
  }
  return out;
}

/** Tiger Statue Room: gold the seat's locations knock off every buy this turn. */
export function locationBuyCostReduction(state: GameState, seat: number): number {
  let total = 0;
  for (const effect of investEffectsFor(state, seat)) {
    if (effect.kind === 'ongoingBuyCostReduction') total += effect.amount;
  }
  return total;
}

/** Terrace: the investor may still free-play the first action gained this turn.
 *  The flag is only "consumed" once it has been spent (undefined = not armed). */
export function hasFreeActionPlay(state: GameState, seat: number): boolean {
  const p = state.seats[seat];
  if (p === undefined) return false;
  if (p.freeActionPlayAvailable === false) return false;
  return investEffectsFor(state, seat).some(e => e.kind === 'ongoingFreePlayFirstActionGained');
}

/** Trevor's Tomb: the investor's first action card each turn is played again. */
export function hasFreeActionRepeat(state: GameState, seat: number): boolean {
  return investEffectsFor(state, seat).some(e => e.kind === 'ongoingRepeatFirstActionPlayed');
}

/** Every market ACTION whose cost is at most `maxCost` (top instance ids). */
export function affordableMarketActions(state: GameState, maxCost: number): string[] {
  const out: string[] = [];
  for (const pile of Object.values(state.marketPiles)) {
    const top = pile.cards[0];
    if (top === undefined) continue;
    const def = state.cardDefs[state.cards[top]?.cardId ?? ''];
    if (def?.type !== 'action') continue;
    if ((def.cost ?? 0) <= maxCost) out.push(top);
  }
  return out;
}

/** True when the seat's location lets them trash on their 2nd gain of a turn. */
export function hasTrashOnSecondGain(state: GameState, seat: number): boolean {
  return investEffectsFor(state, seat).some(e => e.kind === 'ongoingTrashOnSecondCardGain');
}


/** Fan Location (Attic Landing): the +Health Infected get this turn. */
export function locationInfectedHpBonus(state: GameState): number {
  return state.infectedHpBonusThisTurn ?? 0;
}

/** True when the location's 1X is the ART SUPPLY ROOM post-turn cleanup. */
export function hasPostTurnCleanup(state: GameState, instanceId: string): boolean {
  const def = state.cardDefs[state.cards[instanceId]?.cardId ?? ''];
  return (def?.locationRevealEffects ?? []).some(e => e.kind === 'postTurnCleanup');
}

/**
 * Fan Location (Art Supply Room): after the turn, fold the Inventory and the
 * discard pile into the hand, trash up to `trash` cards, shuffle the hand back
 * into the Inventory, then draw `draw` cards.
 *
 * The trash is DETERMINISTIC (the first `trash` cards of the merged hand): the
 * card grants a player CHOICE, but the engine has no prompt slot between
 * end-of-turn cleanup and the next turn, and a prompt raised there would block
 * the next turn from opening. Trashing fewer is always legal, so taking the
 * first N is a valid (if unfavourable) resolution.
 */
export function applyPostTurnCleanup(
  player: PlayerState,
  effect: { readonly trash: number; readonly draw: number },
  rngState: number,
): { player: PlayerState; rngState: number; trashed: readonly string[] } {
  const pool = [...player.hand, ...player.inventory, ...player.discard];
  const trashed = pool.slice(0, Math.max(0, effect.trash));
  const kept = pool.slice(trashed.length);
  const shuffled = shuffle(makeRng(rngState), kept);
  const d = draw({
    deck: shuffled.value,
    discard: [],
    reshuffledDiscard: [],
    count: effect.draw,
  });
  return {
    player: {
      ...player,
      hand: d.hand,
      inventory: d.deck,
      discard: d.discard,
    },
    rngState: shuffled.rng.s,
    trashed,
  };
}
