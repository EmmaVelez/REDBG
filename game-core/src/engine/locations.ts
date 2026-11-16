import type { CardDef, GameState, LocationEffect, LocationScoreEffect, PlayerState } from '../types';

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
        // GLOBAL: every player gains the health. Otherwise the revealing seat.
        const seats = def.locationKind === 'global'
          ? s.seats.filter(x => !x.dead).map(x => x.seat)
          : [seat];
        s = {
          ...s,
          seats: s.seats.map(x => (seats.includes(x.seat)
            ? { ...x, hp: Math.min(x.maxHp, x.hp + effect.amount) }
            : x)),
        };
        break;
      }
      case 'revealLoseHealth': {
        const seats = def.locationKind === 'global' ? s.seats.filter(x => !x.dead).map(x => x.seat) : [seat];
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
      case 'ongoingDrawAtTurnEnd':
      case 'onexGainAmmoAndDamagePerCardGained':
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

/** True when the seat's location lets them trash on their 2nd gain of a turn. */
export function hasTrashOnSecondGain(state: GameState, seat: number): boolean {
  return investEffectsFor(state, seat).some(e => e.kind === 'ongoingTrashOnSecondCardGain');
}
