import type { GameSetup, GameState, PlayerState, CardDef, CardInstance, CardZone } from '../types';
import { makeRng, shuffle, nextInt } from '../util/rng';
import { draw } from './deck';
import { revive } from './characters';
import { advanceTurn } from './turn';

export function setup(setup: GameSetup, cards: ReadonlyArray<CardDef>, piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>): GameState {
  const defsById = new Map(cards.map(c => [c.id, c]));
  const cardDefs: Record<string, CardDef> = {};
  for (const c of cards) cardDefs[c.id] = c;

  const instances: Record<string, CardInstance> = {};
  const register = (instanceId: string, cardId: string, zone: CardZone, pileId?: string): void => {
    instances[instanceId] = {
      instanceId,
      cardId,
      location: pileId !== undefined && zone === 'marketPile'
        ? { zone, index: 0, pileId }
        : { zone, index: 0 },
    };
  };

  let rng = makeRng(setup.seed);
  const rngShuffle = (items: readonly string[]): readonly string[] => {
    const r = shuffle(rng, items);
    rng = r.rng;
    return r.value;
  };

  const characterIds = cards.filter(c => c.type === 'character').map(c => c.id);

  const seats: PlayerState[] = setup.players.map((p, i) => {
    let characterCardId = p.characterCardId;
    if (characterCardId === undefined && characterIds.length > 0) {
      const pick = nextInt(rng, characterIds.length);
      rng = pick.rng;
      characterCardId = characterIds[pick.value];
    }
    characterCardId = characterCardId ?? '';
    const def = defsById.get(characterCardId);
    const maxHp = def?.maxHp ?? 100;
    const characterInstanceId = `${characterCardId}#${i + 1}`;
    register(characterInstanceId, characterCardId, 'hand');

    const ammoId = 'am-1';
    const handgunId = 'we-1';
    const knifeId = 'we-4';
    const deckCards: string[] = [];
    for (let j = 0; j < 7; j++) {
      const id = `${ammoId}#${j + 1}`;
      deckCards.push(id);
      register(id, ammoId, 'hand');
    }
    if (defsById.has(handgunId)) {
      deckCards.push(`${handgunId}#1`);
      register(`${handgunId}#1`, handgunId, 'hand');
    }
    if (defsById.has(knifeId)) {
      for (let j = 0; j < 2; j++) {
        const id = `${knifeId}#${j + 1}`;
        deckCards.push(id);
        register(id, knifeId, 'hand');
      }
    }

    const inventory = rngShuffle(deckCards);

    return {
      seat: i,
      name: p.name,
      controller: p.controller,
      ...(p.botLevel !== undefined ? { botLevel: p.botLevel } : {}),
      characterInstanceId,
      hp: maxHp,
      maxHp,
      decorations: 0,
      level: 1 as const,
      turnAmmo: 0,
      turnGold: 0,
      actionsLeft: 1,
      buysLeft: 1,
      exploresLeft: 1,
      weaponDamageBonusThisTurn: 0,
      attached: [],
      inventory,
      hand: [],
      discard: [],
      playArea: [],
      downed: false,
      dead: false,
    };
  });

  const drawnHands: PlayerState[] = seats.map(seat => {
    const d = draw({ deck: seat.inventory, discard: [], reshuffledDiscard: [], count: 5 });
    return { ...seat, inventory: d.deck, hand: d.hand };
  });

  // Mansion: infected + token + Yellow Herb (it-3)
  const mansionIds: string[] = [];
  for (const c of cards) {
    if (c.type === 'infected' || c.type === 'token' || (c.type === 'item' && c.id === 'it-3')) {
      for (let j = 0; j < c.copies; j++) {
        const id = `${c.id}#${j + 1}`;
        mansionIds.push(id);
        register(id, c.id, 'mansionDeck');
      }
    }
  }
  const mansionDeck = rngShuffle(mansionIds);

  // Market piles
  const marketPiles: Record<string, { pileId: string; cards: readonly string[] }> = {};
  for (const pileSpec of piles) {
    const ids: string[] = [];
    for (const cardId of pileSpec.cardIds) {
      const def = defsById.get(cardId);
      if (def === undefined) continue;
      for (let j = 0; j < def.copies; j++) {
        const id = `${cardId}#${j + 1}`;
        ids.push(id);
        register(id, cardId, 'marketPile', pileSpec.pileId);
      }
    }
    const shuffled = rngShuffle(ids);
    marketPiles[pileSpec.pileId] = { pileId: pileSpec.pileId, cards: shuffled };
  }

  return {
    version: 1,
    seed: setup.seed,
    rngState: rng.s,
    phase: 'main',
    activeSeat: 0,
    turnNumber: 1,
    seats: drawnHands,
    marketPiles,
    mansionDeck,
    mansionBottom: [],
    removed: [],
    cards: instances,
    cardDefs,
    prompts: [],
    winners: [],
    log: [],
  };
}

