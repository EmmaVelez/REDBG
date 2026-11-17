import type { GameState, PlayerState, CardZone } from '../types';
import { abilitiesForLevel } from './characters';
import { drawWithReshuffle } from './deck';
import { makeRng, shuffle } from '../util/rng';
import { hasTrashOnSecondGain } from './locations';

export type GainDestination = 'discard' | 'hand' | 'playArea' | 'topInventory' | 'bottomInventory';

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
  return dest === 'hand' ? 'hand' : dest === 'discard' ? 'discard' : dest === 'playArea' ? 'playArea' : 'inventory';
}

export function gainCard(state: GameState, req: GainCardRequest): GameState {
  const seat = req.seat;
  const player = state.seats[seat] as PlayerState;
  const count = req.instanceId !== undefined ? 1 : (req.count ?? 1);
  const baseDest = req.destination ?? 'discard';
  // AC-021 Gathering Forces: discard-destined gains route to hand this turn.
  const gatheringToHand = player.gainedCardsGoToHand === true;
  // CAC-015 This Shit Ends Now!: Weapons GAINED this turn go into the Play Area.
  const weaponsToPlayArea = player.weaponsGainedGoToPlayArea === true
    && (state.cardDefs[req.cardId]?.type === 'weapon');
  const dest: GainDestination = weaponsToPlayArea
    ? 'playArea'
    : (gatheringToHand && baseDest === 'discard' ? 'hand' : baseDest);

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
  } else if (dest === 'playArea') {
    newPlayer = { ...newPlayer, playArea: [...newPlayer.playArea, ...gainedIds] };
    // CAC-015: the FIRST Weapon routed to the Play Area this way gets +10
    // Damage this turn. Only the first one is tracked.
    if (newPlayer.firstWeaponToPlayAreaInstanceId === undefined) {
      newPlayer = {
        ...newPlayer,
        firstWeaponToPlayAreaInstanceId: gainedIds[0],
        firstWeaponToPlayAreaBonus: 10,
      };
    }
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

  // Fan Locations (Kitchen): "When you gain a 2nd card in one of your turns,
  // you may trash a card in your discard pile." Raise the offer on the 2nd gain.
  if ((newPlayer.gainedThisTurn?.length ?? 0) === 2 && newPlayer.discard.length > 0 && hasTrashOnSecondGain(s, seat)) {
    s = {
      ...s,
      prompts: [...s.prompts, {
        id: `loc-trash-${seat}-v${s.version}`,
        seat,
        text: 'Kitchen: you gained a 2nd card this turn — trash a card from your discard pile?',
        options: [...newPlayer.discard, 'Decline'],
        payload: { kind: 'locTrashSecondGain' },
      }],
    };
  }

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

  // CAC-004 Resupply: the next Item gain this turn goes to Hand instead of
  // the Discard Pile. `dest` is already computed, so re-route here.
  if (player.nextItemToHand === true
    && (s.cardDefs[req.cardId]?.type === 'item')
    && (dest === 'discard' || dest === 'hand')) {
    const ids = [...gainedIds];
    const moved = { ...s.cards };
    for (const id of ids) {
      const inst = moved[id];
      if (inst !== undefined) moved[id] = { ...inst, location: { zone: 'hand', index: 0, seat } };
    }
    s = {
      ...s,
      cards: moved,
      seats: s.seats.map(p => (p.seat === seat
        ? { ...p, nextItemToHand: false, discard: p.discard.filter(id => !ids.includes(id)), hand: [...p.hand, ...ids] }
        : p)),
    };
  }

  // CAC-005 Combat Medic: the FIRST gain of the turn offers a 10 Health heal.
  // The card must be in the player's PLAY AREA (i.e. played this turn).
  if ((newPlayer.gainedThisTurn ?? []).length === 1
    && newPlayer.cac005HealUsedThisTurn !== true
    && newPlayer.playArea.some(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.id === 'cac-005')) {
    const medic = newPlayer.playArea.find(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.id === 'cac-005');
    const amount = (s.cardDefs[s.cards[medic ?? '']?.cardId ?? '']?.actionEffects ?? [])
      .find(e => e.kind === 'healOnFirstGainThisTurn') as { amount: number } | undefined;
    if (medic !== undefined && amount !== undefined) {
      const targets = s.seats.filter(x => !x.dead).map(x => String(x.seat));
      if (targets.length > 0) {
        s = {
          ...s,
          version: s.version + 1,
          prompts: [...s.prompts, {
            id: `cac005-heal-${seat}-v${s.version}`,
            seat,
            text: 'Combat Medic: Heal a Character\'s Health by 10?',
            options: [...targets, 'Decline'],
            payload: { kind: 'cac005HealChoice', amount: String(amount.amount) },
          }],
        };
      }
    }
  }

  // Unofficial Expansion: EX-002 Special Rocket Launcher attaches to the
  // Character as soon as it is gained — bought, drawn, or granted by EX-001.
  // The instance leaves whatever destination it landed in and joins `attached`.
  const attachOnGain = (s.cardDefs[req.cardId]?.weaponEffects ?? []).some(
    e => e.kind === 'attachOnGainDefeatInfectedAtOrAboveHp',
  );
  if (attachOnGain && gainedIds.length > 0) {
    const movedCards = { ...s.cards };
    for (const id of gainedIds) {
      const inst = movedCards[id];
      if (inst !== undefined) {
        movedCards[id] = { ...inst, location: { zone: 'attached', index: 0, seat } };
      }
    }
    s = {
      ...s,
      cards: movedCards,
      seats: s.seats.map(p => (p.seat === seat
        ? {
            ...p,
            hand: p.hand.filter(id => !gainedIds.includes(id)),
            discard: p.discard.filter(id => !gainedIds.includes(id)),
            inventory: p.inventory.filter(id => !gainedIds.includes(id)),
            attached: [...p.attached, ...gainedIds],
          }
        : p)),
    };
  }

  return s;
}
