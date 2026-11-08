import type { CardDef, GameState, PlayerState, Prompt } from '../types';
import { gainCard } from './gainCard';
import { sendToBottom, shuffleBack } from './mansion';
import { characterAbilities, applyHpLoss, applyRicardoDamage, effectiveWeaponTags } from './abilities';
import { flipDown } from './characters';
import { makeRng, shuffle } from '../util/rng';

/**
 * Mercenaries expansion — engine support for the character / weapon / action /
 * infected effects that are not covered by the base engine.
 *
 * The functions here are called from the explore reducer (reveal / defeat /
 * not-defeated branches) and from the action reducers. They return a NEW state
 * plus any prompts the effect needs resolved; the caller merges the prompts.
 */

export interface MercenariesContext {
  /** The exploring seat. */
  readonly seat: number;
  readonly revealedInstanceId: string;
  readonly revealedDef: CardDef;
  /** Weapon instance ids used in the explore. */
  readonly weapons: readonly string[];
  /** The exploring player's hand after the weapons were moved to the play area. */
  readonly handAfter: readonly string[];
  /** Infected attached to the exploring Character before this explore. */
  readonly attachedInfectedCount: number;
  /** XP on the exploring Character. */
  readonly characterXp: number;
}

export interface MercenariesResult {
  readonly state: GameState;
  readonly prompts: readonly Prompt[];
  /** MA-078: this Infected was shuffled back into the Mansion by the effect,
   *  so the caller must not send it to the bottom again. */
  readonly infectedShuffledBack?: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Combo Pile Decoration delta when the attached list changes from `prevIds` to
 * `newIds`.
 *
 * MA-077 Chicken: "This Infected is worth 0 Decorations while in a Combo Pile
 * by itself." The base engine keeps a running `decorations` total, so the
 * adjustment compares the effective totals (a lone MA-077 counts as 0) rather
 * than recomputing from scratch — this preserves any Decorations the player
 * already had.
 */
export function decorationDelta(state: GameState, prevIds: readonly string[], newIds: readonly string[]): number {
  const sum = (ids: readonly string[]) => ids.reduce((acc, id) => {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    return acc + (def?.decorations ?? 0);
  }, 0);
  const effective = (ids: readonly string[]) => {
    if (ids.length === 1) {
      const inst = state.cards[ids[0] ?? ''];
      const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
      if (def?.infectedEffects?.some(e => e.kind === 'zeroDecorationsInComboPile')) return 0;
    }
    return sum(ids);
  };
  return effective(newIds) - effective(prevIds);
}

/**
 * "Gain 1 Ammo x10" (rules glossary: Gain moves a card from the Resource Area
 * to the player's Discard Pile). Finds a market pile whose TOP card is an
 * Ammunition worth 10 Ammo and moves up to `count` copies.
 */
export function gainAmmoX10(state: GameState, seat: number, count = 1, dest: 'discard' | 'hand' = 'discard'): GameState {
  const player = state.seats[seat];
  if (player === undefined || count <= 0) return state;
  let s = state;
  let gained = 0;
  while (gained < count) {
    const entry = Object.entries(s.marketPiles).find(([, pile]) => {
      const top = pile.cards[0];
      if (top === undefined) return false;
      const def = s.cardDefs[s.cards[top]?.cardId ?? ''];
      return def?.type === 'ammunition' && (def.bonuses?.ammo ?? 0) === 10;
    });
    if (entry === undefined) break;
    const [pileId, pile] = entry;
    const top = pile.cards[0] as string;
    s = {
      ...s,
      seats: s.seats.map(p => (p.seat === seat
        ? dest === 'hand'
          ? { ...p, hand: [...p.hand, top] }
          : { ...p, discard: [...p.discard, top] }
        : p)),
      marketPiles: { ...s.marketPiles, [pileId]: { ...pile, cards: pile.cards.slice(1) } },
    };
    gained += 1;
  }
  return s;
}

/**
 * Deal damage to a Character, applying HUNK's (CH-045) damage reduction and
 * flipping them down when the hit is lethal. Returns the new state.
 */
export function dealDamageToCharacter(state: GameState, seat: number, amount: number): GameState {
  const player = state.seats[seat];
  if (player === undefined || amount <= 0) return state;
  const abilities = characterAbilities(state, seat);
  const hunkReduce = abilities.reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
  const dmg = Math.max(amount - hunkReduce, 0);
  const ric = applyRicardoDamage(state, seat, player.hp, dmg);
  state = ric.state;
  const newHp = ric.hp;
  if (newHp > 0 || player.downed || player.dead) {
    return { ...state, seats: state.seats.map(s => (s.seat === seat ? { ...s, hp: newHp } : s)) };
  }
  let rng = makeRng(state.rngState);
  const rngShuffle = (items: readonly string[]): string[] => {
    const r = shuffle(rng, items);
    rng = r.rng;
    return [...r.value];
  };
  const flip = flipDown(
    {
      hp: newHp,
      maxHp: player.maxHp,
      decorations: player.decorations,
      level: player.level,
      downed: false,
      dead: false,
      hand: player.hand,
      discard: player.discard,
      inventory: player.inventory,
    },
    rngShuffle,
  );
  return {
    ...state,
    rngState: rng.s,
    seats: state.seats.map(s => (s.seat === seat
      ? { ...s, hp: flip.hp, downed: flip.downed, dead: flip.dead, hand: flip.hand, discard: flip.discard, inventory: flip.inventory, playArea: [] }
      : s)),
  };
}

/** Remove an instance from whichever zone of whichever seat holds it. */
export function removeInstanceEverywhere(state: GameState, instanceId: string): GameState {
  return {
    ...state,
    seats: state.seats.map(s => ({
      ...s,
      hand: s.hand.filter(id => id !== instanceId),
      discard: s.discard.filter(id => id !== instanceId),
      playArea: s.playArea.filter(id => id !== instanceId),
      inventory: s.inventory.filter(id => id !== instanceId),
      attached: s.attached.filter(id => id !== instanceId),
      partnerAttached: (s.partnerAttached ?? []).filter(id => id !== instanceId),
    })),
  };
}

/** The seat whose zones currently hold the instance, if any. */
export function ownerSeatOf(state: GameState, instanceId: string): number | undefined {
  return state.seats.find(s =>
    s.hand.includes(instanceId) || s.discard.includes(instanceId) ||
    s.playArea.includes(instanceId) || s.inventory.includes(instanceId),
  )?.seat;
}

/** The TOP cards of every non-empty market pile with a cost, cheapest first. */
export function lowestCostResourceTops(
  state: GameState,
): ReadonlyArray<{ readonly cardId: string; readonly cost: number; readonly instanceId: string }> {
  const tops: Array<{ cardId: string; cost: number; instanceId: string }> = [];
  for (const pile of Object.values(state.marketPiles)) {
    const top = pile.cards[0];
    if (top === undefined) continue;
    const def = state.cardDefs[state.cards[top]?.cardId ?? ''];
    if (def === undefined || def.cost === undefined) continue;
    tops.push({ cardId: def.id, cost: def.cost, instanceId: top });
  }
  if (tops.length === 0) return [];
  const min = Math.min(...tops.map(t => t.cost));
  return tops.filter(t => t.cost === min);
}

/** Gain a fresh copy of a card (MA-092 "Gain 1 copy"). */
export function gainCopy(state: GameState, seat: number, cardId: string): GameState {
  return gainCard(state, { seat, cardId, destination: 'discard', reason: 'other' });
}

/** All non-empty market pile ids. */
export function nonEmptyPileIds(state: GameState): readonly string[] {
  return Object.values(state.marketPiles)
    .filter(p => p.cards.length > 0)
    .map(p => p.pileId);
}

/** The top card instance id of a pile, if any. */
export function pileTop(state: GameState, pileId: string): string | undefined {
  return state.marketPiles[pileId]?.cards[0];
}

/** Remove the top card of a pile from the game (MA-089/091). */
export function removePileTop(state: GameState, pileId: string): GameState {
  const pile = state.marketPiles[pileId];
  const top = pile?.cards[0];
  if (pile === undefined || top === undefined) return state;
  return {
    ...state,
    marketPiles: { ...state.marketPiles, [pileId]: { ...pile, cards: pile.cards.slice(1) } },
    removed: [...state.removed, top],
  };
}

// ---------------------------------------------------------------------------
// Reveal-time infected effects
// ---------------------------------------------------------------------------

export interface RevealResult extends MercenariesResult {
  /** Weapons whose damage is set to 0 this turn (MA-081). */
  readonly zeroDamageWeaponIds: readonly string[];
  /** Cards gained by players on reveal (MA-092). Applied by the caller AFTER
   *  the explore's own seat updates, so they are not overwritten. */
  readonly gains: ReadonlyArray<{ readonly seat: number; readonly cardId: string }>;
}

/**
 * On-Reveal Mercenaries infected effects. Combat-affecting ones (MA-081/083/
 * 084/085) are handled here or by `resolveExplore`; the rest are prompts.
 */
export function applyMercenariesRevealEffects(state: GameState, ctx: MercenariesContext): RevealResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [], zeroDamageWeaponIds: [], gains: [] };

  let s = state;
  let prompts: Prompt[] = [];
  let zeroDamageWeaponIds: readonly string[] = [];
  const gains: Array<{ readonly seat: number; readonly cardId: string }> = [];

  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'onRevealZeroDamageOfLowestAmmoReqWeapon': {
        // The weapon(s) with the lowest Ammo Requirement deal 0 damage.
        const reqs = ctx.weapons.map(id => ({ id, req: weaponAmmoReq(s, ctx.seat, id) }));
        const min = Math.min(...reqs.map(r => r.req));
        zeroDamageWeaponIds = reqs.filter(r => r.req === min).map(r => r.id);
        break;
      }
      case 'onRevealEachPlayerRemovesSkillXp': {
        for (const seat of s.seats) {
          if (seat.dead) continue;
          const skillIds = (seat.skills ?? []).filter(id => (s.cards[id]?.xp ?? 0) >= e.amount);
          if (skillIds.length === 0) continue;
          prompts = [...prompts, {
            id: `ma076-${seat.seat}-v${s.version}`,
            seat: seat.seat,
            text: 'Base Majini (Gun) is Revealed: remove 1 XP on 1 of your Skills.',
            options: [...skillIds],
            payload: { kind: 'ma076RemoveSkillXp', amount: String(e.amount) },
          }];
        }
        break;
      }
      case 'onRevealLowestDecorationPlayersMoveDiscardToHighest': {
        const alive = s.seats.filter(x => !x.dead);
        if (alive.length < 2) break;
        const min = Math.min(...alive.map(x => x.decorations));
        const max = Math.max(...alive.map(x => x.decorations));
        if (min === max) break;
        const lows = alive.filter(x => x.decorations === min);
        const highs = alive.filter(x => x.decorations === max);
        const targetOptions = highs.map(x => String(x.seat));
        for (const low of lows) {
          if (low.discard.length === 0) continue;
          prompts = [...prompts, {
            id: `ma080-${low.seat}-v${s.version}`,
            seat: low.seat,
            text: `Move up to ${e.count} cards from your Discard Pile to the Discard Pile of the Player(s) with the highest Decorations.`,
            options: [...low.discard, 'DONE'],
            payload: { kind: 'ma080ChooseCard', targets: targetOptions.join(','), count: String(e.count), moved: '0' },
          }];
        }
        break;
      }
      case 'onRevealEachPlayerPassesHandCardLeft': {
        const n = s.seats.length;
        for (const seat of s.seats) {
          if (seat.dead || seat.hand.length === 0) continue;
          const target = (seat.seat + 1) % n;
          prompts = [...prompts, {
            id: `ma086-${seat.seat}-v${s.version}`,
            seat: seat.seat,
            text: 'Los Illuminados (Scythe) is Revealed: pass 1 card from your Hand to the Player to your left.',
            options: [...seat.hand],
            payload: { kind: 'ma086PassCard', targetSeat: String(target) },
          }];
        }
        break;
      }
      case 'onRevealEachPlayerRemovesResourcePileTop': {
        const pileIds = nonEmptyPileIds(s);
        if (pileIds.length === 0) break;
        for (const seat of s.seats) {
          if (seat.dead) continue;
          prompts = [...prompts, {
            id: `ma089-${seat.seat}-v${s.version}`,
            seat: seat.seat,
            text: 'Select and Remove the top card of any Resource Pile from the Game.',
            options: [...pileIds],
            payload: { kind: 'ma089RemovePileTop' },
          }];
        }
        break;
      }
      case 'onRevealAllPlayersGainLowestCostResource': {
        const tops = lowestCostResourceTops(s);
        if (tops.length === 0) break;
        if (tops.length === 1) {
          const only = tops[0];
          if (only !== undefined) {
            for (const seat of s.seats) {
              if (seat.dead) continue;
              gains.push({ seat: seat.seat, cardId: only.cardId });
            }
          }
          break;
        }
        // Tie: each player chooses which tied card to Gain.
        const cardIds = [...new Set(tops.map(t => t.cardId))];
        for (const seat of s.seats) {
          if (seat.dead) continue;
          prompts = [...prompts, {
            id: `ma092-${seat.seat}-v${s.version}`,
            seat: seat.seat,
            text: 'Gain 1 copy of the lowest cost card in the Resource Area (choose which).',
            options: cardIds,
            payload: { kind: 'ma092ChooseCard' },
          }];
        }
        break;
      }
      default:
        break;
    }
  }

  return { state: s, prompts, zeroDamageWeaponIds, gains };
}

