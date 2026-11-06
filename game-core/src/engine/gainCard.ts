import type { GameState, PlayerState, CardZone } from '../types';
import { abilitiesForLevel } from './characters';
import { drawWithReshuffle } from './deck';
import { makeRng, shuffle } from '../util/rng';

export type GainDestination = 'discard' | 'hand' | 'topInventory' | 'bottomInventory';

export type GainReason =
  | 'buy'
  | 'token'
  | 'ability'
  | 'level'
  | 'explore'
  | 'turnStart'
  | 'hook'
  | 'other';

export interface GainCardRequest {
  readonly seat: number;
  readonly cardId: string;
  readonly destination?: GainDestination;
  readonly count?: number;
  readonly reason?: GainReason;
  /** Move an existing card instance (buy, knife gain) instead of creating a
   *  new one. The instance keeps its id; only its location/zone changes. */
  readonly instanceId?: string;
  /** Shuffle the gained card into the Inventory (Kevin Ryman L1) instead of
   *  placing it at a fixed end. Consumes RNG. */
  readonly shuffleIntoInventory?: boolean;
  /** Internal recursion guard for on-gain hooks. */
  readonly hookDepth?: number;
}

function plusOneCardOnGain(abilities: readonly { kind: string }[]): boolean {
  return abilities.some(a => a.kind === 'plusOneCardOnGainCard');
}

function zoneOf(dest: GainDestination): CardZone {
  return dest === 'hand' ? 'hand' : dest === 'discard' ? 'discard' : 'inventory';
}

export function gainCard(state: GameState, req: GainCardRequest): GameState {
  const seat = req.seat;
  const player = state.seats[seat] as PlayerState;
  const count = req.instanceId !== undefined ? 1 : (req.count ?? 1);
  const baseDest = req.destination ?? 'discard';
  // AC-021 Gathering Forces: discard-destined gains route to hand this turn.
  const gatheringToHand = player.gainedCardsGoToHand === true;
  const dest: GainDestination = gatheringToHand && baseDest === 'discard' ? 'hand' : baseDest;

  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  const abilities = charDef !== undefined ? abilitiesForLevel(charDef.abilities, player.level) : [];
  const hookDepth = req.hookDepth ?? 0;

  let s = state;
  let newPlayer = player;
  const newCards = { ...s.cards };
  const gainedIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const gainedId = req.instanceId !== undefined && i === 0
      ? req.instanceId
      : `${req.cardId}#g${s.version}-${seat}-${i}`;
    const zone = zoneOf(dest);
    const index = dest === 'bottomInventory' ? newPlayer.inventory.length : 0;
    newCards[gainedId] = { instanceId: gainedId, cardId: req.cardId, location: { zone, index, seat } };
    gainedIds.push(gainedId);
  }

  if (dest === 'hand') {
    newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...gainedIds] };
  } else if (dest === 'discard') {
    newPlayer = { ...newPlayer, discard: [...newPlayer.discard, ...gainedIds] };
  } else if (req.shuffleIntoInventory === true) {
    newPlayer = { ...newPlayer, inventory: [...newPlayer.inventory, ...gainedIds] };
  } else if (dest === 'topInventory') {
    newPlayer = { ...newPlayer, inventory: [...gainedIds, ...newPlayer.inventory] };
  } else {
    newPlayer = { ...newPlayer, inventory: [...newPlayer.inventory, ...gainedIds] };
  }

  newPlayer = { ...newPlayer, gainedThisTurn: [...(newPlayer.gainedThisTurn ?? []), ...gainedIds] };

  // Kevin Ryman L1: the gained weapon is shuffled into the Inventory.
  let rngState = s.rngState;
  if (req.shuffleIntoInventory === true) {
    const mixed = shuffle(makeRng(rngState), newPlayer.inventory);
    newPlayer = { ...newPlayer, inventory: mixed.value };
    rngState = mixed.rng.s;
  }

  s = {
    ...s,
    rngState,
    cards: newCards,
    seats: s.seats.map(p => (p.seat === seat ? newPlayer : p)),
  };

  // Hook: Leon S. Kennedy (Nightmare) L2 plusOneCardOnGainCard — draw one card.
  // Only base gains trigger it (the hook's own draw never re-triggers), and
  // the depth cap stops a chain of on-gain effects.
  if (hookDepth === 0 && plusOneCardOnGain(abilities) && req.reason !== 'hook') {
    const d = drawWithReshuffle({
      deck: newPlayer.inventory,
      discard: newPlayer.discard,
      count: 1,
      rngState: s.rngState,
    });
    newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
    s = {
      ...s,
      rngState: d.rngState,
      seats: s.seats.map(p => (p.seat === seat ? newPlayer : p)),
    };
  }

  return s;
}
