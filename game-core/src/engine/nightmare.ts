import type { CardDef, GameState, PlayerState, Prompt } from '../types';
import { characterAbilities, applyHpLoss, applyRicardoDamage } from './abilities';
import { drawWithReshuffle } from './deck';
import { nonEmptyPileIds, gainAmmoX10 } from './mercenaries';

/**
 * Nightmare expansion — engine support for the infected / weapon / item /
 * event effects that are not covered by the base engine.
 *
 * The functions here are called from the explore reducer (reveal / defeat /
 * not-defeated branches) and return a NEW state plus any prompts the effect
 * needs resolved; the caller merges the prompts.
 */

export interface NightmareContext {
  /** The exploring seat. */
  readonly seat: number;
  readonly revealedInstanceId: string;
  readonly revealedDef: CardDef;
  /** Weapon instance ids used in the explore. */
  readonly weapons: readonly string[];
}

export interface NightmareResult {
  readonly state: GameState;
  readonly prompts: readonly Prompt[];
}

/**
 * Reveal-time Nightmare infected effects.
 *
 * MA-061 Militia (Rocket Launcher): the exploring characters each take
 * `base - perInventoryCard * inventory` damage.
 * MA-068 Hunter: the player with the most Decorations lowers each of his
 * characters' maximum Health by `amount` (ties: every tied player).
 */
export function applyNightmareRevealEffects(state: GameState, ctx: NightmareContext): NightmareResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [] };

  let s = state;
  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'onRevealDamageToExploringCharacters': {
        const player = s.seats[ctx.seat];
        if (player === undefined || player.dead) break;
        const amount = Math.max(e.base - e.perInventoryCard * player.inventory.length, 0);
        if (amount <= 0) break;
        const ric = applyRicardoDamage(s, ctx.seat, player.hp, amount);
        s = ric.state;
        const newHp = ric.hp;
        s = { ...s, seats: s.seats.map(x => (x.seat === ctx.seat ? { ...x, hp: newHp } : x)) };
        break;
      }
      case 'mostDecoratedLowersMaxHp': {
        const alive = s.seats.filter(x => !x.dead);
        if (alive.length === 0) break;
        const max = Math.max(...alive.map(x => x.decorations));
        const topSeats = new Set(alive.filter(x => x.decorations === max).map(x => x.seat));
        s = {
          ...s,
          seats: s.seats.map(x => (topSeats.has(x.seat) ? { ...x, maxHp: Math.max(x.maxHp - e.amount, 1) } : x)),
        };
        break;
      }
      default:
        break;
    }
  }
  return { state: s, prompts: [] };
}

/**
 * On-Defeat Nightmare infected effects.
 *
 * MA-055 Bitores Mendez: the exploring player takes an extra turn.
 * MA-057 Jack Krauser: gain the top card from any one resource pile.
 * MA-063 Zombie Security Guard: +gold and +buy this turn.
 * MA-066 Ivy: heal the exploring characters.
 */
export function applyNightmareDefeatEffects(state: GameState, ctx: NightmareContext): NightmareResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [] };
  const player = state.seats[ctx.seat];
  if (player === undefined) return { state, prompts: [] };

  let s = state;
  let prompts: Prompt[] = [];

  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'extraTurnOnDefeat':
        s = { ...s, seats: s.seats.map(x => (x.seat === ctx.seat ? { ...x, extraTurnPending: true } : x)) };
        break;
      case 'onDefeatGainGoldAndBuy':
        s = {
          ...s,
          seats: s.seats.map(x => (x.seat === ctx.seat
            ? { ...x, turnGold: x.turnGold + e.gold, buysLeft: x.buysLeft + e.buys }
            : x)),
        };
        break;
      case 'onDefeatHealExploring': {
        // "heals his characters by 20" — the main Character and, in a
        // partner game, the partner.
        s = {
          ...s,
          seats: s.seats.map(x => {
            if (x.seat !== ctx.seat) return x;
            const healed = Math.min(x.hp + e.amount, x.maxHp);
            const partnerHealed = x.partnerHp !== undefined && x.partnerMaxHp !== undefined
              ? Math.min(x.partnerHp + e.amount, x.partnerMaxHp)
              : x.partnerHp;
            return { ...x, hp: healed, partnerHp: partnerHealed };
          }),
        };
        break;
      }
      case 'onDefeatGainTopResourceCard': {
        const pileIds = nonEmptyPileIds(s);
        if (pileIds.length > 0) {
          prompts = [...prompts, {
            id: `ma057-${ctx.seat}-v${s.version}`,
            seat: ctx.seat,
            text: 'Jack Krauser is Defeated: gain the top card from any one Resource Pile.',
            options: [...pileIds, 'Decline'],
            payload: { kind: 'ma057ChoosePile' },
          }];
        }
        break;
      }
      default:
        break;
    }
  }
  return { state: s, prompts };
}

/**
 * On-Not-Defeated Nightmare infected effects.
 *
 * MA-054 Osmund Saddler: the exploring player gains `base` Ammo x10, then one
 * more for each Level their highest-level Character has; the Infected is
 * shuffled back (the caller handles the shuffle via the outcome flag).
 */