/** Ammo Requirement of a weapon instance for this seat (base + character perks). */
function weaponAmmoReq(state: GameState, seat: number, weaponId: string): number {
  const inst = state.cards[weaponId];
  const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
  const abilities = characterAbilities(state, seat);
  const base = def?.ammoReq ?? 0;
  const tags = new Set<string>(def?.weaponTags ?? []);
  for (const t of effectiveWeaponTags(state, seat, weaponId)) tags.add(t);
  let reduction = 0;
  for (const a of abilities) {
    if (a.kind === 'ammoReqReduction' && tags.has(a.tag)) reduction += a.amount;
  }
  return Math.max(base - reduction, 0);
}

// ---------------------------------------------------------------------------
// Defeat-time infected effects
// ---------------------------------------------------------------------------

/**
 * On-Defeat Mercenaries infected effects (MA-073/074/088/093/094/096/098).
 * `state` must already carry the exploring player's post-defeat updates.
 */
export function applyMercenariesDefeatEffects(state: GameState, ctx: MercenariesContext): MercenariesResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [] };

  let s = state;
  let prompts: Prompt[] = [];

  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'onDefeatChoosePlayerGainAmmoX10': {
        const others = s.seats.filter(x => x.seat !== ctx.seat && !x.dead);
        if (others.length === 0) break;
        prompts = [...prompts, {
          id: `ma073-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: 'Town Majini is Defeated: select another Player. That Player Gains 1 "Ammo x10".',
          options: [...others.map(x => String(x.seat)), 'Decline'],
          payload: { kind: 'ma073ChoosePlayer', count: String(e.count) },
        }];
        break;
      }
      case 'onDefeatChoosePlayerTrashHandForAmmoX10': {
        const candidates = s.seats.filter(x => !x.dead && x.hand.length > 0);
        if (candidates.length === 0) break;
        prompts = [...prompts, {
          id: `ma074-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: 'Town Majini (Shovel) is Defeated: select a Player. That Player Trashes 1 card from their Hand and replaces it with 1 "Ammo x10".',
          options: [...candidates.map(x => String(x.seat))],
          payload: { kind: 'ma074ChoosePlayer' },
        }];
        break;
      }
      case 'onDefeatMoveResourceCardToOpponentDiscard': {
        const tops = Object.values(s.marketPiles)
          .filter(p => p.cards.length > 0)
          .map(p => ({ pileId: p.pileId, top: p.cards[0] as string }));
        if (tops.length === 0) break;
        prompts = [...prompts, {
          id: `ma088-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: "Tribal Majini (Bow) is Defeated: move 1 card in the Resource Area to an opponent's Discard Pile.",
          options: [...tops.map(t => t.top), 'Decline'],
          payload: { kind: 'ma088ChooseCard' },
        }];
        break;
      }
      case 'onDefeatDrawCardAtEndOfTurn': {
        s = {
          ...s,
          seats: s.seats.map(x => (x.seat === ctx.seat
            ? { ...x, pendingEndOfTurnDraws: (x.pendingEndOfTurnDraws ?? 0) + e.count }
            : x)),
        };
        break;
      }
      case 'onDefeatTrashCardFromAnyDiscard': {
        const options: string[] = [];
        for (const seat of s.seats) {
          if (!seat.dead) options.push(...seat.discard);
        }
        if (options.length === 0) break;
        prompts = [...prompts, {
          id: `ma094-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: "Los Ganados (Pitchfork) is Defeated: Trash 1 card from any Player's Discard Pile.",
          options: [...options, 'Decline'],
          payload: { kind: 'ma094ChooseCard' },
        }];
        break;
      }
      case 'onDefeatGiveDamageToAnyCharacter': {
        const candidates = s.seats.filter(x => !x.dead);
        if (candidates.length === 0) break;
        prompts = [...prompts, {
          id: `ma096-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: 'Los Illuminados (Bow) is Defeated: give 20 Damage to any Character.',
          options: [...candidates.map(x => String(x.seat)), 'Decline'],
          payload: { kind: 'ma096ChooseSeat', amount: String(e.amount) },
        }];
        break;
      }
      case 'onDefeatMoveHandOrDiscardToPlayerDiscard': {
        const player = s.seats[ctx.seat];
        const options = [...(player?.hand ?? []), ...(player?.discard ?? [])];
        if (options.length === 0) break;
        prompts = [...prompts, {
          id: `ma098-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: "Base Majini (Shield) is Defeated: move 1 card from your Hand or Discard Pile to another Player's Discard Pile.",
          options: [...options, 'Decline'],
          payload: { kind: 'ma098ChooseCard' },
        }];
        break;
      }
      default:
        break;
    }
  }

  return { state: s, prompts };
}

