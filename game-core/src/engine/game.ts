import type { GameSetup, GameState, PlayerState, CardDef, CardInstance, CardZone, Prompt, SkillDraftState } from '../types';
import { makeRng, shuffle, nextInt } from '../util/rng';
import { draw, drawWithReshuffle } from './deck';
import { levelForDecorations, revive, abilitiesForLevel, flipDown, canBePartner } from './characters';
import { dropEmptyPrompts } from './prompts';
import { advanceTurn } from './turn';
import { healAtTurnStart, applyInfectionDecreaseDraws, plusBuyBonus, seatAbilities, partnerAbilities } from './abilities';

import { skillCardDefs, draftPrompt, turnStartSkillEffects, turnStartSkillPrompts } from './skill';
import { poisonDamageAtTurnStart, returnCountersToSupply } from './counters';

/** Check if any active mansion attachment has the given effect kind. */
export function hasMansionAttachmentEffect(state: GameState, kind: string): boolean {
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects?.some(e => e.kind === kind)) return true;
  }
  return false;
}

/** Sum heal and ammo bonuses from mansion attachments for turn start. */
function mansionAttachmentTurnStartBonuses(state: GameState): { heal: number; ammo: number } {
  let heal = 0;
  let ammo = 0;
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'healAndAmmoAtTurnStart') {
        heal += effect.heal;
        ammo += effect.ammo;
      }
    }
  }
  return { heal, ammo };
}

/** Check if any active mansion attachment has freePistolTrashAtEnd effect. */
export function hasFreePistolTrashAtEnd(state: GameState): boolean {
  return hasMansionAttachmentEffect(state, 'freePistolTrashAtEnd');
}

/** Get the total ammo bonus reduction from mansion attachments. */
export function mansionAmmoBonusReduction(state: GameState): number {
  let reduction = 0;
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'reduceAmmoBonus') {
        reduction += effect.amount;
      }
    }
  }
  return reduction;
}

/** Get the Infected Horde bonus: +N explores and must-explore-or-damage penalty. */
export function infectedHordeBonus(state: GameState): { explores: number; damage: number } {
  let explores = 0;
  let damage = 0;
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'plusExploreAndMustExploreOrDamage') {
        explores += effect.explores;
        damage += effect.damage;
      }
    }
  }
  return { explores, damage };
}

/**
 * Get Rebecca Chambers L2 gold bonus for discarding due to card effect.
 * Returns the gold amount if the seat has the ability, 0 otherwise.
 */
export function rebeccaDiscardGoldBonus(state: GameState, seat: number): number {
  const player = state.seats[seat];
  if (player === undefined) return 0;
  const charInst = state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  if (charDef === undefined) return 0;
  const level = player.level;
  const hasAbility = (charDef.abilities ?? []).some(
    a => a.kind === 'goldWhenDiscardingAtTurnStart' && a.level <= level
  );
  if (!hasAbility) return 0;
  const ability = (charDef.abilities ?? []).find(
    a => a.kind === 'goldWhenDiscardingAtTurnStart' && a.level <= level
  ) as { amount: number } | undefined;
  return ability?.amount ?? 0;
}

/** Get the Final Action cap: max actions per turn, and attachment IDs to remove on downed. */
export function finalActionBonus(state: GameState): { actionsCap: number; attachmentIds: string[] } {
  let actionsCap = 0;
  const attachmentIds: string[] = [];
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'actionsCapAndRemoveOnDowned') {
        actionsCap = Math.max(actionsCap, effect.actions);
        attachmentIds.push(attId);
      }
    }
  }
  return { actionsCap, attachmentIds };
}

/** Get Virus Mutates bonuses: HP bonus for low-HP infected, and XP bonus per explore. */
export function virusMutatesBonus(state: GameState): { hpThreshold: number; hpBonus: number; xpBonus: number } {
  let hpThreshold = 0;
  let hpBonus = 0;
  let xpBonus = 0;
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'plusHpForLowHpInfected') {
        hpThreshold = Math.max(hpThreshold, effect.hpThreshold);
        hpBonus += effect.bonus;
      } else if (effect.kind === 'bonusXpPerExplore') {
        xpBonus += effect.amount;
      }
    }
  }
  return { hpThreshold, hpBonus, xpBonus };
}