export function startTurn(state: GameState): GameState {
  if (state.phase !== 'main') {
    return state;
  }

  const player = state.seats[state.activeSeat] as PlayerState;

  if (player.downed) {
    const ch = revive({
      hp: player.hp,
      maxHp: player.maxHp,
      decorations: player.decorations,
      level: player.level,
      downed: player.downed,
      dead: player.dead,
      hand: player.hand,
      discard: player.discard,
      inventory: player.inventory,
    });

    const d = draw({ deck: ch.inventory, discard: ch.discard, reshuffledDiscard: [], count: 5 });

    const newPlayer: PlayerState = {
      ...player,
      hp: ch.hp,
      maxHp: ch.maxHp,
      downed: ch.downed,
      dead: ch.dead,
      hand: d.hand,
      inventory: d.deck,
      discard: d.discard,
      playArea: [],
      turnAmmo: 0,
      turnGold: 0,
      actionsLeft: 1,
      buysLeft: 1,
      exploresLeft: 1,
      weaponDamageBonusThisTurn: 0,
    };

    const aliveSeats = state.seats.map((s, i) => (s.dead ? -1 : i)).filter(i => i >= 0);
    const ctx = advanceTurn({
      seatCount: state.seats.length,
      activeSeat: state.activeSeat,
      turnNumber: state.turnNumber,
      aliveSeats,
    });

    return {
      ...state,
      version: state.version + 1,
      seats: state.seats.map((s, i) => (i === state.activeSeat ? newPlayer : s)),
      activeSeat: ctx.activeSeat,
      turnNumber: ctx.turnNumber,
    };
  }

  const newPlayer: PlayerState = {
    ...player,
    turnAmmo: 0,
    turnGold: 0,
    actionsLeft: 1,
    buysLeft: 1,
    exploresLeft: 1,
    weaponDamageBonusThisTurn: 0,
    playArea: [],
  };

  return {
    ...state,
    version: state.version + 1,
    seats: state.seats.map((s, i) => (i === state.activeSeat ? newPlayer : s)),
  };
}

export function checkWin(state: GameState): { gameOver: boolean; winners: readonly number[]; endReason?: 'uroborosDefeated' | 'allPlayersDead' } {
  const uroborosDefeated = state.seats.some(seat =>
    seat.attached.some(instanceId => {
      const inst = state.cards[instanceId];
      if (inst === undefined) return false;
      const cardDef = state.cardDefs[inst.cardId];
      return cardDef?.infectedEffects?.some(effect => effect.kind === 'shuffleBackIfNotDefeated') ?? false;
    }),
  );

  if (uroborosDefeated) {
    const ranked = state.seats
      .map((seat, i) => ({ index: i, decorations: seat.decorations, hp: seat.hp }))
      .sort((a, b) => b.decorations - a.decorations || b.hp - a.hp);
    const top = ranked[0];
    const winners = (top === undefined ? [] : ranked
      .filter((w) => w.decorations === top.decorations && w.hp === top.hp)
      .map(w => w.index)
      .sort((a, b) => a - b));

    return { gameOver: true, winners, endReason: 'uroborosDefeated' };
  }

  if (state.seats.every(seat => seat.dead)) {
    return { gameOver: true, winners: [], endReason: 'allPlayersDead' };
  }

  return { gameOver: false, winners: [] };
}