export function applyNightmareNotDefeatedEffects(state: GameState, ctx: NightmareContext): NightmareResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') return { state, prompts: [] };
  const player = state.seats[ctx.seat];
  if (player === undefined) return { state, prompts: [] };

  let s = state;
  for (const e of def.infectedEffects ?? []) {
    if (e.kind === 'onNotDefeatedGainAmmoAndShuffle') {
      const count = e.base + e.perLevel * player.level;
      if (count > 0) s = gainAmmoX10(s, ctx.seat, count);
    }
  }
  return { state: s, prompts: [] };
}

/**
 * Nightmare weapon effects that fire when the weapon is used in an explore.
 *
 * WE-032/033 Silver Ghost / Punisher: +cards and +actions this turn.
 * WE-038 Machine Pistol w/Stock: +gold this turn.
 *
 * Returns the card/action/gold deltas; the caller applies them to the seat
 * that explored (the draw happens there so the RNG stream stays in order).
 */
export function nightmareWeaponGains(weapons: readonly string[], state: GameState): {
  readonly cards: number;
  readonly actions: number;
  readonly gold: number;
} {
  let cards = 0;
  let actions = 0;
  let gold = 0;
  for (const id of weapons) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    for (const e of def?.weaponEffects ?? []) {
      if (e.kind === 'gainCardsAndActions') {
        cards += e.cards;
        actions += e.actions;
      }
      if (e.kind === 'gainGoldThisTurn') {
        gold += e.amount;
      }
    }
  }
  return { cards, actions, gold };
}

/**
 * Nightmare weapon effects that need a choice from another seat.
 *
 * WE-036 Single Shot Rifle w/Scope: choose a player; that player discards a
 * card from their hand.
 * WE-037 Special Ops Rifle: each non-exploring player discards a card.
 *
 * The prompts are addressed to the TARGET seats (faithful to the card), which
 * the online client renders per-seat; pass-and-play only renders the viewing
 * seat's prompts.
 */
export function nightmareWeaponPrompts(state: GameState, seat: number, weapons: readonly string[]): readonly Prompt[] {
  const prompts: Prompt[] = [];
  for (const id of weapons) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    for (const e of def?.weaponEffects ?? []) {
      if (e.kind === 'choosePlayerDiscard') {
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && s.hand.length > 0);
        if (others.length > 0) {
          // The exploring player chooses the target; the target then discards.
          prompts.push({
            id: `we036-target-${seat}-v${state.version}`,
            seat,
            text: 'Single Shot Rifle w/Scope: choose a player. That player discards a card from their hand.',
            options: [...others.map(s => String(s.seat))],
            payload: { kind: 'we036ChoosePlayer', weaponId: id },
          });
        }
      }
      if (e.kind === 'allNonExploringPlayersDiscard') {
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && s.hand.length > 0);
        for (const other of others) {
          prompts.push({
            id: `we037-${other.seat}-v${state.version}`,
            seat: other.seat,
            text: 'Special Ops Rifle: discard a card from your hand.',
            options: [...other.hand],
            payload: { kind: 'we037Discard', fromSeat: String(seat) },
          });
        }
      }
    }
  }
  return prompts;
}

/**
 * AC-038 Mind Control: copy the chosen Action card's bonus icons and effects
 * twice. Bonus icons are applied twice, then the simple non-prompt action
 * effects twice. Prompt-based effects are not copied (documented limitation).
 */
export function applyMindControlCopy(state: GameState, seat: number, def: CardDef | undefined): GameState {
  if (def === undefined) return state;
  const player = state.seats[seat];
  if (player === undefined) return state;
  let s = state;
  let p = player;
  const b = def.bonuses ?? {};
  for (let i = 0; i < 2; i++) {
    if (b.cards) {
      const d = drawWithReshuffle({ deck: p.inventory, discard: p.discard, count: b.cards, rngState: s.rngState });
      p = { ...p, hand: [...p.hand, ...d.hand], inventory: d.deck, discard: d.discard };
      s = { ...s, rngState: d.rngState };
    }
    p = {
      ...p,
      turnGold: p.turnGold + (b.gold ?? 0),
      turnAmmo: p.turnAmmo + (b.ammo ?? 0),
      buysLeft: p.buysLeft + (b.buys ?? 0),
      actionsLeft: p.actionsLeft + (b.actions ?? 0),
      exploresLeft: p.exploresLeft + (b.explores ?? 0),
    };
  }
  for (const e of def.actionEffects ?? []) {
    for (let i = 0; i < 2; i++) {
      if (e.kind === 'gainCards') {
        const d = drawWithReshuffle({ deck: p.inventory, discard: p.discard, count: e.count, rngState: s.rngState });
        p = { ...p, hand: [...p.hand, ...d.hand], inventory: d.deck, discard: d.discard };
        s = { ...s, rngState: d.rngState };
      }
      if (e.kind === 'gainActions') p = { ...p, actionsLeft: p.actionsLeft + e.count };
      if (e.kind === 'gainAmmo') p = { ...p, turnAmmo: p.turnAmmo + e.amount };
      if (e.kind === 'damageCharacter') {
        const ric = applyRicardoDamage(s, seat, p.hp, e.amount);
        s = ric.state;
        p = { ...p, hp: ric.hp };
      }
      if (e.kind === 'discardInventory') p = { ...p, discard: [...p.discard, ...p.inventory], inventory: [] };
    }
  }
  return { ...s, seats: s.seats.map(x => (x.seat === seat ? p : x)) };
}
