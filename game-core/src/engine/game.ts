import type { GameSetup, GameState, PlayerState, CardDef, CardInstance, CardZone, Prompt } from '../types';
import { makeRng, shuffle, nextInt } from '../util/rng';
import { draw, drawWithReshuffle } from './deck';
import { levelForDecorations, revive, abilitiesForLevel } from './characters';
import { advanceTurn } from './turn';
import { healAtTurnStart, applyInfectionDecreaseDraws } from './abilities';

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
  const l2Text = charDef.levels?.find(l => l.level === 2)?.text ?? charDef.text;

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

  // HUNK (Outbreak) L1: take 10 Damage at the beginning of the turn for +1 Explore.
  const hunkL1 = abilities.find(a => a.kind === 'turnStartDamageForExplore');
  const hunkAmount = hunkL1?.kind === 'turnStartDamageForExplore' ? hunkL1.amount : 10;
  if (hunkL1 !== undefined) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l1Text,
      options: ['Take 10 Damage for +1 Explore', 'Decline'],
      payload: { kind: 'turnStartDamageForExplore', amount: String(hunkAmount) },
    });
  }

  // Ada Wong (Outbreak) L2: reveal any number of action cards for +1 card each.
  if (abilities.some(a => a.kind === 'turnStartRevealActionsForCards') && player.hand.length > 0) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l2Text,
      options: [...player.hand, 'DONE'],
      payload: { kind: 'turnStartRevealActionsForCards', count: '0' },
    });
  }

  // Rebecca Chambers (Outbreak) L1: discard any number of cards from hand to
  // decrease her Infection Level by 1 per card discarded.
  if (abilities.some(a => a.kind === 'turnStartDiscardForInfection') && player.hand.length > 0) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l1Text,
      options: [...player.hand, 'DONE'],
      payload: { kind: 'rebeccaDiscardForInfection', count: '0' },
    });
  }

  // Luis Sera L1: optional +1 card if discard pile has <= 10 cards.
  if (abilities.some(a => a.kind === 'optionalPlusOneCardWithDiscardCondition')) {
    if (player.discard.length <= 10) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: l1Text,
        options: ['Yes', 'No'],
        payload: { kind: 'luisPlusOneCard' },
      });
    }
  }

  // Wesker (Nightmare) L1: at turn start, if exactly one other player's char has <= threshold HP, may +1 card.
  const weskerL1 = abilities.find(a => a.kind === 'plusOneCardAtTurnStartIfSingleLowHpPlayer') as { hpThreshold: number } | undefined;
  if (weskerL1 !== undefined) {
    const lowHpOthers = state.seats.filter(s => s.seat !== player.seat && !s.dead && s.hp <= weskerL1.hpThreshold);
    if (lowHpOthers.length === 1) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: l1Text,
        options: ['Yes', 'No'],
        payload: { kind: 'weskerPlusOneCard' },
      });
    }
  }

  // Sergei L1: optional self-damage for +10 damage this turn.
  if (abilities.some(a => a.kind === 'optionalSelfDamageForDamageThisTurn')) {
    const ab = abilities.find(a => a.kind === 'optionalSelfDamageForDamageThisTurn')!;
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: l1Text,
      options: [`Take ${ab.damage} damage for +${ab.amount} damage`, 'Decline'],
      payload: { kind: 'sergeiSelfDamage' },
    });
  }

  // Josh Stone L2: at turn start, if at max HP, may move one weapon from discard to hand.
  if (
    abilities.some(a => a.kind === 'weaponFromDiscardToHandAtTurnStartIfMaxHp') &&
    player.hp === player.maxHp
  ) {
    const weaponsInDiscard = player.discard.filter(id => {
      const ci = state.cards[id];
      const cd = ci ? state.cardDefs[ci.cardId] : undefined;
      return cd?.type === 'weapon';
    });
    if (weaponsInDiscard.length > 0) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: l1Text,
        options: [...weaponsInDiscard, 'Decline'],
        payload: { kind: 'recoverWeaponFromDiscardToHand' },
      });
    }
  }

  return prompts;
}