/** Check if any active mansion attachment allows shotgun weapons to be used twice. */
export function hasShotgunTwicePerTurn(state: GameState): boolean {
  return hasMansionAttachmentEffect(state, 'shotgunTwicePerTurn');
}

/** Get The Maze damage penalty: if play area has >N actions, weapons get -penalty damage. */
export function mazeDamagePenalty(state: GameState, actionCountInPlayArea: number): number {
  for (const attId of state.mansionAttachments ?? []) {
    const inst = state.cards[attId];
    if (!inst) continue;
    const def = state.cardDefs[inst.cardId];
    if (def?.attachmentEffects === undefined) continue;
    for (const effect of def.attachmentEffects) {
      if (effect.kind === 'damagePenaltyForMultipleActions' && actionCountInPlayArea > effect.actions) {
        return effect.penalty;
      }
    }
  }
  return 0;
}

/** Check if any active mansion attachment has Survival Horror die roll effect. */
export function hasSurvivalHorror(state: GameState): boolean {
  return hasMansionAttachmentEffect(state, 'survivalHorrorDieRoll');
}

/** Check if any active mansion attachment has Short Supplys heal prevention effect. */
export function hasShortSupplys(state: GameState): boolean {
  return hasMansionAttachmentEffect(state, 'shortSupplysHealPrevention');
}

/**
 * Apply Short Supplys healing prevention: prevent half the healing (rounded down),
 * return the actual heal amount and the bonus damage amount.
 */
