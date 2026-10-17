import type { GameSetup, GameState, PlayerState, CardDef, CardInstance, CardZone, Prompt } from '../types';
import { makeRng, shuffle, nextInt } from '../util/rng';
import { draw, drawWithReshuffle } from './deck';
import { levelForDecorations, revive, abilitiesForLevel } from './characters';
import { advanceTurn } from './turn';

/**
 * Turn-start character-ability prompts ("At beginning of your turn, may ...").
 * Returns [] when the starting player has no triggerable ability this turn.
 *
 * Krauser L1 (gainKnifeAtTurnStart): may gain 1 Knife weapon. "Gain" (rules
 * glossary) moves a card from the Resource Area to the player's Discard Pile,
 * so each option is the TOP card of a market pile holding a Knife-tagged
 * weapon, plus "Decline". Multiple knife piles -> multiple options (choice
 * resolution across cards).
 */
function turnStartAbilityPrompts(
  state: GameState,
  player: PlayerState,
  newVersion: number
): GameState['prompts'] {
  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  if (charDef === undefined) return [];
  const abilities = abilitiesForLevel(charDef.abilities, player.level);

  const isKnifeTop = (instanceId: string): boolean => {
    const inst = state.cards[instanceId];
    if (inst === undefined) return false;
    const def = state.cardDefs[inst.cardId];
    return def?.type === 'weapon' && (def.weaponTags?.includes('knife') ?? false);
  };

  const prompts: Prompt[] = [];
  const l1Text = charDef.levels?.find(l => l.level === 1)?.text ?? charDef.text;

  if (abilities.some(a => a.kind === 'gainKnifeAtTurnStart')) {
    const options: string[] = [];
    for (const pile of Object.values(state.marketPiles)) {
      const top = pile.cards[0];
      if (top !== undefined && isKnifeTop(top)) {
        options.push(top);
      }
    }
    if (options.length > 0) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: l1Text,
        options: [...options, 'Decline'],
        payload: { kind: 'gainKnifeAtTurnStart' },
      });
    }
  }

  // PR-002 Jill: skip this turn for a super next turn (once per turn; not
  // while a skip reward is already pending).
  if (
    abilities.some(a => a.kind === 'skipTurnForSuperNextTurn') &&
    player.skipRewardPending !== true
  ) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l1Text,
      options: ['Skip my turn', 'Decline'],
      payload: { kind: 'skipTurn' },
    });
  }

  // PR-009 Rebecca L1: another player +1 card; if so, a player +1 card.
  if (abilities.some(a => a.kind === 'giveOneCardToPlayerThenMaybeAnother')) {
    const others = state.seats.filter(s => s.seat !== player.seat && !s.dead);
    if (others.length > 0) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: l1Text,
        options: [...others.map(s => String(s.seat)), 'Decline'],
        payload: { kind: 'giveOneCardToPlayer' },
      });
    }
  }

  // PR-010 Hunk L1: reveal hand; 2+ different card types -> +10 damage this turn.
  if (abilities.some(a => a.kind === 'revealHandForDamageIfTwoTypes') && player.hand.length > 0) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l1Text,
      options: ['Reveal my hand', 'Decline'],
      payload: { kind: 'revealHandTwoTypes' },
    });
  }

  return prompts;
}

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
  // Characters are unique per game (user ruling): each seat gets its own
  // character card. Random picks draw from the remaining pool (no
  // replacement), and explicit picks consume their slot — a duplicate
  // explicit character that another seat already claimed is a setup error.
  const remainingCharacters = [...characterIds];

  const seats: PlayerState[] = setup.players.map((p, i) => {
    let characterCardId = p.characterCardId;
    if (characterCardId === undefined) {
      if (remainingCharacters.length === 0) {
        throw new Error(`not enough unique characters for ${setup.players.length} players`);
      }
      const pick = nextInt(rng, remainingCharacters.length);
      rng = pick.rng;
      characterCardId = remainingCharacters[pick.value] as string;
      remainingCharacters.splice(pick.value, 1);
    } else if (remainingCharacters.includes(characterCardId)) {
      // Explicit pick: remove it from the pool so later random picks cannot
      // collide with it.
      remainingCharacters.splice(remainingCharacters.indexOf(characterCardId), 1);
    } else if (characterIds.includes(characterCardId)) {
      // A known character that an earlier seat already claimed.
      throw new Error(`character ${characterCardId} already assigned to another player`);
    }
    // Unknown explicit id: legacy lenient behavior (default stats), no pool slot.
    characterCardId = characterCardId ?? '';
    const def = defsById.get(characterCardId);
    const maxHp = def?.maxHp ?? 100;
    const characterInstanceId = `${characterCardId}#${i + 1}`;
    register(characterInstanceId, characterCardId, 'hand');

    // Starting deck per the rulebook (First Timer): 7x Ammo x10, 1x Handgun,
    // 2x Combat Knife. The card IDs are NOT hardcoded — they are DERIVED from
    // each card's stats so this works with any database, including the real
    // Premier data (am-001/we-009/we-004) and the short-id test fixtures:
    //   Ammo x10     => ammunition, bonuses { ammo: 10, gold: 10 }
    //   Handgun      => weapon, cost 20, ammoReq 20, damage 10
    //   Combat Knife => weapon, cost 0, ammoReq 0, damage 5
    const ammoDef = cards.find(c => c.type === 'ammunition' && c.bonuses?.ammo === 10 && c.bonuses?.gold === 10);
    const handgunDef = cards.find(c => c.type === 'weapon' && c.cost === 20 && c.ammoReq === 20 && c.damage === 10);
    const knifeDef = cards.find(c => c.type === 'weapon' && c.cost === 0 && c.ammoReq === 0 && c.damage === 5);
    const ammoId = ammoDef?.id ?? '';
    const handgunId = handgunDef?.id ?? '';
    const knifeId = knifeDef?.id ?? '';
    const deckCards: string[] = [];
    if (ammoId !== '') {
      for (let j = 0; j < 7; j++) {
        const id = `${ammoId}#${j + 1}`;
        deckCards.push(id);
        register(id, ammoId, 'hand');
      }
    }
    if (handgunId !== '') {
      deckCards.push(`${handgunId}#1`);
      register(`${handgunId}#1`, handgunId, 'hand');
    }
    if (knifeId !== '') {
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
      // Chris (and any level1At: 0 character) starts with their L1 ability
      // active; everyone else starts at level 0 until their first decoration.
      level: levelForDecorations(def?.level1At, def?.level2At, 0),
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

  // Mansion: infected + token + Yellow Herb (plusMaxHp20 item — id-independent)
  const mansionIds: string[] = [];
  for (const c of cards) {
    if (c.type === 'infected' || c.type === 'token' || (c.type === 'item' && c.itemEffects?.some(e => e.kind === 'plusMaxHp20'))) {
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
  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];

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
      mustExplore: false,
      skipRewardPending: false,
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
    // Wesker L2: the targeted player gets +1 Explore and must Explore this turn
    // (validate blocks endTurn until then; exploring clears the obligation).
    // PR-001 Chris L2: +1 Explore at the beginning of the turn (stacks).
    exploresLeft:
      (player.mustExplore === true ? 2 : 1) +
      (abilitiesForLevel(charDef?.abilities, player.level).some(
        a => a.kind === 'extraExploreAtTurnStart'
      )
        ? 1
        : 0),
    weaponDamageBonusThisTurn: 0,
    playArea: [],
  };

  // PR-002 Jill super turn (designer ruling): the +5 cards are drawn at the
  // beginning of the rewarded turn, on top of its normal 5 — 10 cards, and
  // +1 Buy/Action/Explore on top of the turn's normal 1/1/1.
  let turnPlayer: PlayerState = newPlayer;
  let nextRng = state.rngState;
  if (player.skipRewardPending === true) {
    const d = drawWithReshuffle({
      deck: newPlayer.inventory,
      discard: newPlayer.discard,
      count: 5,
      rngState: state.rngState,
    });
    nextRng = d.rngState;
    turnPlayer = {
      ...newPlayer,
      hand: [...newPlayer.hand, ...d.hand],
      inventory: d.deck,
      discard: d.discard,
      actionsLeft: newPlayer.actionsLeft + 1,
      buysLeft: newPlayer.buysLeft + 1,
      exploresLeft: newPlayer.exploresLeft + 1,
      skipRewardPending: false,
    };
  }

  // "At beginning of your turn, may ..." character abilities prompt here —
  // before anything else can be played (the prompt-immediate gate blocks
  // other actions while it is open).
  const newVersion = state.version + 1;
  const abilityPrompts = turnStartAbilityPrompts(state, turnPlayer, newVersion);

  return {
    ...state,
    version: newVersion,
    rngState: nextRng,
    seats: state.seats.map((s, i) => (i === state.activeSeat ? turnPlayer : s)),
    prompts: abilityPrompts.length > 0 ? [...state.prompts, ...abilityPrompts] : state.prompts,
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