// ---------------------------------------------------------------------------
// Not-defeated-time infected effects
// ---------------------------------------------------------------------------

/** On-Not-Defeated Mercenaries infected effects (MA-075/078/079/082/090). */
export function applyMercenariesNotDefeatedEffects(state: GameState, ctx: MercenariesContext): MercenariesResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [] };

  let s = state;
  let prompts: Prompt[] = [];
  let mansionDeck = s.mansionDeck;
  let mansionBottom = s.mansionBottom;
  let infectedShuffledBack = false;

  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'onNotDefeatedReduceAllMaxHpIfPilesBelow': {
        const piles = nonEmptyPileIds(s).length;
        if (piles >= e.pileThreshold) break;
        s = {
          ...s,
          seats: s.seats.map(x => {
            if (x.dead) return x;
            const maxHp = Math.max(x.maxHp - e.amount, 1);
            return { ...x, maxHp, hp: Math.min(x.hp, maxHp) };
          }),
        };
        break;
      }
      case 'onNotDefeatedMoveHighestDecorationAttachedToBottomThenShuffle': {
        const player = s.seats[ctx.seat];
        if (player === undefined || player.attached.length === 0) break;
        // Highest-decoration attached Infected goes to the bottom of the Mansion.
        let bestId: string | undefined;
        let bestDecorations = -1;
        for (const id of player.attached) {
          const inst = s.cards[id];
          const d = inst === undefined ? undefined : s.cardDefs[inst.cardId];
          if (d?.type !== 'infected') continue;
          if ((d.decorations ?? 0) > bestDecorations) {
            bestDecorations = d.decorations ?? 0;
            bestId = id;
          }
        }
        if (bestId !== undefined) {
          const bottomed = sendToBottom({ deck: mansionDeck, bottom: mansionBottom }, bestId);
          mansionDeck = bottomed.deck;
          mansionBottom = bottomed.bottom;
          // The moved Infected leaves the Combo Pile, so its Decoration Reward
          // is lost (and a lone MA-077 becomes worth 0).
          const prevAttached = player.attached;
          const newAttached = prevAttached.filter(id => id !== bestId);
          const delta = decorationDelta(s, prevAttached, newAttached);
          s = {
            ...s,
            seats: s.seats.map(x => (x.seat === ctx.seat
              ? { ...x, attached: newAttached, decorations: x.decorations + delta }
              : x)),
          };
        }
        // Then shuffle this Infected into the Mansion.
        const shuffled = shuffleBack(
          { deck: mansionDeck, bottom: mansionBottom },
          ctx.revealedInstanceId,
          items => {
            const r = shuffle(makeRng(s.rngState), items);
            s = { ...s, rngState: r.rng.s };
            return [...r.value];
          },
        );
        mansionDeck = shuffled.deck;
        mansionBottom = shuffled.bottom;
        infectedShuffledBack = true;
        break;
      }
      case 'onNotDefeatedExploringPlayerGainsAmmoX10': {
        s = gainAmmoX10(s, ctx.seat, e.count);
        break;
      }
      case 'onNotDefeatedTrashTopInventory': {
        const player = s.seats[ctx.seat];
        if (player === undefined || player.inventory.length === 0) break;
        const n = Math.min(e.count, player.inventory.length);
        const trashed = player.inventory.slice(0, n);
        s = {
          ...s,
          seats: s.seats.map(x => (x.seat === ctx.seat ? { ...x, inventory: x.inventory.slice(n) } : x)),
          removed: [...s.removed, ...trashed],
        };
        break;
      }
      case 'onNotDefeatedTrashUsedWeaponCostAtMost': {
        const candidates = ctx.weapons.filter(id => {
          const inst = s.cards[id];
          const d = inst === undefined ? undefined : s.cardDefs[inst.cardId];
          return d?.type === 'weapon' && (d.cost ?? 0) <= e.maxCost;
        });
        if (candidates.length === 0) break;
        prompts = [...prompts, {
          id: `ma090-${ctx.seat}-v${s.version}`,
          seat: ctx.seat,
          text: 'Tribal Majini (Shield) was not Defeated: Trash 1 Weapon with a cost of 40 or less that the Exploring Character is using.',
          options: [...candidates, 'Decline'],
          payload: { kind: 'ma090ChooseWeapon' },
        }];
        break;
      }
      default:
        break;
    }
  }

  return { state: { ...s, mansionDeck, mansionBottom }, prompts, infectedShuffledBack };
}