export function setup(setup: GameSetup, cards: ReadonlyArray<CardDef>, piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>, mansionCards?: ReadonlyArray<{ cardId: string; count: number }>): GameState {
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
  // Outbreak mode: infection levels, the Infection Deck and Infected Characters.
  const outbreakMode = setup.outbreakMode === true || setup.scenario === 'outbreak';
  // Characters are unique per game (user ruling): each seat gets its own
  // character card. Random picks draw from the remaining pool (no
  // replacement), and explicit picks consume their slot — a duplicate
  // explicit character that another seat already claimed is a setup error.
  const remainingCharacters = [...characterIds];

  const seats: PlayerState[] = setup.players.map((p, i) => {
    let characterCardId = p.characterCardId || undefined;
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

    // Partner (Alliance): assign a partner character to this seat when
    // partnerMode is on or an explicit partnerCharacterId is provided.
    let partnerInstanceId: string | undefined;
    const wantPartner = setup.partnerMode === true || !!p.partnerCharacterId;
    if (wantPartner) {
      let partnerCardId = p.partnerCharacterId || undefined;
      if (partnerCardId === undefined) {
        if (remainingCharacters.length === 0) {
          throw new Error(`not enough unique characters for partner of seat ${i}`);
        }
        const pick = nextInt(rng, remainingCharacters.length);
        rng = pick.rng;
        partnerCardId = remainingCharacters[pick.value] as string;
        remainingCharacters.splice(pick.value, 1);
      } else if (remainingCharacters.includes(partnerCardId)) {
        remainingCharacters.splice(remainingCharacters.indexOf(partnerCardId), 1);
      } else if (characterIds.includes(partnerCardId)) {
        throw new Error(`character ${partnerCardId} already assigned to another player/partner`);
      }
      partnerCardId = partnerCardId ?? '';
      const partnerInstanceIdStr = `${partnerCardId}#p${i + 1}`;
      partnerInstanceId = partnerInstanceIdStr;
      register(partnerInstanceIdStr, partnerCardId, 'hand');
    }

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
      ...(partnerInstanceId !== undefined ? { partnerInstanceId } : {}),
      hp: maxHp,
      maxHp,
      ...(partnerInstanceId !== undefined ? { partnerHp: (defsById.get(partnerInstanceId!.split('#')[0]!)?.maxHp ?? 100), partnerMaxHp: (defsById.get(partnerInstanceId!.split('#')[0]!)?.maxHp ?? 100) } : {}),
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
      damageMultiplierThisTurn: undefined,
      ...(outbreakMode ? { infectionCards: [] as string[], isInfectedCharacter: false, exploredOrAttackedThisTurn: false } : {}),
    gainedThisTurn: [],
      damagePerAdditionalActionThisTurn: 0,
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
  if (mansionCards !== undefined) {
    for (const mc of mansionCards) {
      const c = defsById.get(mc.cardId);
      if (c === undefined) continue;
      for (let j = 0; j < mc.count; j++) {
        const id = `${c.id}#${j + 1}`;
        mansionIds.push(id);
        register(id, c.id, 'mansionDeck');
      }
    }
  } else {
    for (const c of cards) {
      if (c.type === 'infected' || c.type === 'token' || (c.type === 'item' && c.itemEffects?.some(e => e.kind === 'plusMaxHp'))) {
        for (let j = 0; j < c.copies; j++) {
          const id = `${c.id}#${j + 1}`;
          mansionIds.push(id);
          register(id, c.id, 'mansionDeck');
        }
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

  // Outbreak: the Infection Deck (face down above the Mansion).
  let infectionDeck: readonly string[] = [];
  if (outbreakMode) {
    const infectionIds: string[] = [];
    for (const c of cards) {
      if (c.id.startsWith('in-')) {
        for (let j = 0; j < c.copies; j++) {
          const id = `${c.id}#${j + 1}`;
          infectionIds.push(id);
          register(id, c.id, 'infectionDeck');
        }
      }
    }
    infectionDeck = rngShuffle(infectionIds);
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
    ...(outbreakMode ? { infectionDeck, endInfectedCardId: 'ma-041' } : {}),
  };
}

export function startTurn(state: GameState): GameState {
  if (state.phase !== 'main') {
    return state;
  }

  const player = state.seats[state.activeSeat] as PlayerState;
  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];

  // Outbreak: a Character who died of the Infection reanimates as a random
  // Infected Character (Zombie A/B/C), keeping its Decorations.
  if (player.pendingReanimate === true) {
    const zombieIds = ['ch-031', 'ch-032', 'ch-033'];
    const pick = nextInt(makeRng(state.rngState), zombieIds.length);
    const zombieId = zombieIds[pick.value] ?? 'ch-031';
    const zDef = state.cardDefs[zombieId];
    const zMaxHp = zDef?.maxHp ?? 100;
    const instanceId = `${zombieId}#${player.seat + 1}`;
    const d = drawWithReshuffle({ deck: player.inventory, discard: [], count: 5, rngState: pick.rng.s });
    const newPlayer: PlayerState = {
      ...player,
      characterInstanceId: instanceId,
      hp: zMaxHp,
      maxHp: zMaxHp,
      dead: false,
      downed: false,
      isInfectedCharacter: true,
      pendingReanimate: undefined,
      hand: d.hand,
      inventory: d.deck,
      discard: d.discard,
      playArea: [],
      attached: [],
      infectionCards: [],
      turnAmmo: 0,
      turnGold: 0,
      actionsLeft: 0,
      buysLeft: 0,
      exploresLeft: 1,
      exploredOrAttackedThisTurn: false,
    };
    return {
      ...state,
      rngState: d.rngState,
      cards: {
        ...state.cards,
        [instanceId]: { instanceId, cardId: zombieId, location: { zone: 'hand' as CardZone, index: 0 } },
      },
      seats: state.seats.map(s => (s.seat === player.seat ? newPlayer : s)),
    };
  }

  // AC-030 Returned Favor: at the beginning of your turn, if this card is
  // attached to your character, you get +1 card, then discard this card.
  if (player.attached.some(id => state.cards[id]?.cardId === 'ac-030')) {
    const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 1, rngState: state.rngState });
    const discarded = player.attached.filter(id => state.cards[id]?.cardId === 'ac-030');
    const remaining = player.attached.filter(id => state.cards[id]?.cardId !== 'ac-030');
    return startTurn({
      ...state,
      rngState: d.rngState,
      seats: state.seats.map(s => (s.seat === player.seat
        ? { ...s, attached: remaining, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: [...d.discard, ...discarded] }
        : s)),
    });
  }

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
      damageMultiplierThisTurn: undefined,
    gainedThisTurn: [],
      damagePerAdditionalActionThisTurn: 0,
      mustExplore: false,
      skipRewardPending: false,
      healedFirstTimeThisTurn: false,
      // pendingHerbHeal intentionally preserved: a skipped (downed) turn does
      // not consume the Yellow Herb heal debt.
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

  // Yellow Herb: heal owed from a herb attached on a previous turn applies at
  // the start of this (real) turn. Capped at max HP, then the debt is cleared.
  const herbHeal = player.pendingHerbHeal ?? 0;

  // AC-020 Cornered: if 2+ Cornered attached to partner at turn start, trash them.
  const corneredAttached = (player.partnerAttached ?? []).filter(id => {
    const ci = state.cards[id];
    const cd = ci ? state.cardDefs[ci.cardId] : undefined;
    return cd?.id === 'ac-020';
  });
  let partnerAttached = player.partnerAttached ?? [];
  if (corneredAttached.length >= 2) {
    // remove first two
    let removed = 0;
    partnerAttached = partnerAttached.filter(id => {
        const ci = state.cards[id];
        const cd = ci ? state.cardDefs[ci.cardId] : undefined;
        if (cd?.id === 'ac-020' && removed < 2) { removed++; return false; }
        return true;
      });
    }

    // AC-013 Partners: +1 action if a Partners card is attached to partner at turn start.
    const partnersAttachedAtTurnStart = (player.partnerAttached ?? []).some(id => {
    const ci = state.cards[id];
    const cd = ci ? state.cardDefs[ci.cardId] : undefined;
    return cd?.id === 'ac-013';
  });


  const newPlayer: PlayerState = {
    ...player,
    partnerAttached,
    hp: Math.min(player.hp + herbHeal + healAtTurnStart(abilitiesForLevel(charDef?.abilities, player.level)), player.maxHp),
    pendingHerbHeal: 0,
    turnAmmo: 0,
    turnGold: ((herbHeal > 0 && abilitiesForLevel(charDef?.abilities, player.level).some(a => a.kind === 'goldOnFirstHealThisTurn'))
      ? (abilitiesForLevel(charDef?.abilities, player.level).find(a => a.kind === 'goldOnFirstHealThisTurn') as { amount: number }).amount
      : 0) +
      (abilitiesForLevel(charDef?.abilities, player.level).some(a => a.kind === 'goldAtTurnStart')
        ? (abilitiesForLevel(charDef?.abilities, player.level).find(a => a.kind === 'goldAtTurnStart') as { amount: number }).amount
        : 0),
    healedFirstTimeThisTurn: herbHeal > 0 && abilitiesForLevel(charDef?.abilities, player.level).some(a => a.kind === 'goldOnFirstHealThisTurn'),
    actionsLeft: (() => {
      const base = (player.skipNextTurn || player.noActionsNextTurn) ? 0 : 1 + (partnersAttachedAtTurnStart ? 1 : 0);
      // IN-001 Claw caps the Actions available next turn.
      const capped = player.actionsCapNextTurn !== undefined ? Math.min(base, player.actionsCapNextTurn) : base;
      // Ada Wong (Outbreak CH-027) L1: +1 Action at turn start when Health is
      // at or below the threshold.
      const adaBonus = abilitiesForLevel(charDef?.abilities, player.level)
        .filter(a => a.kind === 'turnStartActionIfHpAtMost' && player.hp <= a.threshold).length;
      return capped + adaBonus;
    })(),
    buysLeft: 1,
    // Wesker L2: the targeted player gets +1 Explore and must Explore this turn
    // (validate blocks endTurn until then; exploring clears the obligation).
    // PR-001 Chris L2: +1 Explore at the beginning of the turn (stacks).
    exploresLeft:
      player.skipNextTurn ? 0 :
      (player.mustExplore === true ? 2 : 1) +
      (abilitiesForLevel(charDef?.abilities, player.level).some(
        a => a.kind === 'extraExploreAtTurnStart'
      )
        ? 1
        : 0),
    weaponDamageBonusThisTurn: 0,
    damageMultiplierThisTurn: undefined,
    ...(player.isInfectedCharacter === true
      ? {
          // Infected Characters (rulebook): 0 Buys, 0 Actions, 1 Explore,
          // no Weapons/Items, cannot change their Infection Level.
          actionsLeft: 0,
          buysLeft: 0,
          exploresLeft: 1,
        }
      : {}),
    exploredOrAttackedThisTurn: false,
    gainedThisTurn: [],
      damagePerAdditionalActionThisTurn: 0,
    desperateForcesTypes: undefined,
    chrisAmmoDiscountTypes: undefined,
    skipNextTurn: undefined,
    noActionsNextTurn: undefined,
    actionsCapNextTurn: undefined,
    cannotAttackSeatNextTurn: undefined,
    playArea: [],
  };

  // PR-002 Jill super turn (designer ruling): the +5 cards are drawn at the
  // beginning of the rewarded turn, on top of its normal 5 — 10 cards, and
  // +1 Buy/Action/Explore on top of the turn's normal 1/1/1.
  let turnPlayer: PlayerState = newPlayer;
  let nextRng = state.rngState;
  if (player.skipRewardPending === true) {
    // Base turn draw (5) if the hand is empty (skip clears it), plus the
    // skip reward bonus draw (5) = up to 10 cards total.
    let baseHand: readonly string[] = newPlayer.hand;
    let baseDeck: readonly string[] = newPlayer.inventory;
    let baseDiscard: readonly string[] = newPlayer.discard;
    let rng = state.rngState;
    if (newPlayer.hand.length === 0) {
      const base = drawWithReshuffle({
        deck: newPlayer.inventory,
        discard: newPlayer.discard,
        count: 5,
        rngState: state.rngState,
      });
      baseHand = base.hand;
      baseDeck = base.deck;
      baseDiscard = base.discard;
      rng = base.rngState;
    }
    const bonus = drawWithReshuffle({
      deck: baseDeck,
      discard: baseDiscard,
      count: 5,
      rngState: rng,
    });
    nextRng = bonus.rngState;
    turnPlayer = {
      ...newPlayer,
      hand: [...baseHand, ...bonus.hand],
      inventory: bonus.deck,
      discard: bonus.discard,
      actionsLeft: newPlayer.actionsLeft + 1,
      buysLeft: newPlayer.buysLeft + 1,
      exploresLeft: newPlayer.exploresLeft + 1,
      skipRewardPending: false,
    };
  }

  // Outbreak turn-start effects.
  // Jill Valentine (CH-025) L1: decrease her Infection Level by 1 (the
  // face-up Infection goes to the bottom of the Infection Deck).
  let turnInfectionDeck = state.infectionDeck ?? [];
  let infectionDecreased = false;
  if (
    turnPlayer.infectionCards !== undefined && turnPlayer.infectionCards.length > 0 &&
    abilitiesForLevel(charDef?.abilities, turnPlayer.level).some(a => a.kind === 'turnStartDecreaseInfection')
  ) {
    const removedInfection = turnPlayer.infectionCards[turnPlayer.infectionCards.length - 1] as string;
    turnPlayer = { ...turnPlayer, infectionCards: turnPlayer.infectionCards.slice(0, -1) };
    turnInfectionDeck = [...turnInfectionDeck, removedInfection];
    infectionDecreased = true;
  }
  // Rebecca Chambers (CH-029) L2: another character's Infection Level
  // decreasing gives her +1 card.
  // Kept separate from state.seats so the final return below preserves the
  // other seats' draws (Rebecca L2 draws for seats other than the active one).
  let turnSeats: readonly PlayerState[] = state.seats;
  if (infectionDecreased) {
    const withDraws = applyInfectionDecreaseDraws(
      { ...state, seats: turnSeats.map((s, i) => (i === state.activeSeat ? turnPlayer : s)) },
      player.seat,
    );
    turnPlayer = withDraws.seats[state.activeSeat] as PlayerState;
    turnSeats = withDraws.seats;
    nextRng = withDraws.rngState;
  }
  // Excella Gionne (CH-021) L2: +3 cards at turn start at Infection Level 8+.
  let excellaDraw = 0;
  for (const a of abilitiesForLevel(charDef?.abilities, turnPlayer.level)) {
    if (a.kind === 'turnStartCardsIfInfectionAtLeast' && (turnPlayer.infectionCards?.length ?? 0) >= a.threshold) {
      excellaDraw += a.amount;
    }
  }
  if (excellaDraw > 0) {
    const d = drawWithReshuffle({ deck: turnPlayer.inventory, discard: turnPlayer.discard, count: excellaDraw, rngState: nextRng });
    turnPlayer = { ...turnPlayer, hand: [...turnPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
    nextRng = d.rngState;
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
    seats: turnSeats.map((s, i) => (i === state.activeSeat ? turnPlayer : s)),
    prompts: abilityPrompts.length > 0 ? [...state.prompts, ...abilityPrompts] : state.prompts,
    ...(state.infectionDeck !== undefined ? { infectionDeck: turnInfectionDeck } : {}),
  };
}

export function checkWin(state: GameState): { gameOver: boolean; winners: readonly number[]; endReason?: 'uroborosDefeated' | 'allPlayersDead' | 'scenarioInfectedDefeated' } {
  // Scenario trigger (Outbreak: Tyrant T-002) - ends the game as soon as that
  // Infected is Defeated and attached to a Character.
  if (state.endInfectedCardId !== undefined) {
    const defeated = state.seats.some(seat =>
      seat.attached.some(instanceId => state.cards[instanceId]?.cardId === state.endInfectedCardId),
    );
    if (defeated) {
      const ranked = state.seats
        .map((seat, i) => ({ index: i, decorations: seat.decorations, hp: seat.hp }))
        .sort((a, b) => b.decorations - a.decorations || b.hp - a.hp);
      const top = ranked[0];
      const winners = (top === undefined ? [] : ranked
        .filter((w) => w.decorations === top.decorations && w.hp === top.hp)
        .map(w => w.index)
        .sort((a, b) => a - b));
      return { gameOver: true, winners, endReason: 'scenarioInfectedDefeated' };
    }
  }
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