export function applyShortSupplysHeal(healAmount: number): { actualHeal: number; bonusDamage: number } {
  const prevented = Math.floor(healAmount / 2);
  const actualHeal = healAmount - prevented;
  return { actualHeal, bonusDamage: actualHeal };
}

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
  const partnerInst = player.partnerInstanceId !== undefined ? state.cards[player.partnerInstanceId] : undefined;
  const partnerDef = partnerInst === undefined ? undefined : state.cardDefs[partnerInst.cardId];
  if (charDef === undefined && partnerDef === undefined) return [];
  // Alliance Partner Modification: the Partner's turn-start abilities are the
  // player's too.
  const abilities = seatAbilities(state, player.seat);
  /** Level text for a turn-start ability, from whichever character owns it. */
  const abilityText = (kind: string): string => {
    for (const def of [charDef, partnerDef]) {
      if (def === undefined) continue;
      const entry = (def.levels ?? []).find(l => (def.abilities ?? []).some(a => a.kind === kind && a.level <= l.level));
      if (entry !== undefined) return entry.text;
    }
    return charDef?.text ?? partnerDef?.text ?? '';
  };

  const isKnifeTop = (instanceId: string): boolean => {
    const inst = state.cards[instanceId];
    if (inst === undefined) return false;
    const def = state.cardDefs[inst.cardId];
    return def?.type === 'weapon' && (def.weaponTags?.includes('knife') ?? false);
  };

  const prompts: Prompt[] = [];

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
        text: abilityText('gainKnifeAtTurnStart'),
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
      text: abilityText('skipTurnForSuperNextTurn'),
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
        text: abilityText('giveOneCardToPlayerThenMaybeAnother'),
        options: [...others.map(s => String(s.seat)), 'Decline'],
        payload: { kind: 'giveOneCardToPlayer' },
      });
    }
  }

  // RC-001 Rebecca Chambers L1: at turn start, may get +1 card and discard a card.
  if (abilities.some(a => a.kind === 'turnStartDrawThenDiscardCard')) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('turnStartDrawThenDiscardCard'),
      options: ['Draw +1 card', 'Decline'],
      payload: { kind: 'rebeccaDrawDiscard' },
    });
  }

  // PR-010 Hunk L1: reveal hand; 2+ different card types -> +10 damage this turn.
  if (abilities.some(a => a.kind === 'revealHandForDamageIfTwoTypes') && player.hand.length > 0) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('revealHandForDamageIfTwoTypes'),
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
      text: abilityText('turnStartDamageForExplore'),
      options: ['Take 10 Damage for +1 Explore', 'Decline'],
      payload: { kind: 'turnStartDamageForExplore', amount: String(hunkAmount) },
    });
  }

  // Ada Wong (Outbreak) L2: reveal any number of action cards for +1 card each.
  if (abilities.some(a => a.kind === 'turnStartRevealActionsForCards') && player.hand.length > 0) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('turnStartRevealActionsForCards'),
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
      text: abilityText('rebeccaDiscardForInfection'),
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
        text: abilityText('luisPlusOneCard'),
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
        text: abilityText('weskerPlusOneCard'),
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
      text: abilityText('sergeiSelfDamage'),
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
        text: abilityText('recoverWeaponFromDiscardToHand'),
        options: [...weaponsInDiscard, 'Decline'],
        payload: { kind: 'recoverWeaponFromDiscardToHand' },
      });
    }
  }

  // CH-033 Zombie C: at the beginning of your turn, may move one infection card
  // from hand to the bottom of the Infection Deck, then take the top card of
  // the Infection Deck into hand.
  if (abilities.some(a => a.kind === 'zombieCTurnStartInfectionSwap')) {
    const infectionInHand = player.hand.filter(id => state.cards[id]?.cardId.startsWith('in-'));
    if (infectionInHand.length > 0 && (state.infectionDeck?.length ?? 0) > 0) {
      prompts.push({
        id: `ability-${player.seat}-v${newVersion}`,
        seat: player.seat,
        text: abilityText('zombieCTurnStartInfectionSwap'),
        options: [...infectionInHand, 'Decline'],
        payload: { kind: 'zombieCTurnStartInfectionSwap' },
      });
    }
  }

  // CH-046 Claire Redfield (Mercenaries) L1: at turn start, may get -1 Buy for
  // -amount Ammo Requirement on all weapons this turn.
  const claireBuy = abilities.find(a => a.kind === 'turnStartBuyForAmmoDiscount');
  if (claireBuy !== undefined && claireBuy.kind === 'turnStartBuyForAmmoDiscount') {
    prompts.push({
      id: `claire-buy-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('claireBuyForAmmo'),
      options: ['Yes', 'No'],
      payload: { kind: 'claireBuyForAmmo', amount: String(claireBuy.amount) },
    });
  }

  // CR-001 Claire Redfield L2 (SPECIALIST): at turn start, may get
  // +actions Actions and -buy Buy.
  const specialist = abilities.find(a => a.kind === 'turnStartActionsForBuy');
  if (specialist !== undefined && specialist.kind === 'turnStartActionsForBuy') {
    prompts.push({
      id: `specialist-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('specialistActionsForBuy'),
      options: ['Yes', 'No'],
      payload: { kind: 'specialistActionsForBuy', actions: String(specialist.actions), buy: String(specialist.buy) },
    });
  }

  // RC-001 Rebecca Chambers L1: at turn start, may draw 1 card then discard 1.
  if (abilities.some(a => a.kind === 'turnStartDrawThenDiscardCard')) {
    prompts.push({
      id: `ability-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: 'At the beginning of your turn, you can get +1 card, and if you do, discard a card.',
      options: ['Draw & Discard', 'Pass'],
      payload: { kind: 'rebeccaTurnStartDrawAndDiscard' },
    });
  }

  // CH-000 Rachael Foley L1: at turn start, may get +1 Explore — and if she
  // does, she must Explore at least twice this turn.
  if (abilities.some(a => a.kind === 'turnStartPlusExploreRequiresTwoExplores')) {
    prompts.push({
      // Distinct id: several turn-start abilities share the generic
      // `ability-<seat>-v<version>` id, and two prompts with the same id would
      // collide (chooseOption removes EVERY prompt with that id).
      id: `rachael-explore-${player.seat}-v${newVersion}`,
      seat: player.seat,
      text: abilityText('turnStartPlusExploreRequiresTwoExplores'),
      options: ['Gain +1 Explore', 'Decline'],
      payload: { kind: 'turnStartPlusExploreRequiresTwoExplores' },
    });
  }

  return prompts;
}

export function setup(setup: GameSetup, cards: ReadonlyArray<CardDef>, piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>, mansionCards?: ReadonlyArray<{ cardId: string; count: number }>, winInfectedCardId?: string): GameState {
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
      // A character that cannot receive attachments (Chris L1) can only ever
      // be a Main character — never a Partner.
      if (partnerCardId !== undefined && !canBePartner(defsById.get(partnerCardId))) {
        throw new Error(`character ${partnerCardId} cannot be a partner`);
      }
      if (partnerCardId === undefined) {
        // Random partners draw from the pool minus main-only characters.
        const partnerPool = remainingCharacters.filter(id => canBePartner(defsById.get(id)));
        if (partnerPool.length === 0) {
          throw new Error(`not enough unique characters for partner of seat ${i}`);
        }
        const pick = nextInt(rng, partnerPool.length);
        rng = pick.rng;
        partnerCardId = partnerPool[pick.value] as string;
        remainingCharacters.splice(remainingCharacters.indexOf(partnerCardId), 1);
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
    // Instance ids must be unique across SEATS, not just within one seat.
    // Every player is dealt the same 10-card starter, so an id like
    // `am-001#1` would otherwise name four different physical cards and
    // `state.cards` could only hold one of them — breaking conservation
    // audits and any effect that targets an instanceId. The `s{i}`
    // segment is the seat number; `cardDef` only reads before the '#'.
    const deckCards: string[] = [];
    const deckId = (cardId: string, n: number): string => `${cardId}#s${i + 1}_${n}`;
    if (ammoId !== '') {
      for (let j = 0; j < 7; j++) {
        const id = deckId(ammoId, j + 1);
        deckCards.push(id);
        register(id, ammoId, 'hand');
      }
    }
    if (handgunId !== '') {
      const id = deckId(handgunId, 1);
      deckCards.push(id);
      register(id, handgunId, 'hand');
    }
    if (knifeId !== '') {
      for (let j = 0; j < 2; j++) {
        const id = deckId(knifeId, j + 1);
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
  const isMansionCard = (c: CardDef): boolean =>
    c.type === 'infected' || c.type === 'token' || (c.type === 'item' && (c.itemEffects?.some(e => e.kind === 'plusMaxHp') ?? false));
  // Custom card line (MX-001..): present in `cards` only when the room
  // enabled it, and always appended to the Mansion (custom cards are
  // mansion-only — they are never dealt into the market).
  // Custom EVENT cards (ev-001 Zombie Grab) live in the Mansion too, even though
  // isMansionCard() only covers the official set's card types.
  const isCustomMansionCard = (c: CardDef): boolean =>
    c.set === 'custom' && (c.mansion === true || isMansionCard(c) || c.type === 'event');
  const customMansion = cards.filter(isCustomMansionCard);
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
      if (c.set === 'custom') continue;
      if (!isMansionCard(c)) continue;
      for (let j = 0; j < c.copies; j++) {
        const id = `${c.id}#${j + 1}`;
        mansionIds.push(id);
        register(id, c.id, 'mansionDeck');
      }
    }
  }
  for (const c of customMansion) {
    for (let j = 0; j < c.copies; j++) {
      const id = `${c.id}#${j + 1}`;
      mansionIds.push(id);
      register(id, c.id, 'mansionDeck');
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
        // The same card may legitimately be listed by more than one pile
        // (a themed pile plus a combined pile, or two scenarios merged into
        // one super-scenario). Each pile needs its OWN physical copies:
        // reusing the id would place a single instance in two piles at
        // once, and buying from either pile would move the same card.
        const plain = `${cardId}#${j + 1}`;
        const owner = instances[plain];
        const id = owner !== undefined && owner.location.zone === 'marketPile' && owner.location.pileId !== pileSpec.pileId
          ? `${cardId}#${pileSpec.pileId}-${j + 1}`
          : plain;
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

  // Mercenaries Skill System: build the 30-card Skill deck (one copy each),
  // shuffle it, and deal 5 cards to each seat. The pass-left draft then runs
  // as a sequence of chooseOption prompts (see engine/skill.ts).
  const skillDefs = setup.skillSystem === true ? skillCardDefs(cards) : [];
  const skillIds: string[] = [];
  for (const def of skillDefs) {
    for (let j = 0; j < def.copies; j++) {
      const id = `${def.id}#${j + 1}`;
      skillIds.push(id);
      register(id, def.id, 'skillArea');
    }
  }
  const shuffledSkills: readonly string[] = skillIds.length > 0 ? rngShuffle(skillIds) : [];

  // Unofficial Expansion: the shared counter supply (EX-009 Poison). Counter
  // cards are never in the market or the Mansion — they live here until an
  // Infected effect attaches one to a Character, and return here when that
  // Character dies ("return this card to the Resource Area").
  const counterDefs = cards.filter(c => c.type === 'counter');
  const supplyIds: string[] = [];
  for (const def of counterDefs) {
    for (let j = 0; j < def.copies; j++) {
      const id = `${def.id}#${j + 1}`;
      supplyIds.push(id);
      register(id, def.id, 'supply');
    }
  }

  const baseState: GameState = {
    version: 1,
    seed: setup.seed,
    rngState: rng.s,
    phase: 'main',
    activeSeat: 0,
    turnNumber: 1,
    seats: drawnHands,
    marketPiles,
    mansionDeck,
    removed: [],
    cards: instances,
    cardDefs,
    prompts: [],
    winners: [],
    log: [],
    ...(outbreakMode ? { infectionDeck, endInfectedCardId: 'ma-041' } : {}),
    ...(winInfectedCardId !== undefined ? { endInfectedCardId: winInfectedCardId } : {}),
    supply: supplyIds,
    mansionAttachments: [],
    attachmentTrashCounts: {},
  };

  // Turn 1 has to go through startTurn just like every later turn: it is what
  // applies the turn-start pools (CR-001's +1 Buy, Carlos's Gold, Ada's
  // +1 Action, Wesker's forced Explore, skill ammo/gold) and fires the
  // beginning-of-turn ability prompts. Without it the opening turn ran on the
  // raw setup pools and silently ignored all of those.
  if (setup.skillSystem !== true) {
    return startTurn(baseState);
  }

  // Safety net: the Skill System is a Game Modification that needs its own
  // cards. If the caller did not include them the draft would deal empty hands
  // and the game would deadlock in the skillDraft phase with nothing to answer.
  if (skillIds.length === 0) {
    return baseState;
  }

  const seatCount = drawnHands.length;
  const hands = {} as Record<number, string[]>;
  let offset = 0;
  for (let s = 0; s < seatCount; s++) {
    hands[s] = shuffledSkills.slice(offset, offset + 5);
    offset += 5;
  }
  const emptyRecords = (): Record<number, string[]> =>
    Object.fromEntries(Array.from({ length: seatCount }, (_, i) => [i, []]));
  const draft: SkillDraftState = {
    deck: shuffledSkills.slice(offset),
    hands,
    kept: emptyRecords(),
    pendingPass: emptyRecords(),
    round: 0,
    pickSeat: 0,
    step: 'pick',
    keepSeat: 0,
    keepPicks: 0,
    final: emptyRecords(),
    // Partner Modification: 1 Skill per Character, so 2 kept instead of 3.
    keepTarget: setup.partnerMode === true ? 2 : 3,
  };
  const draftState: GameState = {
    ...baseState,
    phase: 'skillDraft',
    skillSystem: true,
    skillDeck: draft.deck,
    skillDraft: draft,
  };
  const prompt = draftPrompt(draftState);
  return prompt === undefined ? draftState : { ...draftState, prompts: [prompt] };
}

/**
 * Turns are produced here, so this is the second prompt choke point (with
 * applyAction): turn-start builders add prompts too, and an empty option
 * list would deadlock the seat behind the prompt gate.
 */
export function startTurn(state: GameState): GameState {
  return dropEmptyPrompts(startTurnInternal(state));
}

function startTurnInternal(state: GameState): GameState {
  if (state.phase !== 'main') {
    return state;
  }

  // EV-002 Nemesis Pursuit's infected buff lasts "this turn" only — a new turn
  // clears it.
  if (state.infectedBuffThisTurn !== undefined) {
    state = { ...state, infectedBuffThisTurn: undefined };
  }

  // Unofficial Expansion: EX-009 Poison deals its damage at the beginning of
  // the attached Character's turn, before anything else. Reaching 0 Health
  // downs the Character, which skips the rest of this turn; it revives (at
  // -20 max Health) at the start of its NEXT turn via the normal downed path.
  let player = state.seats[state.activeSeat] as PlayerState;
  const poison = poisonDamageAtTurnStart(state, player);
  if (poison > 0 && !player.downed && !player.dead) {
    const newHp = player.hp - poison;
    if (newHp <= 0) {
      let poisonRng = state.rngState;
      const flipResult = flipDown(
        {
          hp: player.hp,
          maxHp: player.maxHp,
          decorations: player.decorations,
          level: player.level,
          downed: player.downed,
          dead: player.dead,
          hand: player.hand,
          discard: player.discard,
          inventory: player.inventory,
        },
        (items) => {
          const r = shuffle(makeRng(poisonRng), items);
          poisonRng = r.rng.s;
          return r.value;
        },
      );
      const downedState: GameState = {
        ...state,
        rngState: poisonRng,
        seats: state.seats.map(x => (x.seat === player.seat
          ? { ...player, hp: 0, downed: flipResult.downed, hand: flipResult.hand, discard: flipResult.discard, inventory: flipResult.inventory }
          : x)),
      };
      // The Character is face down: its turn ends here (no revive yet).
      const aliveSeats = downedState.seats.map((s, i) => (s.dead ? -1 : i)).filter(i => i >= 0);
      const ctx = advanceTurn({
        seatCount: downedState.seats.length,
        activeSeat: downedState.activeSeat,
        turnNumber: downedState.turnNumber,
        aliveSeats,
      });
      return {
        ...downedState,
        version: downedState.version + 1,
        activeSeat: ctx.activeSeat,
        turnNumber: ctx.turnNumber,
      };
    }
    if (newHp !== player.hp) {
      state = {
        ...state,
        seats: state.seats.map(x => (x.seat === player.seat ? { ...x, hp: newHp } : x)),
      };
      player = state.seats[state.activeSeat] as PlayerState;
    }
  }

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
    // Rulebook: "Remove your Character card from the Game, along with all
    // non-Infected cards that were attached to that Character." Infected
    // attachments stay attached to the reanimated Character (and keep their
    // Decorations); the rest leave the game.
    const attachedInfected = player.attached.filter(id => state.cardDefs[state.cards[id]?.cardId ?? '']?.type === 'infected');
    const attachedRemoved = player.attached.filter(id => state.cardDefs[state.cards[id]?.cardId ?? '']?.type !== 'infected');
    const newPlayer: PlayerState = {
      ...player,
      characterInstanceId: instanceId,
      hp: zMaxHp,
      maxHp: zMaxHp,
      // Infected Characters derive their level from Decorations like any other
      // Character (Zombie A/B/C gate at 0, so they always have their ability).
      level: levelForDecorations(zDef?.level1At, zDef?.level2At, player.decorations),
      dead: false,
      downed: false,
      isInfectedCharacter: true,
      pendingReanimate: undefined,
      hand: d.hand,
      inventory: d.deck,
      discard: d.discard,
      playArea: [],
      attached: attachedInfected,
      infectionCards: [],
      turnAmmo: 0,
      turnGold: 0,
      actionsLeft: 0,
      buysLeft: 0,
      exploresLeft: 1,
      exploredOrAttackedThisTurn: false,
      gainedCardsGoToHand: false,
    };
    return {
      ...state,
      rngState: d.rngState,
      cards: {
        ...state.cards,
        [instanceId]: { instanceId, cardId: zombieId, location: { zone: 'hand' as CardZone, index: 0 } },
      },
      seats: state.seats.map(s => (s.seat === player.seat ? newPlayer : s)),
      removed: [...state.removed, ...attachedRemoved],
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

    // A downed character should hold no cards (flipDown merged hand + discard
    // into the inventory), but an effect may still have given them some. Fold
    // any stray hand back into the discard BEFORE redrawing — otherwise the
    // `hand: d.hand` assignment below silently destroys those cards.
    // The draw must also reshuffle (rulebook: draw 5, reshuffling the discard
    // into the inventory when it runs short) — a plain `draw` left a downed
    // character with fewer than 5 cards whenever the inventory was low.
    const d = drawWithReshuffle({
      deck: ch.inventory,
      discard: [...ch.discard, ...ch.hand],
      count: 5,
      rngState: state.rngState,
    });

    const newPlayer: PlayerState = {
      ...player,
      hp: ch.hp,
      maxHp: ch.maxHp,
      downed: ch.downed,
      dead: ch.dead,
      ...(ch.dead ? { counters: [] } : {}),
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
      gainedCardsGoToHand: false,
      damagePerAdditionalActionThisTurn: 0,
      mustExplore: false,
      // Rachael Foley L1: a downed (skipped) turn clears the Explore debt.
      exploresRequiredThisTurn: undefined,
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

    // Unofficial Expansion: a Character who dies returns its counters to the
    // shared supply ("return this card to the Resource Area").
    const deathState = ch.dead ? returnCountersToSupply(state, player.seat) : state;

    return {
      ...deathState,
      version: state.version + 1,
      rngState: d.rngState,
      seats: deathState.seats.map((s, i) => (i === state.activeSeat ? newPlayer : s)),
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


  const skillTurn = turnStartSkillEffects(state, player.seat);

  // Alliance Partner Modification: the Partner is a second Character under the
  // player's control, so its abilities are the seat's too. Self-healing is the
  // exception — `healAtTurnStart` restores that Character's OWN Health, so the
  // Partner's recovery goes to partnerHp, not the Main's.
  const mainAbils = abilitiesForLevel(charDef?.abilities, player.level);
  const seatAbils = seatAbilities(state, player.seat);
  const partnerAbils = partnerAbilities(state, player.seat);

  // CH-044 Jack Krauser (Mercenaries) L1: at the beginning of your turn, if you
  // have the lowest Decorations among all Players (ties count), Jack deals an
  // additional 10 Damage during this turn.
  const krauserAbility = seatAbils
    .find(a => a.kind === 'turnStartLowestDecorationsDamage');
  const krauserBonus = (() => {
    if (krauserAbility === undefined || krauserAbility.kind !== 'turnStartLowestDecorationsDamage') return 0;
    const alive = state.seats.filter(x => !x.dead);
    if (alive.length === 0) return 0;
    const min = Math.min(...alive.map(x => x.decorations));
    return player.decorations <= min ? krauserAbility.amount : 0;
  })();

  // Mansion attachment turn-start bonuses (Save Room: heal 10, +10 ammo)
  const attBonuses = mansionAttachmentTurnStartBonuses(state);

  const newPlayer: PlayerState = {
    ...player,
    partnerAttached,
    hp: Math.min(player.hp + herbHeal + healAtTurnStart(mainAbils) + skillTurn.heal + attBonuses.heal, player.maxHp),
    // The Partner's own recovery (Steve Burnside L1 and the like) restores the
    // Partner's separate Health, never the Main Character's.
    ...(player.partnerInstanceId !== undefined
      ? {
          partnerHp: Math.min(
            (player.partnerHp ?? player.hp) + healAtTurnStart(partnerAbils),
            player.partnerMaxHp ?? player.maxHp,
          ),
        }
      : {}),
    pendingHerbHeal: 0,
    turnAmmo: skillTurn.ammo + attBonuses.ammo,
    turnGold: ((herbHeal > 0 && seatAbils.some(a => a.kind === 'goldOnFirstHealThisTurn'))
      ? (seatAbils.find(a => a.kind === 'goldOnFirstHealThisTurn') as { amount: number }).amount
      : 0) +
      (seatAbils.some(a => a.kind === 'goldAtTurnStart')
        ? (seatAbils.find(a => a.kind === 'goldAtTurnStart') as { amount: number }).amount
        : 0) + skillTurn.gold,
    healedFirstTimeThisTurn: herbHeal > 0 && seatAbils.some(a => a.kind === 'goldOnFirstHealThisTurn'),
    actionsLeft: (() => {
      const base = (player.skipNextTurn || player.noActionsNextTurn) ? 0 : 1 + (partnersAttachedAtTurnStart ? 1 : 0);
      // IN-001 Claw caps the Actions available next turn.
      let capped = player.actionsCapNextTurn !== undefined ? Math.min(base, player.actionsCapNextTurn) : base;
      // Ada Wong (Outbreak CH-027) L1: +1 Action at turn start when Health is
      // at or below the threshold.
      const adaBonus = seatAbils
        .filter(a => a.kind === 'turnStartActionIfHpAtMost' && player.hp <= a.threshold).length;
      // Final Action: cap actions at N (overrides other caps if lower).
      const faCap = finalActionBonus(state).actionsCap;
      if (faCap > 0) capped = Math.min(capped, faCap);
      return capped + adaBonus;
    })(),
    // CR-001 Claire Redfield L1 (TACTICIAN): flat +amount Buy.
    buysLeft: 1 + plusBuyBonus(seatAbils),
    // Wesker L2: the targeted player gets +1 Explore and must Explore this turn
    // (validate blocks endTurn until then; exploring clears the obligation).
    // PR-001 Chris L2: +1 Explore at the beginning of the turn (stacks).
    // Infected Horde: +N explores at turn start.
    exploresLeft:
      player.skipNextTurn ? 0 :
      (player.mustExplore === true ? 2 : 1) +
      (seatAbils.some(a => a.kind === 'extraExploreAtTurnStart') ? 1 : 0) + skillTurn.explores + infectedHordeBonus(state).explores,
    // Mansion attachment: mustExploreIfAble (Close Combat) — all players must
    // Explore if able. Set the flag so validate blocks endTurn until explored.
    // Infected Horde: must explore or take damage.
    mustExplore: player.mustExplore === true || hasMansionAttachmentEffect(state, 'mustExploreIfAble') || infectedHordeBonus(state).damage > 0,
    weaponDamageBonusThisTurn: skillTurn.damageThisTurn + krauserBonus,
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
      gainedCardsGoToHand: false,
      damagePerAdditionalActionThisTurn: 0,
    desperateForcesTypes: undefined,
    chrisAmmoDiscountTypes: undefined,
    pendingSkillEffects: undefined,
    skillAmmoDiscountTypes: undefined,
    // Rachael Foley L1: the "must Explore at least twice" debt is per-turn, so
    // it is cleared here; the turn-start prompt may set it again.
    exploresRequiredThisTurn: undefined,
    // Jill Valentine (Mercenaries) L1: the targeted player's weapons cost
    // +amount Ammo THIS turn (the "next turn" the ability named).
    ammoReqIncreaseThisTurn: player.ammoReqIncreaseNextTurn,
    ammoReqIncreaseNextTurn: undefined,
    allWeaponsAmmoDiscountThisTurn: undefined,
    weaponDamageBonusById: undefined,
    trashAtEndOfTurn: undefined,
    usedWeaponEffectsThisTurn: undefined,
    pendingEndOfTurnDraws: undefined,
    pendingBackstab: undefined,
    pendingCoupDeGrace: undefined,
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
    seatAbilities(state, turnPlayer.seat).some(a => a.kind === 'turnStartDecreaseInfection')
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
  for (const a of seatAbilities(state, turnPlayer.seat)) {
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
  // Mercenaries Skill System: turn-start "can" Skills (SK-029 reveal Pistols).
  const skillPrompts = state.skillSystem === true ? turnStartSkillPrompts(state, player.seat, newVersion) : [];
  // CV-001 Cover-up: at the beginning of ANY player's turn, every player
  // holding one in hand may trash it to peek at the top Mansion card and
  // optionally move it to the bottom. The prompt is addressed to the HOLDER
  // (who can be the active player or another seat — chooseOption does not
  // gate on the active seat). Dead/downed players cannot answer a prompt.
  const coverUpPrompts: Prompt[] = [];
  for (const s of state.seats) {
    if (s.dead || s.downed) continue;
    for (const handId of s.hand) {
      const inst = state.cards[handId];
      if (inst === undefined) continue;
      const def = state.cardDefs[inst.cardId];
      if (def === undefined) continue;
      const isCoverUp = (def.actionEffects ?? []).some(e => e.kind === 'trashFromHandAtTurnStartPeekMansionTop');
      if (!isCoverUp) continue;
      // One pending offer per held copy: a second turn start must not stack
      // two prompts for the same instance (dropEmptyPrompts only removes
      // zero-option prompts; an unanswered offer would duplicate).
      const alreadyOffered = state.prompts.some(p =>
        p.payload?.kind === 'coverUpTrash' && p.payload?.instanceId === handId);
      if (alreadyOffered) continue;
      coverUpPrompts.push({
        id: `coverup-${s.seat}-v${newVersion}`,
        seat: s.seat,
        text: `Trash this card from your hand to look at the top of the Mansion? (${def.name})`,
        options: ['Trash', 'Decline'],
        payload: { kind: 'coverUpTrash', instanceId: handId },
      });
    }
  }
  const turnStartPrompts = [...abilityPrompts, ...skillPrompts, ...coverUpPrompts];

  return {
    ...state,
    version: newVersion,
    rngState: nextRng,
    seats: turnSeats.map((s, i) => (i === state.activeSeat ? turnPlayer : s)),
    prompts: turnStartPrompts.length > 0 ? [...state.prompts, ...turnStartPrompts] : state.prompts,
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