// ---------------------------------------------------------------------------
// Character / weapon on-defeat abilities and effects
// ---------------------------------------------------------------------------

/**
 * Character abilities and weapon effects that trigger when the exploring
 * Character Defeats an Infected (CH-047 Chris, WE-044, WE-045, WE-050).
 * Barry Burton's chain (CH-051) is handled by the caller because it mutates
 * the Mansion and the attached list.
 */
export function applyMercenariesOnDefeatAbilities(state: GameState, ctx: MercenariesContext): MercenariesResult {
  const player = state.seats[ctx.seat];
  if (player === undefined) return { state, prompts: [] };
  const abilities = characterAbilities(state, ctx.seat);

  let s = state;
  let prompts: Prompt[] = [];

  if (abilities.some(a => a.kind === 'onDefeatTrashFromDiscardOrHand')) {
    const options = [...player.discard, ...player.hand];
    if (options.length > 0) {
      prompts = [...prompts, {
        id: `chris-trash-${ctx.seat}-v${s.version}`,
        seat: ctx.seat,
        text: 'Chris Defeated an Infected: Trash 1 card in your Discard Pile or Hand.',
        options: [...options, 'Decline'],
        payload: { kind: 'chrisTrashDiscardOrHand' },
      }];
    }
  }

  // Weapons used in the explore that carry an on-defeat effect.
  for (const weaponId of ctx.weapons) {
    const inst = s.cards[weaponId];
    const d = inst === undefined ? undefined : s.cardDefs[inst.cardId];
    for (const e of d?.weaponEffects ?? []) {
      if (e.kind === 'onDefeatGainXp') {
        s = {
          ...s,
          seats: s.seats.map(x => (x.seat === ctx.seat ? { ...x, xp: (x.xp ?? 0) + e.amount } : x)),
        };
      }
      if (e.kind === 'onDefeatMoveDiscardOrHandToPlayerDiscard') {
        const options = [...player.discard, ...player.hand];
        if (options.length > 0) {
          prompts = [...prompts, {
            id: `we044-${ctx.seat}-${weaponId}-v${s.version}`,
            seat: ctx.seat,
            text: "Custom Pump-Action Shotgun: move 1 card in your Discard Pile or Hand to another Player's Discard Pile.",
            options: [...options, 'Decline'],
            payload: { kind: 'we044ChooseCard', weaponInstanceId: weaponId },
          }];
        }
      }
      if (e.kind === 'onDefeatOptionalGoldTrashAtTurnEnd') {
        prompts = [...prompts, {
          id: `we050-${ctx.seat}-${weaponId}-v${s.version}`,
          seat: ctx.seat,
          text: `Reliable Blade: Gain +${e.amount} Gold? In that case, Trash this Weapon at the end of the turn.`,
          options: ['Yes', 'No'],
          payload: { kind: 'we050Choose', amount: String(e.amount), weaponInstanceId: weaponId },
        }];
      }
    }
  }

  return { state: s, prompts };
}

/** True when the seat's character has the Barry Burton chain ability. */
export function hasBarryChain(abilities: ReadonlyArray<{ readonly kind: string }>): boolean {
  return abilities.some(a => a.kind === 'onDefeatChainLowerHp');
}

/** Downed/dead helper shared with the explore reducer. */
export function isDownedOrDead(player: PlayerState | undefined): boolean {
  return player?.downed === true || player?.dead === true;
}
