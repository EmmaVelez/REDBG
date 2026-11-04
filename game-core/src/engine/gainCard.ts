import type { GameState, PlayerState, CardZone } from '../types';
import { abilitiesForLevel } from './characters';
import { draw } from './deck';

export type GainDestination = 'discard' | 'hand' | 'topInventory' | 'bottomInventory';

export interface GainCardRequest {
  readonly seat: number;
  readonly cardId: string;
  readonly destination?: GainDestination;
  readonly count?: number;
  readonly reason?: string;
  readonly hookDepth?: number;
}

function plusOneCardOnGain(abilities: readonly { kind: string }[]): boolean {
  return abilities.some(a => a.kind === 'plusOneCardOnGainCard');
}

export function gainCard(state: GameState, req: GainCardRequest): GameState {
  const seat = req.seat;
  const player = state.seats[seat] as PlayerState;
  const count = req.count ?? 1;
  const baseDest = req.destination ?? 'discard';
  // Gathering Forces: gained cards go to hand this turn.
  const gatheringToHand = (player as any).gainedCardsGoToHand === true;
  const dest: GainDestination = gatheringToHand && baseDest === 'discard' ? 'hand' : baseDest;

  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  const abilities = charDef !== undefined ? abilitiesForLevel(charDef.abilities, player.level) : [];
  const hookDepth = req.hookDepth ?? 0;

  let s = state;
  let newPlayer = player;
  const newCards = { ...s.cards };

  for (let i = 0; i < count; i++) {
    const gainedId = `${req.cardId}#g${s.version}-${seat}-${i}`;
    const loc: { zone: CardZone; index: number; seat: number } =
      dest === 'hand' ? { zone: 'hand', index: 0, seat } :
      dest === 'topInventory' ? { zone: 'inventory', index: 0, seat } :
      dest === 'bottomInventory' ? { zone: 'inventory', index: 9999, seat } :
      { zone: 'discard', index: 0, seat };
    newCards[gainedId] = { instanceId: gainedId, cardId: req.cardId, location: loc };
    if (dest === 'hand') newPlayer = { ...newPlayer, hand: [...newPlayer.hand, gainedId] };
    else if (dest === 'discard') newPlayer = { ...newPlayer, discard: [...newPlayer.discard, gainedId] };
    else if (dest === 'topInventory') newPlayer = { ...newPlayer, inventory: [gainedId, ...newPlayer.inventory] };
    else newPlayer = { ...newPlayer, inventory: [...newPlayer.inventory, gainedId] };
  }

  s = {
    ...s,
    cards: newCards,
    seats: s.seats.map(p => (p.seat === seat ? newPlayer : p)),
  };

  // Hook: Leon L2 plusOneCardOnGainCard — draw one card to hand.
  if (hookDepth === 0 && plusOneCardOnGain(abilities) && req.reason !== 'hook') {
    const r = draw({ deck: newPlayer.inventory, discard: newPlayer.discard, reshuffledDiscard: [], count: 1 });
    newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...r.hand], inventory: r.deck, discard: r.discard };
    s = { ...s, seats: s.seats.map(p => (p.seat === seat ? newPlayer : p)) };
  }

  return s;
}
