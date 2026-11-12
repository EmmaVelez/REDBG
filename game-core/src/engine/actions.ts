import type { GameState, Action, PlayerState, CardDef, CardInstance, WeaponEffect, Prompt } from '../types';
import { validateAction } from './validate';
import { draw, drawWithReshuffle, discardHand } from './deck';
import { revealTop, revealBottom, sendToBottom, shuffleBack, insertAt, deckCount } from './mansion';
import { resolveExplore, computeDamage, resolveMultiExplore, grantedExploresFor } from './explore';
import type { MultiExploreTarget } from './explore';
import { isNemesisPursuit, withNemesisPursuitBuff, applyNemesisPursuit, nemesisPursuitBuff, NEMESIS_PURSUIT_ID } from './nemesisPursuit';
import { applyOutbreakRevealEffects, outbreakTrapDamage, kevlarJacketPreventsDamage, applyDamageWithKevlar } from './outbreak';
import { flipDown, levelForDecorations, abilitiesForLevel } from './characters';
import { canPlayFromDiscard } from './weaponReuse';
import {
  characterAbilities,
  cardsOnDamageTakenDuringTurn,
  applyHpLoss,
  movesDiscardToInventoryOnDefeat,
  singleWeaponAmmoDiscount,
  chosenWeaponTypeAmmoDiscount,
  partnerAttachedDamageBonus,
  partnerAttachCap,
  herbTrashDamageBonus,
  hasDoubleDamageOnBothHerbs,
  hasPerfectExploreReward,
  plusDamageIfTwoOrMoreWeapons,
  dualWieldBonus,
  healOnDefeatWithWeaponTag,
  exploreBonusIfAmmoAbove,
  baseDamageBonusIfHpAtMost,
  isImmuneToInfectionEffects,
  applyInfectionDecreaseDraws,
  ammoReqForWeapon,
  passiveDamageBonus,
  exploreGoldBonus,
  ammunitionCardBonus,
  actionBonus,
  trashEffectBonus,
  explosivesGoToDiscard,
  canAttachToCharacter,
  isExplosive,
  infectedDamageReduction,
  allDamageReduction,
  exploreDamageIfHpAtMost,
  exploreBigHandBonus,
  exploreActionsBonus,
  exploreDamageIfNoPartnerLowHp,
  payExploreDebt,
  knifeWeaponsUsedThisTurn,
  exploreOnInfectedDefeat,
  trashCardFromDiscardOnInfectedDefeat,
  trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat,
  applyRicardoDamage,
  applyTrashTopFromDiscardOnBigHit,
  trashTopFromDiscardIds,
  jakeDefeatDecorationBonus,
  ricardoReduction,
  queueRicardoL2Prompt,
  leaderAbilities,
  seatAbilities,
  characterSource,
    buyCostAfterReduction,
  } from './abilities';
import { sumBonuses, applyBonusPools } from './cards';
import { advanceTurn } from './turn';
import { gainCard } from './gainCard';
import { dropEmptyPrompts } from './prompts';
import { requiredAmmoForExplore, exploreAmmoReq } from './ammo';
import { makeRng, shuffle, nextInt } from '../util/rng';

import { resolveAllyExplore, allyExploreUsedWeaponIds } from './allyExplore';
import { advanceDraft, moveXp, applyUseSkill, resolveSkillXpAmount, activeSkillEffects, exploreSkillDamageBonus, skillDamageReduction, skillGiantKillingThreshold, skillLethalReplacementAmount, skillHealAmountBonus, skillHealTrashFromDiscard, consumeNegateDamage, consumeInfectedEffectReaction, removePartnerSkill } from './skill';
import { applyMercenariesRevealEffects, applyMercenariesDefeatEffects, applyMercenariesNotDefeatedEffects, applyMercenariesOnDefeatAbilities, gainAmmoX10, gainCopy, gainCopyTracked, dealDamageToCharacter, removeInstanceEverywhere, ownerSeatOf, decorationDelta } from './mercenaries';

import { applyNightmareRevealEffects, applyNightmareDefeatEffects, applyNightmareNotDefeatedEffects, nightmareWeaponGains, nightmareWeaponPrompts, applyMindControlCopy } from './nightmare';
import { ammoX10CountInDiscard, oozeShufflesBackOnDefeat, saddlerAmmoGrantPerPlayer, shuffleCopyIntoMansion, shuffleIntoMansion, trashHighestDamageUsedWeapons, tyrantUltimateAbyssRoll } from './customInfected';
import { attachCounterToSeat, returnCountersToSupply } from './counters';
import { hasFreePistolTrashAtEnd, mansionAmmoBonusReduction, hasMansionAttachmentEffect, infectedHordeBonus, finalActionBonus, virusMutatesBonus, hasShotgunTwicePerTurn, mazeDamagePenalty, hasSurvivalHorror, hasShortSupplys, applyShortSupplysHeal, rebeccaDiscardGoldBonus } from './game';

function cardDef(state: GameState, instanceId: string | undefined): CardDef | undefined {
  if (instanceId === undefined) return undefined;
  const inst = state.cards[instanceId];
  if (!inst) return undefined;
  return state.cardDefs[inst.cardId];
}

/** Sum attachment damage bonuses for the given weapon tags. */
function attachmentDamageBonusForTags(tags: readonly string[], bonusByTag: Map<string, number>): number {
  let total = 0;
  for (const tag of tags) {
    total += bonusByTag.get(tag) ?? 0;
  }
  return total;
}

/**
 * Distinct weapon instance ids, order preserved. One entry in an explore
 * action's `weapons` array is one USE, so a weapon declared twice (Leon L2:
 * pay the ammo twice, effect and damage twice) is still ONE card — the play
 * area, trash and explosive lists must not pick up a second copy of it.
 */
function uniqueWeapons(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Every weapon instance currently in a Resource Area pile (EX-003 Weapon Case,
 *  which lets the taker choose any weapon from the Resource Area). Pass
 *  `maxCost` to keep only weapons costing no more than that (IT-000 Antique
 *  Coin, whose gain is limited to its own cost). */
function marketWeaponIds(state: GameState, maxCost?: number): string[] {
  const out: string[] = [];
  for (const pile of Object.values(state.marketPiles)) {
    // Antique Coin: only the top card of each pile is visible/available.
    const topId = pile.cards[0];
    if (topId === undefined) continue;
    const def = cardDef(state, topId);
    if (def?.type !== 'weapon') continue;
    if (maxCost !== undefined && (def.cost ?? Infinity) > maxCost) continue;
    out.push(topId);
  }
  return out;
}

/**
 * Unofficial Expansion: EX-002 Special Rocket Launcher. While attached to the
 * exploring Character, the launcher auto-defeats the next Infected with `hp` or
 * more Health revealed during an explore, then is removed from the game.
 * Returns the launcher instance id to remove, or undefined when it does not fire.
 */
function specialRocketLauncherId(state: GameState, seat: number, revealed: CardDef): string | undefined {
  if (revealed.type !== 'infected') return undefined;
  const player = state.seats[seat];
  if (player === undefined) return undefined;
  for (const id of player.attached) {
    const def = cardDef(state, id);
    const eff = (def?.weaponEffects ?? []).find(e => e.kind === 'attachOnGainDefeatInfectedAtOrAboveHp');
    if (eff !== undefined && eff.kind === 'attachOnGainDefeatInfectedAtOrAboveHp' && (revealed.hp ?? 0) >= eff.hp) {
      return id;
    }
  }
  return undefined;
}

/** Remove the EX-002 launcher from the exploring Character and the game. */
function consumeSpecialRocketLauncher(state: GameState, seat: number, launcherId: string): GameState {
  return {
    ...state,
    removed: [...state.removed, launcherId],
    seats: state.seats.map(s => (s.seat === seat
      ? { ...s, attached: s.attached.filter(id => id !== launcherId) }
      : s)),
  };
}

/**
 * CH-032 Zombie B: "When a character's infection level increases by 1 or more
 * due to an effect, you may trash an infection card from your hand. If you do,
 * increase that character's infection level by 1 more."
 *
 * Returns one prompt per Zombie B player who can react to `affectedSeat`'s
 * increase. The reaction is resolved by trashing an infection card from their
 * hand and drawing a fresh infection onto the affected character.
 */
function zombieBPrompts(state: GameState, affectedSeat: number, version: number): Prompt[] {
  const out: Prompt[] = [];
  const affectedName = state.seats[affectedSeat]?.name ?? 'A character';
  for (const s of state.seats) {
    if (s.dead || s.isInfectedCharacter !== true) continue;
    if (!seatAbilities(state, s.seat).some(a => a.kind === 'zombieBInfectionIncrease')) continue;
    const infectionInHand = s.hand.filter(id => state.cards[id]?.cardId.startsWith('in-'));
    if (infectionInHand.length === 0) continue;
    out.push({
      id: `zombie-b-${s.seat}-${version}`,
      seat: s.seat,
      text: `${affectedName}'s Infection Level increased. Trash an Infection card from your hand to increase it by 1 more?`,
      options: [...infectionInHand, 'Decline'],
      payload: { kind: 'zombieBInfectionIncrease', targetSeat: String(affectedSeat) },
    });
  }
  return out;
}

/** True when the instance is the Green Herb (the only card with this effect). */
function isGreenHerb(state: GameState, instanceId: string): boolean {
  return (
    cardDef(state, instanceId)?.itemEffects?.some(e => e.kind === 'healFixed20OrTrashWithSecondFor60') ??
    false
  );
}
/** True when the instance is a Red Herb (the only card with this effect). */
function isRedHerb(state: GameState, instanceId: string): boolean {
  return (
    cardDef(state, instanceId)?.itemEffects?.some(e => e.kind === 'healSelfAndPartnerToFull') ??
    false
  );
}

/**
 * Rebecca L1: "Cards you trash via effects may go to other players' discard
 * piles instead." After an effect trashes a card, offer a redirect prompt
 * (option 0 = leave it in the trash). Only fires for Rebecca at L1+ with
 * living opponents.
 */
function trashRedirectPrompt(
  state: GameState,
  seat: number,
  trashedId: string,
  prompts: GameState['prompts'],
  version: number
): GameState['prompts'] {
  if (!seatAbilities(state, seat).some(a => a.kind === 'trashRedirectToPlayerDiscard')) {
    return prompts;
  }
  const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
  if (others.length === 0) return prompts;
  const def = cardDef(state, trashedId);
  return [
    ...prompts,
    {
      id: `redirect-${trashedId}-v${version}`,
      seat,
      text: `${def?.name ?? trashedId} was trashed. Send it to a player's discard pile instead?`,
      options: ['Leave in trash', ...others.map(s => String(s.seat))],
      payload: { kind: 'trashRedirect', instanceId: trashedId },
    },
  ];
}

function withBonusesAndDraws(player: PlayerState, def: CardDef, rngState: number): { player: PlayerState; rngState: number } {
  const bonuses = sumBonuses([def]);
  const pools = applyBonusPools(
    {
      turnAmmo: player.turnAmmo,
      turnGold: player.turnGold,
      actionsLeft: player.actionsLeft,
      buysLeft: player.buysLeft,
      exploresLeft: player.exploresLeft,
    },
    bonuses,
  );

  let hand = player.hand;
  let inventory = player.inventory;
  let discard = player.discard;
  let nextRng = rngState;

  if (pools.draws > 0 && (player.inventory.length > 0 || player.discard.length > 0)) {
    // "draw X from Inventory (reshuffle discard if needed)" — rulebook +X Cards
    const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: pools.draws, rngState });
    hand = [...hand, ...d.hand];
    inventory = d.deck;
    discard = d.discard;
    nextRng = d.rngState;
  }

  const nextPlayer: PlayerState = {
    ...player,
    hand,
    inventory,
    discard,
    turnAmmo: pools.pools.turnAmmo,
        turnGold: pools.pools.turnGold,
        actionsLeft: pools.pools.actionsLeft,
        buysLeft: pools.pools.buysLeft,
        exploresLeft: pools.pools.exploresLeft,
      };

      return { player: nextPlayer, rngState: nextRng };
    }

/**
 * Choke point: a Character whose Health is reduced to 0 or less is downed.
 *
 * Rulebook ("Penalty for Losing all Your Character's Health"): turn the
 * Character face down and shuffle the Hand and Discard Pile into the
 * Inventory; cards attached to the Character stay attached. The Character
 * revives at the start of its next turn (see `startTurn`), losing 20 max
 * Health, and is permanently defeated if that drops max Health to 0 or less.
 * Outbreak adds that a face-down Character is out of the game: it cannot be
 * targeted by effects and its Infection Level cannot rise.
 *
 * Runs after EVERY action so no damage source (explore reveal, reveal-time
 * infected effect, event card, action effect, attack) can be missed. The
 * explore path applies the down inline first because AC-050 Resuscitate can
 * intercept it; this hook skips seats that are already downed.
 */
function applyDownedHooks(next: GameState): GameState {
  let state = next;
  for (const seat of state.seats) {
    if (seat.dead || seat.downed || seat.hp > 0) continue;
    let rngState = state.rngState;
    const flipResult = flipDown(
      {
        hp: 0,
        maxHp: seat.maxHp,
        decorations: seat.decorations,
        level: seat.level,
        downed: seat.downed,
        dead: seat.dead,
        hand: seat.hand,
        discard: seat.discard,
        inventory: seat.inventory,
      },
      (items) => {
        const r = shuffle(makeRng(rngState), items);
        rngState = r.rng.s;
        return r.value;
      },
    );
    state = {
      ...state,
      rngState,
      seats: state.seats.map(s => (s.seat === seat.seat
        ? {
            ...s,
            downed: flipResult.downed,
            hand: flipResult.hand,
            discard: flipResult.discard,
            inventory: flipResult.inventory,
          }
        : s)),
    };
    // Final Action: when a character loses all health, remove this attachment.
    const faBonus = finalActionBonus(state);
    if (faBonus.attachmentIds.length > 0) {
      const remainingAttachments = (state.mansionAttachments ?? []).filter(id => !faBonus.attachmentIds.includes(id));
      state = {
        ...state,
        mansionAttachments: remainingAttachments,
        removed: [...state.removed, ...faBonus.attachmentIds.filter(id => !state.removed.includes(id))],
      };
    }
  }
  return state;
}

/**
 * Applies one validated action, then runs the damage-taken character hooks.
 *
 * Ada (Nightmare CH-043) L1 - "During your turn, if Ada takes damage, you get
 * +2 cards" - is implemented here as a post-action pass instead of being
 * sprinkled through each individual damage site: damage reaches a seat from
 * many places (explore reveal, reveal-time infected effects, event cards,
 * action effects), and the card only cares that the seat took damage while it
 * was that seat's turn. One choke point covers every source and cannot drift
 * out of sync when a new damage source is added.
 */
export function applyAction(state: GameState, action: Action): GameState {
  const next = applyDownedHooks(applyDamageTakenHooks(state, applyActionInternal(state, action)));
  // Choke point: a prompt with no options can never be resolved and would
  // deadlock the seat behind the "resolve pending prompt first" gate.
  return dropEmptyPrompts(applyOutbreakHooks(state, next, action));
}

/** Outbreak: all Characters have a Maximum Infection Level of 10. */
export const MAX_INFECTION_LEVEL = 10;

/**
 * Outbreak hooks that must run AFTER an action is applied:
 *  - Exploring the Mansion or Attacking an Infected Character suppresses
 *    that seat's end-of-turn Infection increase.
 *  - Reaching the Maximum Infection Level kills the Character, who
 *    reanimates as an Infected Character on its next turn.
 */
function applyOutbreakHooks(prev: GameState, next: GameState, action: Action): GameState {
  void prev;
  let state = next;
  const mark = (seat: number): void => {
    const s = state.seats[seat];
    if (s === undefined) return;
    state = {
      ...state,
      seats: state.seats.map(x => (x.seat === seat ? { ...x, exploredOrAttackedThisTurn: true } : x)),
    };
  };
  if (action.type === 'explore') {
    mark(action.seat);
    // CH-000 Rachael Foley L1: every Explore works down the turn's Explore
    // debt, whatever explore path was taken (single, multi, weapon-granted).
    // A multi-explore with exploreCount 2 IS two Explores, so it pays 2.
    state = payExploreDebt(state, action.seat, action.exploreCount ?? 1);
    // Detect which mansion deck card was revealed by comparing decks before/after.
    // A revealed card disappears from mansionDeck and appears in a player's
    // inventory/discard/playArea — track what left the deck.
    const prevDeck = new Set(prev.mansionDeck);
    const nextDeck = new Set(state.mansionDeck ?? []);
    // Cards that were in the deck but aren't anymore (revealed/removed cards).
    const revealedInstances: string[] = [];
    for (const id of prevDeck) { if (!nextDeck.has(id)) revealedInstances.push(id); }
    // Filter to instances that are now in a player's non-mansion zone.
    const validCards = revealedInstances.filter(id => {
      const loc = state.cards[id]?.location;
      return loc && loc.zone !== 'mansionDeck';
    });
    if (validCards.length > 0) {
      // Use the first revealed card as the primary reveal.
      const instanceId = validCards[0]!;
      const cardData = state.cards[instanceId];
      let name = 'Unknown';
      if (cardData && typeof cardData.cardId === 'string' && cardData.cardId.length > 0) {
        const cdef = state.cardDefs[cardData.cardId];
        name = (cdef?.name ?? cardData.cardId);
      } else if (cardData) {
        name = cardData.cardId ?? 'Unknown';
      }
      state = {
        ...state,
        log: [...state.log, { seq: state.log.length + 1, action: { type: 'exploreReveal' as const, seat: action.seat, instanceId, name } }],
      };
    }
  } else if (action.type === 'attack') {
    const target = state.seats[action.targetSeat];
    if (target?.isInfectedCharacter === true) mark(action.seat);
  }
  if (state.infectionDeck === undefined) return state;
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s === undefined) continue;
    const level = s.infectionCards?.length ?? 0;
    if (level >= MAX_INFECTION_LEVEL && !s.dead && s.isInfectedCharacter !== true) {
      state = reanimateAsInfected(state, s.seat);
    }
  }
  return state;
}

/**
 * Outbreak "Becoming the Infected": shuffle the Character's cards together
 * (including the face-up Infections), remove the Character card and its
 * non-Infected attachments, and mark the seat to reanimate as a random
 * Infected Character on its next turn.
 */
function reanimateAsInfected(state: GameState, seat: number): GameState {
  const player = state.seats[seat] as PlayerState;
  // "Shuffle their cards together" includes the Play Area: the rulebook
  // is explicit that Items and Ammunition played this turn stay there until
  // the end of the turn, so they are the Character's cards at the moment of
  // death. Dropping them here destroyed every card the player had played
  // that turn (ammo, weapons, items).
  const combined = shuffle(makeRng(state.rngState), [
    ...player.hand,
    ...player.playArea,
    ...player.discard,
    ...player.inventory,
    ...(player.infectionCards ?? []),
  ]);
  const newPlayer: PlayerState = {
    ...player,
    dead: true,
    downed: false,
    hp: 0,
    hand: [],
    playArea: [],
    discard: [],
    inventory: combined.value,
    infectionCards: [],
    pendingReanimate: true,
  };
  return {
    ...state,
    rngState: combined.rng.s,
    seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
  };
}

function applyDamageTakenHooks(prev: GameState, next: GameState): GameState {
  let state = next;
  for (let i = 0; i < state.seats.length; i++) {
    const seat = state.seats[i];
    const before = prev.seats[i];
    if (seat === undefined || before === undefined) continue;
    if (seat.hp >= before.hp) continue;          // no damage this action
    // CH-045 HUNK (Mercenaries): "When Hunk would take any Damage, you can lower
    // that Damage by 20. In that case, Gain 1 'Ammo x10'." The reduction is
    // applied at the damage site; the gain fires once per damaging action.
    if (!seat.downed && !seat.dead &&
        characterAbilities(prev, seat.seat).some(a => a.kind === 'damageReductionForAmmo')) {
      state = gainAmmoX10(state, seat.seat, 1);
    }
    if (seat.seat !== state.activeSeat) continue; // only "during your turn"
    // A downed character has no hand (revive redraws one); drawing here would
    // silently drop the cards at revive, so the trigger is skipped instead.
    if (seat.downed || seat.dead) continue;
    const draw = cardsOnDamageTakenDuringTurn(characterAbilities(prev, seat.seat), true);
    if (draw <= 0) continue;
    const d = drawWithReshuffle({ deck: seat.inventory, discard: seat.discard, count: draw, rngState: state.rngState });
    state = {
      ...state,
      rngState: d.rngState,
      seats: state.seats.map(s => (s.seat === seat.seat
        ? { ...s, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: d.discard }
        : s)),
    };
  }
  return state;
}

function applyActionInternal(state: GameState, action: Action): GameState {
  if (action.type === 'startGame') {
    throw new Error('applyAction: startGame handled by game.ts setup');
  }

  const result = validateAction(state, action);
  if (!result.ok) {
    throw new Error('applyAction: ' + result.reason);
  }

  const nextBase = {
    version: state.version + 1,
    log: [...state.log, { seq: state.log.length + 1, action }],
  };

  switch (action.type) {
    case 'playActionCard': {
      const { seat, instanceId } = action;
      const player = state.seats[seat] as PlayerState;
      const def = cardDef(state, instanceId) as CardDef;

      const played = withBonusesAndDraws(
              {
                ...player,
                hand: player.hand.filter(id => id !== instanceId),
                playArea: [...player.playArea, instanceId],
                actionsLeft: player.actionsLeft - 1,
              },
              def,
              state.rngState,
            );

            let weaponDamageBonusThisTurn = played.player.weaponDamageBonusThisTurn;
            for (const e of def.actionEffects ?? []) {
              if (e.kind === 'allWeaponsPlusDamageThisTurn') {
                weaponDamageBonusThisTurn += e.amount;
              }
            }
            if (def.id === 'ac-023') {
              weaponDamageBonusThisTurn += 20;
            }
            // AC-013 Partners / AC-014 Star-Crossed Duo: attach this card to the
            // partner (if any) on play. The card leaves the Play Area — it is
            // now attached, and leaving a copy in both zones would duplicate it
            // when the Play Area is discarded at end of turn.
            const attachesToPartner = (def.id === 'ac-013' || def.id === 'ac-014' || def.id === 'ac-020')
              && player.partnerInstanceId !== undefined
              && (played.player.partnerAttached ?? []).length < partnerAttachCap(seatAbilities(state, seat));
            let partnerAttached = played.player.partnerAttached ?? [];
            if (attachesToPartner) {
              partnerAttached = [...partnerAttached, instanceId];
            }
            let newPlayer: PlayerState = {
              ...played.player,
              playArea: attachesToPartner
                ? played.player.playArea.filter(id => id !== instanceId)
                : played.player.playArea,
              partnerAttached,
              weaponDamageBonusThisTurn,
              turnGold: played.player.turnGold + actionBonus(seatAbilities(state, seat), def) + trashEffectBonus(seatAbilities(state, seat), def),
            };
            let ac015Rng = played.rngState;
            if (def.id === 'ac-015' && !player.partnerInstanceId) {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 2, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
              ac015Rng = d.rngState;
            }
            if (def.id === 'ac-024') {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 1, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard, actionsLeft: newPlayer.actionsLeft + 1 };
              ac015Rng = d.rngState;
            }
            if (def.id === 'ac-025') {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 2, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
              ac015Rng = d.rngState;
            }
            if (def.id === 'ac-026') {
              newPlayer = { ...newPlayer, actionsLeft: newPlayer.actionsLeft + 1 };
            }            if (def.id === 'ac-029') {
              newPlayer = { ...newPlayer, actionsLeft: newPlayer.actionsLeft + 1 };
            }
            if (def.id === 'ac-027') {
              // +2 Actions; "decrease by any amount, then increase by the
              // same amount minus one" is a net -1 Infection Level.
              const lvl = newPlayer.infectionCards?.length ?? 0;
              newPlayer = {
                ...newPlayer,
                actionsLeft: newPlayer.actionsLeft + 2,
                infectionCards: lvl > 0 ? (newPlayer.infectionCards ?? []).slice(0, -1) : [],
              };
            }
            if (def.id === 'ac-030') {
              // +2 cards, then attach this card to your character.
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 2, rngState: ac015Rng });
              newPlayer = {
                ...newPlayer,
                hand: [...newPlayer.hand, ...d.hand],
                inventory: d.deck,
                discard: d.discard,
                playArea: newPlayer.playArea.filter(id => id !== instanceId),
                attached: [...newPlayer.attached, instanceId],
              };
              ac015Rng = d.rngState;
            }
            if (def.id === 'ac-019' && newPlayer.hand.length > 0) {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 1, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
              ac015Rng = d.rngState;
            }

      let prompts = state.prompts;
      let promptKind: string | undefined;
      let promptOptions: readonly string[] | undefined;
      let promptInstanceId: string | undefined;
      let promptExtra: Readonly<Record<string, string | number>> | undefined;
      for (const e of def.actionEffects ?? []) {
        if (e.kind === 'recoverWeaponFromDiscardToHand') {
          const weaponsInDiscard = player.discard.filter(id => cardDef(state, id)?.type === 'weapon');
          if (weaponsInDiscard.length > 0) {
            promptKind = 'recoverWeaponFromDiscardToHand';
            promptOptions = weaponsInDiscard;
          }
          break;
        }
        if (e.kind === 'moveHandCardToTopOfInventory') {
                  if (played.player.hand.length > 0) {
                    promptKind = 'moveHandCardToTopOfInventory';
                    promptOptions = played.player.hand;
                  }
                  break;
                }
                if (e.kind === 'trashHandCard') {
                  if (played.player.hand.length > 0) {
                    promptKind = 'trashHandCard';
                    promptOptions = played.player.hand;
                  }
                  break;
                }
        if (e.kind === 'lookAtMansionTop') {
                  promptKind = 'lookAtMansionTop';
                  promptOptions = ['OK'];
                  break;
                }
        if (e.kind === 'weskersSecret') {
          const top4 = state.mansionDeck.slice(0, 4);
          if (top4.length > 0) {
            promptKind = 'weskersSecretMansion';
            promptOptions = [...top4, 'Decline'];
          }
          break;
        }
                if (e.kind === 'trashUpToTwoFromDiscard') {
                                  // Up to 2 choices: offer the whole discard, DONE ends the chain.
                                  if (player.discard.length > 0) {
                                    promptKind = 'trashUpToTwoFromDiscard';
                                    promptOptions = [...player.discard, 'DONE'];
                                  }
                                  break;
                                }
                                if (e.kind === 'upgradeAmmoBy30Gold') {
                                  const ammoInHand = played.player.hand.filter(id => cardDef(state, id)?.type === 'ammunition');
                                  if (ammoInHand.length > 0) {
                                    promptKind = 'upgradeAmmoBy30Gold';
                                    promptOptions = ammoInHand;
                                  }
                                  break;
                                }
                                if (e.kind === 'stealRevealedWeaponsFromOpponentsTopCards') {
                                  // Master of Unlocking: everyone else's top inventory card is
                                  // revealed; each revealed Weapon may be taken (chain, DONE ends).
                                  const revealed: string[] = [];
                                  for (const other of state.seats) {
                                    if (other.seat === seat || other.dead) continue;
                                    const top = other.inventory[0];
                                    if (top !== undefined && cardDef(state, top)?.type === 'weapon') {
                                      revealed.push(top);
                                    }
                                  }
                                  if (revealed.length > 0) {
                                    promptKind = 'stealRevealedWeaponsFromOpponentsTopCards';
                                    promptOptions = [...revealed, 'DONE'];
                                  }
                                  break;
                                }
                                // negateWeaponCost40OrLessFromHand: v1 reactive no-op, no prompt
                              if (e.kind === 'chooseOtherPlayerRevealHand') {
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
                                if (others.length > 0) {
                                  const maxCostEffect = def.actionEffects?.find(x => x.kind === 'chooseActionCardCostAtMost');
                                  const maxCost = maxCostEffect && maxCostEffect.kind === 'chooseActionCardCostAtMost' ? maxCostEffect.maxCost : 70;
                                  promptKind = 'chooseOtherPlayerRevealHand';
                                  promptOptions = [...others.map(s => String(s.seat))];
                                  promptExtra = { maxCost: String(maxCost) };
                                }
                                break;
                              }
                              if (e.kind === 'lookAtTopInventory') {
                                // AC-035 PDA: look at the top N inventory cards.
                                const top = played.player.inventory.slice(0, e.count);
                                if (top.length > 0) {
                                  promptKind = 'pdaLook';
                                  promptOptions = [...top, 'None'];
                                  promptExtra = { looked: top.join(',') };
                                }
                                break;
                              }                              if (e.kind === 'higherPriorities') {
                                promptKind = 'higherPriorities';
                                promptOptions = ['+3 cards', '+2 actions'];
                                break;
                              }
                              if (e.kind === 'powerOfTVirus') {
                                promptKind = 'powerOfTVirus';
                                promptOptions = ['Trash for +20 Gold', 'Decline'];
                                promptInstanceId = instanceId;
                                break;
                              }

                              if (e.kind === 'injection') {
                                promptKind = 'injectionDiscard';
                                promptOptions = [...played.player.hand, 'DONE'];
                                break;
                              }
                              if (e.kind === 'partingWays') {
                                promptKind = 'partingWays';
                                promptOptions = [...played.player.hand, 'Decline'];
                                break;
                              }
                              if (e.kind === 'gatheringDarkness') {
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
                                if (others.length > 0) {
                                  promptKind = 'gatheringDarkness';
                                  promptOptions = [...others.map(s => String(s.seat))];
                                }
                                break;
                              }
                              if (e.kind === 'iHaveThis') {
                                const costlyWeapons = played.player.hand.filter(id => {
                                  const c = cardDef(state, id);
                                  return c?.type === 'weapon' && (c.cost ?? 0) >= 50;
                                });
                                if (costlyWeapons.length > 0) {
                                  promptKind = 'iHaveThis';
                                  promptOptions = [...costlyWeapons, 'Decline'];
                                }
                                break;
                              }
                              // --- Mercenaries actions ---
                              if (e.kind === 'choosePlayerDiscardWeaponForDamage') {
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
                                if (others.length > 0) {
                                  promptKind = 'ac043ChoosePlayer';
                                  promptOptions = [...others.map(s => String(s.seat))];
                                }
                                break;
                              }
                              if (e.kind === 'discardTwoThenTrashOneFromHand') {
                                if (played.player.hand.length > 0) {
                                  promptKind = 'ac044Discard';
                                  promptOptions = [...played.player.hand];
                                }
                                break;
                              }
                              if (e.kind === 'choosePlayerForCoupDeGrace') {
                                const candidates = [...played.player.hand, ...played.player.playArea]
                                  .filter(id => cardDef(state, id)?.type === 'weapon');
                                if (candidates.length > 0) {
                                  promptKind = 'ac045ChooseWeapon';
                                  promptOptions = [...candidates];
                                }
                                break;
                              }
                              if (e.kind === 'trashTwoFromHandForGoldIfSameType') {
                                if (played.player.hand.length >= 2) {
                                  promptKind = 'ac047ChooseFirst';
                                  promptOptions = [...played.player.hand];
                                }
                                break;
                              }
                              if (e.kind === 'choosePlayerForBackstab') {
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
                                if (others.length > 0) {
                                  promptKind = 'ac048ChoosePlayer';
                                  promptOptions = [...others.map(s => String(s.seat))];
                                }
                                break;
                              }
                              if (e.kind === 'moveHandToInventoryBottomAndDraw') {
                                if (played.player.hand.length > 0) {
                                  promptKind = 'ac049Move';
                                  promptOptions = [...played.player.hand, 'DONE'];
                                }
                                break;
                              }
                              }
                      if (promptKind !== undefined && promptOptions !== undefined) {
        prompts = [
          ...prompts,
          {
            id: 'p' + (state.prompts.length + 1),
            seat,
            text: def.text,
            options: promptOptions,
            payload: { kind: promptKind, instanceId, ...(promptExtra ?? {}) },
          },
        ];
      }

      // AC-016 Archrival: all players discard down to one or fewer cards attached to their partners.
      const applyArchrival = (p: PlayerState): PlayerState => {
        if (def.id !== 'ac-016') return p;
        const pa = p.partnerAttached ?? [];
        if (pa.length <= 1) return p;
        const keep = pa.slice(0, 1);
        const excess = pa.slice(1);
        return { ...p, partnerAttached: keep, discard: [...p.discard, ...excess] };
      };

      // AC-017 Fierce Battle: choose another player to give +1 card.
      let finalPrompts = prompts;
      if (def.id === 'ac-017') {
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
        if (others.length > 0) {
          finalPrompts = [
            ...prompts,
            {
              id: 'p' + (state.prompts.length + 1),
              seat,
              text: 'Choose a player to give +1 card.',
              options: [...others.map(s => String(s.seat)), 'Decline'],
              payload: { kind: 'giveOneCardToPlayer' },
            },
          ];
        }
      }
      // AC-022 Desperate Forces: choose a weapon type for +10 damage this turn.
      if (def.id === 'ac-022') {
        const candidateWeapons = [...newPlayer.hand, ...newPlayer.playArea]
          .map(id => state.cardDefs[state.cards[id]?.cardId ?? ''])
          .filter((d): d is NonNullable<typeof d> => !!d && d.type === 'weapon' && !!d.weaponType);
        const types = [...new Set(candidateWeapons.map(d => d.weaponType as string))];
        if (types.length > 0) {
          finalPrompts = [
            ...finalPrompts,
            {
              id: 'p' + (finalPrompts.length + state.prompts.length + 1),
              seat,
              text: 'Choose a weapon type for +10 damage this turn.',
              options: [...types, 'Decline'],
              payload: { kind: 'chooseWeaponType' },
            },
          ];
        }
      }
      if (def.id === 'ac-019' && newPlayer.hand.length > 0) {
        finalPrompts = [
          ...finalPrompts,
          {
            id: 'p' + (finalPrompts.length + state.prompts.length + 1),
            seat,
            text: def.text,
            options: newPlayer.hand,
            payload: { kind: 'trashHandCard' },
          },
        ];
      }

      // Apply simple ActionEffects not handled via prompts above.
            let seatsAfterEffects = state.seats.map(s => (s.seat === seat ? newPlayer : s));
            let rngAfterEffects = ac015Rng;
            // Rebecca Chambers (Outbreak) L2: when an effect decreases another
            // character's Infection Level, she gets +1 card. AC-027 (By Any Means
            // Necessarily) is the card effect that lowers a level.
            if ((newPlayer.infectionCards?.length ?? 0) < (player.infectionCards?.length ?? 0)) {
              const withDraws = applyInfectionDecreaseDraws({ ...state, seats: seatsAfterEffects }, seat);
              seatsAfterEffects = [...withDraws.seats];
              rngAfterEffects = withDraws.rngState;
            }
            for (const e of def.actionEffects ?? []) {
              if (e.kind === 'gainActions') {
                newPlayer = { ...newPlayer, actionsLeft: newPlayer.actionsLeft + e.count };
                seatsAfterEffects = seatsAfterEffects.map(s =>
                  s.seat === seat ? { ...s, actionsLeft: s.actionsLeft + e.count } : s,
                );
              }
              if (e.kind === 'gainCards') {
                const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: e.count, rngState: rngAfterEffects });
                newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
                rngAfterEffects = d.rngState;
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'gainedCardsGoToHand') {
                // AC-021 Gathering Forces: cards gained this turn go to hand.
                newPlayer = { ...newPlayer, gainedCardsGoToHand: true };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'damageCharacter') {
                const ric = applyRicardoDamage(state, seat, newPlayer.hp, e.amount);
                state = ric.state;
                newPlayer = { ...newPlayer, hp: ric.hp };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'unlimitedActionsThisTurn') {
                newPlayer = { ...newPlayer, actionsLeft: 999 };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? { ...s, actionsLeft: 999 } : s));
              }
              if (e.kind === 'damagePerAdditionalAction') {
                newPlayer = { ...newPlayer, damagePerAdditionalActionThisTurn: (newPlayer.damagePerAdditionalActionThisTurn ?? 0) + e.amount };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'moveCardsFromDiscardToTopInventory') {
                const targetSeat = e.owner === 'player' ? seat : Number(e.owner);
                seatsAfterEffects = seatsAfterEffects.map(s => {
                  if (s.seat !== targetSeat) return s;
                  const n = Math.min(e.count, s.discard.length);
                  const moved = s.discard.slice(s.discard.length - n);
                  const newDiscard = s.discard.slice(0, s.discard.length - n);
                  return { ...s, discard: newDiscard, inventory: [...moved, ...s.inventory] };
                });
                if (targetSeat === seat) {
                  const updated = seatsAfterEffects.find(s => s.seat === seat);
                  if (updated) newPlayer = updated as PlayerState;
                }
              }
              if (e.kind === 'attachToCharacter' && canAttachToCharacter(def)) {
                newPlayer = { ...newPlayer, attached: [...newPlayer.attached, instanceId], playArea: newPlayer.playArea.filter(id => id !== instanceId) };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'attachAndRestrictWeapons') {
                // CQ-001 Close Quarters Combat: attach to character.
                newPlayer = { ...newPlayer, attached: [...newPlayer.attached, instanceId], playArea: newPlayer.playArea.filter(id => id !== instanceId) };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'beginTurnTrashIfHealthAtMost') {
                if (newPlayer.hp <= e.threshold) {
                  newPlayer = { ...newPlayer, attached: newPlayer.attached.filter(id => id !== instanceId), discard: [...newPlayer.discard, instanceId] };
                  seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
                }
              }
              if (e.kind === 'elseDamageAndDraw') {
                // Only applies when the card was NOT trashed above.
                const stillAttached = newPlayer.attached.includes(instanceId);
                // If beginTurnTrashIfHealthAtMost already trashed, instanceId is gone from attached.
                const trashed = !stillAttached && newPlayer.discard.includes(instanceId);
                if (!trashed) {
                  const ric = applyRicardoDamage(state, seat, newPlayer.hp, e.damage);
                  state = ric.state;
                  newPlayer = { ...newPlayer, hp: ric.hp };
                  const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: e.cards, rngState: rngAfterEffects });
                  newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
                  rngAfterEffects = d.rngState;
                  seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
                }
              }
              // --- Nightmare actions (AC-032..AC-041) ---
              if (e.kind === 'gainAmmo') {
                newPlayer = { ...newPlayer, turnAmmo: newPlayer.turnAmmo + e.amount };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'discardInventory') {
                newPlayer = { ...newPlayer, discard: [...newPlayer.discard, ...newPlayer.inventory], inventory: [] };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'gainGoldAndAmmoPerInventoryCard') {
                const n = newPlayer.inventory.length;
                newPlayer = { ...newPlayer, turnGold: newPlayer.turnGold + e.gold * n, turnAmmo: newPlayer.turnAmmo + e.ammo * n };
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'discardInventoryUntilWeaponToHand') {
                const inv = newPlayer.inventory;
                let count = 0;
                let found: string | undefined;
                while (count < inv.length) {
                  const id = inv[count];
                  if (id === undefined) break;
                  const d = cardDef(state, id);
                  if (d?.type === 'weapon') { found = id; break; }
                  count += 1;
                }
                if (found !== undefined) {
                  const discarded = inv.slice(0, count);
                  newPlayer = {
                    ...newPlayer,
                    inventory: inv.slice(count + 1),
                    discard: [...newPlayer.discard, ...discarded],
                    hand: [...newPlayer.hand, found],
                  };
                } else {
                  newPlayer = { ...newPlayer, discard: [...newPlayer.discard, ...inv], inventory: [] };
                }
                seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
              }
              if (e.kind === 'drawCardsPerInventoryDivisor') {
                const n = Math.floor(newPlayer.inventory.length / e.divisor);
                if (n > 0) {
                  const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: n, rngState: rngAfterEffects });
                  newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
                  rngAfterEffects = d.rngState;
                  seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
                }
              }
              if (e.kind === 'discardInventoryUntilWeaponForDamage') {
                // AC-051 Tear Gas: discard from the top of the Inventory until a
                // Weapon is discarded (inclusive). +amount damage per card
                // discarded if a Weapon was found.
                const inv = newPlayer.inventory;
                let count = 0;
                let found = false;
                while (count < inv.length) {
                  const id = inv[count];
                  if (id === undefined) break;
                  const d = cardDef(state, id);
                  count += 1;
                  if (d?.type === 'weapon') { found = true; break; }
                }
                if (found && count > 0) {
                  const discarded = inv.slice(0, count);
                  newPlayer = {
                    ...newPlayer,
                    inventory: inv.slice(count),
                    discard: [...newPlayer.discard, ...discarded],
                    weaponDamageBonusThisTurn: newPlayer.weaponDamageBonusThisTurn + e.amount * count,
                  };
                  seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
                }
              }
              if (e.kind === 'lookAtMansionTop3AndReorder') {
                // AC-003 The Ecliptic Express: look at top 3 mansion, reorder, must explore
                const top3 = state.mansionDeck.slice(0, 3);
                if (top3.length > 0) {
                  promptKind = 'lookAtMansionTop3AndReorder';
                  promptOptions = top3;
                }
              }
              if (e.kind === 'rollD6ForDamageEffect') {
                // AC-003 Unknown Odds: roll d6 for damage effect
                promptKind = 'rollD6ForDamageEffect';
                promptOptions = ['Roll'];
              }
              if (e.kind === 'otherPlayersDrawCard') {
                // AC-003 Member of S.T.A.R.S: every other player draws +1 card
                // Apply immediately - other players draw from their inventory
                for (const s of state.seats) {
                  if (s.seat !== seat && !s.dead && !s.downed) {
                    const d = drawWithReshuffle({ deck: s.inventory, discard: s.discard, count: 1, rngState: rngAfterEffects });
                    const updated = { ...s, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: d.discard };
                    seatsAfterEffects = seatsAfterEffects.map(x => (x.seat === s.seat ? updated : x));
                    rngAfterEffects = d.rngState;
                  }
                }
              }
              if (e.kind === 'martialArtsChoice') {
                // AC-000 Martial Arts: choose +10 damage to Knife/Melee OR attach for double damage at turn start
                promptKind = 'martialArtsChoice';
                promptOptions = ['+10 Damage to Knife/Melee', 'Attach for Double Damage'];
              }
              if (e.kind === 'tacticalAdvanceChooseType') {
                // AC-003 Tactical Advance: choose weapon type for +5 damage
                promptKind = 'tacticalAdvanceChooseType';
                promptOptions = ['Pistol', 'Shotgun', 'Magnum', 'Rifle', 'Machine Gun', 'Melee', 'Knife', 'Explosive'];
              }
              if (e.kind === 'mysteriousFindRoll') {
                // AC-003 Mysterious Find: roll d6 for cards/ammo/gold
                promptKind = 'mysteriousFindRoll';
                promptOptions = ['Roll'];
              }
            }

      // Create prompt if promptKind was set in the loop above
      if (promptKind !== undefined && promptOptions !== undefined) {
        finalPrompts = [
          ...finalPrompts,
          {
            id: 'p' + (finalPrompts.length + state.prompts.length + 1),
            seat,
            text: def.text,
            options: promptOptions,
            payload: { kind: promptKind, instanceId },
          },
        ];
      }

      return {
              ...state,
              ...nextBase,
              seats: seatsAfterEffects.map(s => applyArchrival(s)),
              prompts: finalPrompts,
              rngState: rngAfterEffects,
            };
          }

          case 'playItem': {
                 const { seat, instanceId } = action;
                 const player = state.seats[seat] as PlayerState;
                 const def = cardDef(state, instanceId) as CardDef;

                const played = withBonusesAndDraws(
                        { ...player, hand: player.hand.filter(id => id !== instanceId) },
                        def,
                        state.rngState,
                      );
                      const newRemoved = [...state.removed, instanceId];

                      let prompts = state.prompts;
                      let hp = played.player.hp;
                      let maxHp = played.player.maxHp;
                      let promptKind: string | undefined;
                      // Alliance Partner Modification: the Partner has its own
                      // Health, and it is a separate target. Only the Red Herb
                      // heals both characters at once — First Aid Spray and the
                      // Green Herb heal exactly ONE character.
                      const partnerHp0 = played.player.partnerInstanceId !== undefined
                        ? (played.player.partnerHp ?? player.partnerHp)
                        : undefined;
                      let partnerHp = partnerHp0;
                      const partnerMaxHp = played.player.partnerMaxHp ?? player.partnerMaxHp ?? played.player.maxHp;
                      const healTarget: 'main' | 'partner' = action.healTarget ?? 'main';
                      const partnerAlive = played.player.partnerInstanceId !== undefined;
                      let weaponDamageBonusThisTurn = played.player.weaponDamageBonusThisTurn ?? 0;
                      /** Heal exactly one character; undefined amount = to full. */
                      const healOne = (amount: number | undefined): void => {
                        const shortSupplys = hasShortSupplys(state);
                        if (healTarget === 'partner' && partnerHp !== undefined) {
                          if (amount === undefined) {
                            // Heal to full - calculate amount first
                            const fullHeal = partnerMaxHp - partnerHp;
                            if (shortSupplys && fullHeal > 0) {
                              const { actualHeal, bonusDamage } = applyShortSupplysHeal(fullHeal);
                              partnerHp = Math.min(partnerHp + actualHeal, partnerMaxHp);
                              weaponDamageBonusThisTurn += bonusDamage;
                            } else {
                              partnerHp = partnerMaxHp;
                            }
                          } else {
                            if (shortSupplys && amount > 0) {
                              const { actualHeal, bonusDamage } = applyShortSupplysHeal(amount);
                              partnerHp = Math.min(partnerHp + actualHeal, partnerMaxHp);
                              weaponDamageBonusThisTurn += bonusDamage;
                            } else {
                              partnerHp = Math.min(partnerHp + amount, partnerMaxHp);
                            }
                          }
                        } else {
                          if (amount === undefined) {
                            // Heal to full - calculate amount first
                            const fullHeal = maxHp - hp;
                            if (shortSupplys && fullHeal > 0) {
                              const { actualHeal, bonusDamage } = applyShortSupplysHeal(fullHeal);
                              hp = Math.min(hp + actualHeal, maxHp);
                              weaponDamageBonusThisTurn += bonusDamage;
                            } else {
                              hp = maxHp;
                            }
                          } else {
                            if (shortSupplys && amount > 0) {
                              const { actualHeal, bonusDamage } = applyShortSupplysHeal(amount);
                              hp = Math.min(hp + actualHeal, maxHp);
                              weaponDamageBonusThisTurn += bonusDamage;
                            } else {
                              hp = Math.min(hp + amount, maxHp);
                            }
                          }
                        }
                      };
                      const healEffects = (def.itemEffects ?? []).filter(
                        e => e.kind === 'healToFull' || e.kind === 'healFixed20OrTrashWithSecondFor60',
                      );
                      // A partner is alive and the player has not named a
                      // target: ask first, then apply the heal on resolution.
                      const needsTargetPrompt = healEffects.length > 0 && partnerAlive && action.healTarget === undefined;
                      if (needsTargetPrompt) {
                        promptKind = healEffects[0]?.kind === 'healToFull' ? 'healTarget' : 'healGreenHerb';
                      }
                      let trashGreenHerbId: string | undefined;
                      let returnToMarket = false;
                for (const e of def.itemEffects ?? []) {
                        if (needsTargetPrompt && (e.kind === 'healToFull' || e.kind === 'healFixed20OrTrashWithSecondFor60')) {
                          continue; // applied when the target is chosen
                        }
                        if (e.kind === 'healToFull') {
                          healOne(undefined);
                        } else if (e.kind === 'plusMaxHp') {
                          maxHp = played.player.maxHp + e.amount;
                        } else if (e.kind === 'healFixed20OrTrashWithSecondFor60') {
                          promptKind = 'healGreenHerb';
                        } else if (e.kind === 'healSelfAndPartnerToFull') {
                          const green = played.player.hand.find(id => isGreenHerb(state, id));
                          if (green) {
                            trashGreenHerbId = green;
                            hp = maxHp;
                            if (partnerHp !== undefined) partnerHp = partnerMaxHp;
                          }
                        } else if (e.kind === 'returnToMarketAndRemoveCounters') {
                          // Unofficial Expansion: EX-007 Blue Herb returns to its
                          // own market pile (reusable) instead of being removed.
                          returnToMarket = true;
                        }
                      }
                // Claire Redfield (Alliance): L1 +amount damage when a Green or
                // Red Herb is trashed from hand; L2 double damage when both are.
                const claireAbilities = seatAbilities(state, seat);
                const claireBonus = herbTrashDamageBonus(claireAbilities);
                const claireDoubleDamage = hasDoubleDamageOnBothHerbs(claireAbilities);
                const trashedHerbKinds = new Set(def.itemEffects?.map(e => e.kind) ?? []);
                const trashedGreen = trashedHerbKinds.has('healFixed20OrTrashWithSecondFor60');
                const trashedRed = trashedHerbKinds.has('healSelfAndPartnerToFull');
                if (promptKind !== undefined) {
                  // Heal 60 is only legal when the player still holds another Green
                  // Herb in hand (the played one is already gone). Both are trashed.
                  // With a partner alive the options name the target too.
                  const hasSecondHerb = played.player.hand.some(id => isGreenHerb(state, id));
                  const amounts: readonly number[] = hasSecondHerb ? [20, 60] : [20];
                  const targets: readonly string[] = partnerAlive ? ['Main', 'Partner'] : ['Main'];
                  const options: string[] = [];
                  if (promptKind === 'healTarget') {
                    options.push('Heal Main', 'Heal Partner');
                  } else {
                    // Without a partner the labels stay the plain
                    // "Heal 20" / "Heal 60" they have always been.
                    for (const t of targets) {
                      for (const a of amounts) options.push(partnerAlive ? `Heal ${t} ${a}` : `Heal ${a}`);
                    }
                  }
                  prompts = [
                    ...prompts,
                    {
                      id: 'p' + (state.prompts.length + 1),
                      seat,
                      text: def.text,
                      options,
                      payload: { kind: promptKind },
                    },
                  ];
                }

                // Antique Coin (IT-000): trashing it gains one weapon from the
                // Resource Area costing no more than the coin's own cost. The
                // coin itself is already in `removed` at this point; the choice
                // of weapon follows. With no eligible weapon the coin is simply
                // trashed and no prompt is raised.
                const coinEffect = (def.itemEffects ?? []).find(e => e.kind === 'gainWeaponFromMarket');
                if (coinEffect !== undefined && coinEffect.kind === 'gainWeaponFromMarket') {
                  const weaponIds = marketWeaponIds(state, coinEffect.costLimit);
                  if (weaponIds.length > 0) {
                    prompts = [
                      ...prompts,
                      {
                        id: `antiqueCoin-${seat}-v${state.version}`,
                        seat,
                        text: def.text,
                        options: weaponIds,
                        payload: { kind: 'antiqueCoinChooseWeapon' },
                      },
                    ];
                  }
                }

      const newPlayer: PlayerState = {
        ...played.player,
        hp,
        maxHp,
        ...(partnerHp !== undefined ? { partnerHp } : {}),
        weaponDamageBonusThisTurn:
          weaponDamageBonusThisTurn + ((trashedGreen || trashedRed) ? claireBonus : 0),
        ...(trashedRed && trashGreenHerbId !== undefined && claireDoubleDamage
          ? { damageMultiplierThisTurn: (played.player.damageMultiplierThisTurn ?? 1) * 2 }
          : {}),
      };
      // Red Herb: trash green herb + heal partner to full.
      let finalRemoved = newRemoved;
      let finalSeats = state.seats.map(s => (s.seat === seat ? newPlayer : s));
      if (trashGreenHerbId) {
        finalRemoved = [...finalRemoved, trashGreenHerbId];
        finalSeats = finalSeats.map(s => {
          if (s.seat === seat) {
            return { ...s, hand: s.hand.filter(id => id !== trashGreenHerbId), hp };
          }
          return s;
        });
        // heal partner: partner is part of same player's partnerInstanceId; if partner exists, heal them via partner HP? Partner HP stored on player? 
      }
      // Unofficial Expansion: EX-007 Blue Herb returns to its OWN market pile
      // (so it can be bought again) instead of being removed, and every Poison
      // counter on the player's Character returns to the shared supply.
      let finalMarketPiles = state.marketPiles;
      let finalCards = state.cards;
      if (returnToMarket) {
        // Its home pile. Custom cards get a `custom-<id>` pile, but a
        // single-card pile is EMPTY once the only copy has been bought, so
        // scanning for a surviving copy is not enough — fall back to the
        // convention. With no home pile at all the herb is simply removed
        // (never orphaned in no zone).
        const pileId = Object.values(state.marketPiles)
          .find(p => p.cards.some(id => state.cards[id]?.cardId === def.id))?.pileId
          ?? (state.marketPiles[`custom-${def.id}`] !== undefined ? `custom-${def.id}` : undefined);
        const pile = pileId !== undefined ? state.marketPiles[pileId] : undefined;
        if (pileId !== undefined && pile !== undefined) {
          finalRemoved = finalRemoved.filter(id => id !== instanceId);
          finalMarketPiles = { ...state.marketPiles, [pileId]: { ...pile, cards: [instanceId, ...pile.cards] } };
          const existing = state.cards[instanceId];
          if (existing !== undefined) {
            finalCards = {
              ...state.cards,
              [instanceId]: { instanceId, cardId: existing.cardId, location: { zone: 'marketPile', index: 0, pileId } },
            };
          }
        }
      }
      const cleared = returnCountersToSupply(
        { ...state, cards: finalCards, marketPiles: finalMarketPiles, removed: finalRemoved },
        seat,
      );
      return {
        ...cleared,
        ...nextBase,
        seats: cleared.seats.map(s => (s.seat === seat ? { ...(finalSeats[seat] as PlayerState), counters: s.counters } : s)),
        removed: cleared.removed,
        marketPiles: cleared.marketPiles,
        cards: cleared.cards,
        prompts,
        rngState: played.rngState,
        ...((state.storyModeBossShuffleActive || (def.actionEffects ?? []).some(e => e.kind === 'storyModeBossShuffleToTop10'))
          ? { storyModeBossShuffleActive: true }
          : {}),
      };
          }

          case 'playAmmo': {
            const { seat, instanceId } = action;
            const player = state.seats[seat] as PlayerState;
            const def = cardDef(state, instanceId) as CardDef;

            const played = withBonusesAndDraws(
              {
                ...player,
                hand: player.hand.filter(id => id !== instanceId),
                playArea: [...player.playArea, instanceId],
              },
              def,
              state.rngState,
            );

            // Claire: ammunition cards give extra Ammo (L1) / Gold (L2).
            const extra = ammunitionCardBonus(seatAbilities(state, seat), def);
            // Low on Ammo: ammunition cards grant N less Ammo
            const ammoReduction = mansionAmmoBonusReduction(state);
            const adjustedAmmoBonus = Math.max((played.player.turnAmmo - player.turnAmmo) - ammoReduction, 0);
            const playerAfterBonus: PlayerState = {
              ...played.player,
              turnAmmo: player.turnAmmo + adjustedAmmoBonus + extra.ammo,
              turnGold: played.player.turnGold + extra.gold,
            };

            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? playerAfterBonus : s)),
              rngState: played.rngState,
            };
          }

    case 'explore': {
          const { seat, weapons, exploreCount, ammoByWeapon } = action;
          let player = state.seats[seat] as PlayerState;

          // Survival Horror: before exploring, roll a d6 and apply the result.
          // The die roll is handled via a prompt so the player sees the result.
          // Check both for an active prompt AND the flag to prevent re-rolling
          // when the explore action is re-dispatched after prompt resolution.
          if (hasSurvivalHorror(state) && !state.survivalHorrorRolledThisTurn && !state.prompts.some(p => p.payload?.kind === 'survivalHorrorRoll')) {
            const roll = nextInt(makeRng(state.rngState), 6).value + 1;
            const newRng = nextInt(makeRng(state.rngState), 6).rng.s;
            return {
              ...state,
              rngState: newRng,
              prompts: [...state.prompts, {
                id: `survival-horror-${seat}-${state.version}`,
                seat,
                text: `Survival Horror: rolled a ${roll}. Apply the effect.`,
                options: ['Continue'],
                payload: { kind: 'survivalHorrorRoll', roll: String(roll), seat: String(seat) },
              }],
            };
          }

          // Alliance Partner Modification: the leader is chosen before the
          // reveal (action.leader); the persisted partnerLeading flag is the
          // fallback for older clients that set it via chooseExploreLeader.
          const exploreLeader: 'main' | 'partner' =
            action.leader ?? (player.partnerLeading === true ? 'partner' : 'main');

          // Ammo comes from the cumulative ammo resource, not from cards in hand.
          // Passive abilities can reduce the cost (Leon L1 pistols, Sheva L2 rifles).
          // The leading character is the one fighting, so its abilities apply —
          // a partner-led explore uses the Partner's (level derived from the
          // Main character's Decorations), not the Main character's.
          const abilities = leaderAbilities(state, seat, exploreLeader);
          // Chris Redfield (Alliance): L1 -20 ammo when using exactly one
          // weapon; L2 -20 ammo for the weapon types he chose this turn.
          const chrisSingleDiscount = weapons.length === 1 ? singleWeaponAmmoDiscount(abilities) : 0;
          const chrisTypeDiscount = chosenWeaponTypeAmmoDiscount(abilities);
          const chrisTypeDiscountTypes = player.chrisAmmoDiscountTypes ?? [];
          const requiredAmmo = requiredAmmoForExplore(state, seat, weapons, abilities);
          const turnAmmoAfter = Math.max(player.turnAmmo - requiredAmmo, 0);

          // WE-025 Blowback Pistol: "Discard any number of 'Pistol' cards from
          // hand to play. +10 damage per card discarded." The discarded cards
          // arrive on the explore action (see validateAction).
          const discardedPistols = action.discardedPistols ?? [];
          const blowbackPerCard = weapons.reduce((sum, id) => {
            const eff = cardDef(state, id)?.weaponEffects?.find(e => e.kind === 'discardPistolsForDamage');
            return sum + (eff !== undefined && eff.kind === 'discardPistolsForDamage' ? eff.amount : 0);
          }, 0);
          const blowbackBonus = blowbackPerCard * discardedPistols.length;

          const handAfter = player.hand.filter(id => !weapons.includes(id) && !discardedPistols.includes(id));
          const discardAfterPistols: string[] = [...player.discard, ...discardedPistols];
          // CW-006 Kukri: weapons with playFromDiscardOnExplore can be played from discard.
          // Remove them from discard and treat as fresh weapons (they go to play area).
          const discardWeaponIds = weapons.filter(id =>
            player.discard.includes(id) && canPlayFromDiscard(state, seat, id)
          );
          const discardAfterKukri = discardAfterPistols.filter(id => !discardWeaponIds.includes(id));
          // Alliance Partner Modification: weapons attached to the Partner take
          // part in the explore but stay attached — they are never moved to the
          // play area, trashed, or removed by use.
          const partnerWeaponSet = new Set(player.partnerAttached ?? []);
          // Leon L2 pistol reuse: a pistol already in the play area stays there
          // (it was not just moved from hand); only fresh weapons get added
          // below. A weapon declared twice is still one card, so de-dupe.
          const freshWeapons = uniqueWeapons(weapons).filter(id => !player.playArea.includes(id) && !partnerWeaponSet.has(id));
          // Explosive weapons are trashed after use (all-explosives rule);
          // Jill L2 sends them to her discard pile instead. WE-018/we-018g
          // Grenade Launcher does the same for every Explosive used this turn.
          const toDiscardExplosives = explosivesGoToDiscard(abilities)
            || weapons.some(id => cardDef(state, id)?.weaponEffects?.some(
              e => e.kind === 'explosivesToDiscardInsteadOfTrash') === true);
          const explosiveIds: string[] = [];
          const playedWeaponIds: string[] = [];
          for (const id of freshWeapons) {
            if (isExplosive(cardDef(state, id))) {
              explosiveIds.push(id);
            } else {
              playedWeaponIds.push(id);
            }
          }
          let playAreaAfter = [...player.playArea, ...playedWeaponIds];
          // WE-030 Hand Cannon: "Trash one ammunition from your play area."
          const trashAmmoCount = weapons.reduce((sum, id) => {
            const eff = cardDef(state, id)?.weaponEffects?.find(e => e.kind === 'trashAmmoFromPlayAreaOnUse');
            return sum + (eff !== undefined && eff.kind === 'trashAmmoFromPlayAreaOnUse' ? eff.count : 0);
          }, 0);
          const trashedAmmo: string[] = [];
          for (let i = 0; i < trashAmmoCount; i++) {
            const idx = playAreaAfter.findIndex(id => cardDef(state, id)?.type === 'ammunition');
            if (idx < 0) break;
            trashedAmmo.push(playAreaAfter[idx] as string);
            playAreaAfter = [...playAreaAfter.slice(0, idx), ...playAreaAfter.slice(idx + 1)];
          }
          const toTrashAfterUse = uniqueWeapons(weapons).filter(id => {
            if (partnerWeaponSet.has(id)) return false;
            const def = cardDef(state, id);
            return def?.weaponEffects?.some(e =>
              e.kind === 'trashAfterUse' ||
              (e.kind === 'grantExploreAndSuppressLowHpInfected' && e.trashAfterUse === true));
          });
          let removedAfter = toDiscardExplosives
            ? [...state.removed, ...trashedAmmo]
            : [...state.removed, ...explosiveIds, ...toTrashAfterUse, ...trashedAmmo];
          const discardAfterExplosives = toDiscardExplosives
            ? [...discardAfterKukri, ...explosiveIds]
            : discardAfterKukri;
          const exploresLeft = player.exploresLeft - exploreCount;
          // grantExplores weapon effect: +explores when this weapon is used.
          // The player may spend those explores in THIS action (see validate)
          // or save them for a later, separate explore.
          const grantedExplores = grantedExploresFor(weapons.map(id => cardDef(state, id)));

          // Nightmare: weapon effects that fire when the weapon is used
          // (WE-032/033 Silver Ghost / Punisher, WE-036/037 rifles, WE-038).
          const nightmareGains = nightmareWeaponGains(weapons, state);
          const nightmarePrompts = nightmareWeaponPrompts(state, seat, weapons);
          if (nightmarePrompts.length > 0) {
            state = { ...state, prompts: [...state.prompts, ...nightmarePrompts] };
          }

          const weaponDefs = weapons.map(id => cardDef(state, id));
          // plusDamagePerActionPlayedThisTurn: +amount per Action card in play area this turn.
          const actionPlayedCount = player.playArea.filter(id => {
            const ci = state.cards[id];
            const cd = ci ? state.cardDefs[ci.cardId] : undefined;
            return cd?.type === 'action';
          }).length;
          // plusDamageIfSelfHpAtLeast: +amount if player HP >= threshold.
          // revealTopOfInventoryCostGate: if top of inventory cost >= threshold, +amount.
          const topInvCard = player.inventory[0];
          const topInvDef = topInvCard ? cardDef(state, topInvCard) : undefined;
          const costGateBonus = weaponDefs.reduce((sum, w) => {
            const eff = w?.weaponEffects?.find(e => e.kind === 'revealTopOfInventoryCostGate');
            if (eff && eff.kind === 'revealTopOfInventoryCostGate' && (topInvDef?.cost ?? 0) >= eff.threshold) {
              return sum + eff.amount;
            }
            return sum;
          }, 0);
          // plusDamagePerActionPlayedThisTurn
          // plusDamageWhenUsingMultipleWeapons: +amount when using >1 weapon.
          const multiWeaponBonus = weaponDefs.reduce((sum, w) => {
            const eff = w?.weaponEffects?.find(e => e.kind === 'plusDamageWhenUsingMultipleWeapons');
            return sum + (eff && eff.kind === 'plusDamageWhenUsingMultipleWeapons' && weapons.length > 1 ? eff.amount : 0);
          }, 0);
          // plusDamagePerActionPlayedThisTurn
          const perActionBonus = weaponDefs.reduce((sum, w) => {
            const eff = w?.weaponEffects?.find(e => e.kind === 'plusDamagePerActionPlayedThisTurn');
            return sum + (eff && eff.kind === 'plusDamagePerActionPlayedThisTurn' ? eff.amount * actionPlayedCount : 0);
          }, 0);
          // plusDamageIfSelfHpAtLeast: +amount if player HP >= threshold.
          const selfHpBonus = weaponDefs.reduce((sum, w) => {
            const eff = w?.weaponEffects?.find(e => e.kind === 'plusDamageIfSelfHpAtLeast');
            return sum + (eff && eff.kind === 'plusDamageIfSelfHpAtLeast' && player.hp >= eff.hp ? eff.amount : 0);
          }, 0);
          // Mansion attachment effects: plusDamageForWeaponTag (e.g., Close Combat: Knife +10, Melee +5)
          const attachmentDamageByTag = new Map<string, number>();
          for (const attId of state.mansionAttachments ?? []) {
            const attDef = cardDef(state, attId);
            if (attDef?.attachmentEffects === undefined) continue;
            for (const effect of attDef.attachmentEffects) {
              if (effect.kind === 'plusDamageForWeaponTag') {
                const current = attachmentDamageByTag.get(effect.tag) ?? 0;
                attachmentDamageByTag.set(effect.tag, current + effect.amount);
              }
            }
          }
          // RC-002 Rebecca Chambers L2: Machine Gun weapons get +N damage.
          const rebeccaMachineGunBonus = abilities
            .filter(a => a.kind === 'plusDamageForWeaponTag' && a.tag === 'machineGun')
            .reduce((sum, a) => sum + (a.kind === 'plusDamageForWeaponTag' ? a.amount : 0), 0);
          if (rebeccaMachineGunBonus > 0) {
            const current = attachmentDamageByTag.get('machineGun') ?? 0;
            attachmentDamageByTag.set('machineGun', current + rebeccaMachineGunBonus);
          }

          const exploreWeapons = weaponDefs.map((w, i) => {
            const instId = weapons[i];
            const isGatling = w?.weaponEffects?.some(e => e.kind === 'damageEqualsCurrentAmmo');
            const isX = w?.xAmmo === true;
            const assigned = isX ? Math.min(ammoByWeapon?.[instId ?? ''] ?? 0, w?.ammoCap ?? 999) : 0;
            const coup = player.pendingCoupDeGrace;
            const noActionsInPlayArea = player.playArea.every(pid => cardDef(state, pid)?.type !== 'action');
            const bowBonus = (w?.weaponEffects?.some(e => e.kind === 'plusDamageIfNoActionsInPlayArea') && noActionsInPlayArea)
              ? (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfNoActionsInPlayArea') as { amount: number }).amount
              : 0;
            const xpBonus = (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfCharacterXpAtLeast') !== undefined &&
              (player.xp ?? 0) >= (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfCharacterXpAtLeast') as { threshold: number }).threshold)
              ? (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfCharacterXpAtLeast') as { amount: number }).amount
              : 0;
            // CW-024 Haymaker: +N damage per other Melee weapon used this turn.
            const haymakerBonus = (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerOtherMeleeUsedThisTurn') !== undefined)
              ? (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerOtherMeleeUsedThisTurn') as { amount: number }).amount
                * weapons.filter(id => {
                  if (id === instId) return false;
                  const d = cardDef(state, id);
                  return (d?.weaponTags ?? []).includes('melee');
                }).length
              : 0;
            return {
              damage: isGatling ? player.turnAmmo : isX ? assigned : ((w?.damage ?? 0) + (player.weaponDamageBonusById?.[instId ?? ''] ?? 0) + (coup !== undefined && coup.weaponInstanceId === instId ? coup.amount : 0) + bowBonus + xpBonus + haymakerBonus + ((w?.weaponTags ?? []).includes('knife') || (w?.weaponTags ?? []).includes('melee') ? (player.knifeMeleeDamageBonusThisTurn ?? 0) : 0) + (player.tacticalAdvanceType !== undefined && (w?.weaponTags ?? []).map(t => t.toLowerCase()).includes(player.tacticalAdvanceType) ? (player.tacticalAdvanceBonus ?? 0) : 0) + (player.desperateForcesTypes?.includes(w?.weaponType ?? '') ? 10 : 0) + (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerNonItemGainedThisTurn')?.amount ?? 0) * (player.gainedThisTurn ?? []).filter(id => { const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.type !== 'item'; }).length + (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerCardGainedThisTurn')?.amount ?? 0) * (player.gainedThisTurn ?? []).length + ((w?.weaponEffects?.some(e => e.kind === 'plusDamageIfNightTime') && (new Date().getHours() >= 20 || new Date().getHours() <= 6)) ? (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfNightTime') as {amount:number}).amount : 0) + attachmentDamageBonusForTags(w?.weaponTags ?? [], attachmentDamageByTag)),
              ammoReq: isGatling ? 0 : isX ? assigned : (() => {
                const baseReq = exploreAmmoReq(state, seat, instId ?? '', weapons.length, abilities);
                // Low on Ammo: pistols cost 0 ammo but are trashed at end of turn
                if (hasFreePistolTrashAtEnd(state) && (w?.weaponTags ?? []).includes('pistol')) {
                  return 0;
                }
                return baseReq;
              })(),
              weaponEffects: (instId !== undefined && player.copiedWeaponEffects?.instanceId === instId)
                ? [...(w?.weaponEffects ?? []), ...player.copiedWeaponEffects.effects]
                : w?.weaponEffects,
              tags: w?.weaponTags,
            };
          });

          // David King (Outbreak) L2: when he uses a Knife weapon, he may also
          // use one from his discard pile.
          const davidAbilities = abilities;
          if (davidAbilities.some(a => a.kind === 'knifeFromDiscardForExplore')) {
            const usesKnife = exploreWeapons.some(w => (w.tags ?? []).includes('knife'));
            if (usesKnife) {
              const discardKnife = player.discard.find(id => {
                const d = cardDef(state, id);
                return d?.type === 'weapon' && (d.weaponTags ?? []).includes('knife');
              });
              if (discardKnife !== undefined) {
                const kd = cardDef(state, discardKnife);
                exploreWeapons.push({
                  damage: kd?.damage ?? 0,
                  ammoReq: 0,
                  weaponEffects: kd?.weaponEffects,
                  tags: kd?.weaponTags,
                });
              }
            }
          }

          // Passive damage abilities
          // Jill L1 explosives, Chris L2 per-Infected-fought (multi-explore
          // fights exploreCount Infected in one attack).
          const abilityDamage =
            passiveDamageBonus(abilities, weaponDefs, exploreCount, player.hand.length) +
            exploreBigHandBonus(abilities, state.seats) +
            exploreActionsBonus(abilities, playAreaAfter.map(id => cardDef(state, id)?.type ?? ''), t => t === 'action') +
            partnerAttachedDamageBonus(abilities, player.partnerAttached) +
            plusDamageIfTwoOrMoreWeapons(abilities, weaponDefs.length) +
            dualWieldBonus(state, seat, abilities, weapons) +
            exploreBonusIfAmmoAbove(abilities, player.turnAmmo) +
            exploreDamageIfNoPartnerLowHp(abilities, player.partnerInstanceId, player.hp) +
            exploreDamageIfHpAtMost(abilities, player.hp) +
            exploreSkillDamageBonus(activeSkillEffects(state, seat), weaponDefs, state, seat, weapons);
          // Lonewolf (AC-032): +amount explore damage per card in the discard
          // pile, while its action card is in the play area this turn.
          const perDiscardCardBonus = player.playArea.reduce((sum, id) => {
            const cd = cardDef(state, id);
            return sum + (cd?.actionEffects ?? []).reduce((a, e) =>
              e.kind === 'onExploreWeaponDamagePerDiscardCard' ? a + e.amount * player.discard.length : a, 0);
          }, 0);
          // Ammo cards in the play area (WE-034 Mine Thrower).
          const ammoCardsInPlayArea = playAreaAfter.filter(id => cardDef(state, id)?.type === 'ammunition').length;
          // AC-014 Star-Crossed Duo: if partner is leading with this attached, +10 damage.
          const starCrossedBonus = state.seats.some(s => s.seat !== seat && (s.partnerAttached ?? []).some(id => {
            const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.id === 'ac-014';
          })) ? 10 : 0;
          // Weapon effects like "plusDamageIfAmmoAbove" read the ammo the player
          // has available for this attack — the pool before it is spent.
          const ammoForEffects = player.turnAmmo;
          // Wesker L1: exploring grants +Gold for the turn.
          const turnGoldAfter = player.turnGold + exploreGoldBonus(abilities);

      // RNG threading for the explore (single- and multi-explore share these).
      let currentRng = state.rngState;
      // CW-023 Combo Punch: discard from inventory top until a Melee weapon is
      // discarded, then move that weapon to hand.
      const applyComboPunch = (p: PlayerState): PlayerState => {
        const hasComboPunch = weapons.some(id => {
          const d = cardDef(state, id);
          return (d?.weaponEffects ?? []).some(e => e.kind === 'discardInventoryUntilMeleeWeapon');
        });
        if (!hasComboPunch) return p;
        let inventory = [...p.inventory];
        let discard = [...p.discard];
        let hand = [...p.hand];
        while (inventory.length > 0) {
          const top = inventory.shift();
          if (top === undefined) break;
          const def = cardDef(state, top);
          if (def?.type === 'weapon' && (def.weaponTags ?? []).includes('melee')) {
            hand.push(top);
            break;
          }
          discard.push(top);
        }
        return { ...p, hand, inventory, discard };
      };
      // Applies the Nightmare on-use weapon gains (+cards/+actions/+gold) to a
      // post-explore seat. Drawn cards come off the top of the inventory.
      // Also applies CW-023 Combo Punch.
      const applyNightmareGains = (p: PlayerState): PlayerState => {
        let np = p;
        if (nightmareGains.cards !== 0 || nightmareGains.actions !== 0 || nightmareGains.gold !== 0) {
          np = { ...np, actionsLeft: np.actionsLeft + nightmareGains.actions, turnGold: np.turnGold + nightmareGains.gold };
          if (nightmareGains.cards > 0) {
            const d = drawWithReshuffle({ deck: np.inventory, discard: np.discard, count: nightmareGains.cards, rngState: currentRng });
            np = { ...np, hand: [...np.hand, ...d.hand], inventory: d.deck, discard: d.discard };
            currentRng = d.rngState;
          }
        }
        np = applyComboPunch(np);
        return np;
      };
      const rngShuffle = (items: readonly string[]): string[] => {
        const r = shuffle(makeRng(currentRng), items);
        currentRng = r.rng.s;
        return r.value;
      };

      // WE-019 Telescopic Sight Rifle: reveal from the BOTTOM of the Mansion.
      const revealFromBottom = weapons.some(id => cardDef(state, id)?.weaponEffects?.some(
        e => e.kind === 'revealFromMansionBottom') === true);
      const rev = revealFromBottom
        ? revealBottom({ deck: state.mansionDeck })
        : revealTop({ deck: state.mansionDeck });
      const revealedInstanceId = rev.revealedInstanceId;
      const revealedDef = cardDef(state, revealedInstanceId);
      // CI-002 Infected Crow: a single explore that reveals it becomes a
      // combined engagement (the chained card joins the same battle).
      const crowChainPending = exploreCount === 1 && revealedDef?.type === 'infected' &&
        (revealedDef.infectedEffects ?? []).some(e => e.kind === 'onRevealRevealNextMansionCard');
      // -----------------------------------------------------------------
      // MULTI-EXPLORE (exploreCount > 1)
      // Rulebook "Extra Explore": reveal N cards one at a time and battle ALL
      // revealed Infected as ONE combined engagement — the player's total
      // Damage is compared against the combined Health; on failure the player
      // takes the combined Damage and every undefeated Infected goes to the
      // bottom of the Mansion.
      //
      // KNOWN LIMITATION: the off-turn reactive windows (Jill's Flash Grenade
      // vs a Las Plagas reveal, AC-018 Uroboros Injection, AC-042 Fight or
      // Flight) are single-explore only; a multi-explore does not offer them.
      // -----------------------------------------------------------------
      if (exploreCount > 1 || crowChainPending) {
        const leadingIsPartner = exploreLeader === 'partner' && !!player.partnerInstanceId;
        let mDeck = rev.mansion.deck;
        const revealedIds: string[] = [revealedInstanceId];
        for (let i = 1; i < exploreCount; i++) {
          const r = revealFromBottom
            ? revealBottom({ deck: mDeck })
            : revealTop({ deck: mDeck });
          revealedIds.push(r.revealedInstanceId);
          mDeck = r.mansion.deck;
        }

        // Events that reveal MORE Mansion cards (MA-039 x2, MA-072 x1): the
        // extra cards join the same engagement. Non-Infected cards revealed by
        // those events are shuffled back, not offered take/bottom.
        const eventIdsToRemove: string[] = [];
        const expansionIds: string[] = [];
        const shuffleBackIds: string[] = [];
        let laserTargeting = false;
        const barrelIds: string[] = [];
        const trapIds: string[] = [];
        // EV-002 Nemesis Pursuit revealed anywhere in this batch.
        let nemesisPursuit = false;
        let expanding = true;
        // CI-002 Infected Crow chains: each Crow reveals one more Mansion
        // card. Mark them so the re-scan does not expand the same Crow twice.
        const crowExpanded = new Set<string>();
        while (expanding) {
          expanding = false;
          for (const id of [...revealedIds]) {
            const d = cardDef(state, id);
            if (d === undefined) continue;
            if (d.type === 'infected') {
              if (crowExpanded.has(id)) continue;
              if (!(d.infectedEffects ?? []).some(e => e.kind === 'onRevealRevealNextMansionCard')) continue;
              crowExpanded.add(id);
              if (deckCount({ deck: mDeck }) > 0) {
                const r = revealTop({ deck: mDeck });
                revealedIds.push(r.revealedInstanceId);
                expansionIds.push(r.revealedInstanceId);
                mDeck = r.mansion.deck;
              }
              expanding = true;
              continue;
            }
            if (d.type !== 'event' || eventIdsToRemove.includes(id)) continue;
            if (d.id === 'ma-039') {
              eventIdsToRemove.push(id);
              for (let k = 0; k < 2 && deckCount({ deck: mDeck }) > 0; k++) {
                const r = revealTop({ deck: mDeck });
                revealedIds.push(r.revealedInstanceId);
                expansionIds.push(r.revealedInstanceId);
                mDeck = r.mansion.deck;
              }
              expanding = true;
            } else if (d.id === 'ma-072') {
              eventIdsToRemove.push(id);
              if (deckCount({ deck: mDeck }) > 0) {
                const r = revealTop({ deck: mDeck });
                revealedIds.push(r.revealedInstanceId);
                expansionIds.push(r.revealedInstanceId);
                mDeck = r.mansion.deck;
              }
              expanding = true;
            } else if (d.id === 'ma-038' || d.id === 'ma-056o' || d.id === 'ma-057o' || d.id === 'ma-040') {
              eventIdsToRemove.push(id);
              if (d.id === 'ma-038') barrelIds.push(id);
              else if (d.id === 'ma-040') laserTargeting = true;
              else trapIds.push(id);
            } else if (isNemesisPursuit(d)) {
              // EV-002: removed from the game; the buff is applied below and
              // the explore-again obligation on the exploring seat.
              eventIdsToRemove.push(id);
              nemesisPursuit = true;
            }
          }
        }

        // EV-002 Nemesis Pursuit: "this turn, all infected gain +10 health and
        // +20 damage" — the Infected revealed in THIS battle are included.
        if (nemesisPursuit) state = withNemesisPursuitBuff(state);

        const infectedEntries: Array<{ id: string; def: CardDef }> = [];
        const nonInfectedIds: string[] = [];
        const zombieGrabIds: string[] = [];
        const attachmentIds: string[] = [];
        for (const id of revealedIds) {
          if (eventIdsToRemove.includes(id)) continue;
          const d = cardDef(state, id);
          if (d === undefined) continue;
          if (d.type === 'infected') infectedEntries.push({ id, def: d });
          // EV-001 Zombie Grab: its OWN reveal branch, never a take/bottom
          // choice or a silent shuffle-back (check BEFORE expansionIds — a
          // Crow chain or MA-039/072 expansion reveal must offer the choice).
          else if (d.type === 'event' && d.id === 'ev-001') zombieGrabIds.push(id);
          // Mansion attachment events: attach to mansion, don't enter normal flow
          else if (d.type === 'event' && d.attachmentMode !== undefined) attachmentIds.push(id);
          else if (expansionIds.includes(id)) shuffleBackIds.push(id);
          else nonInfectedIds.push(id);
        }

        // Process attachment events revealed in multi-explore
        if (attachmentIds.length > 0) {
          const currentAttachments = state.mansionAttachments ?? [];
          let newAttachments = [...currentAttachments];
          const oldCounters = state.attachmentTrashCounts ?? {};
          let newCounters = { ...oldCounters };

          for (const attId of attachmentIds) {
            const attDef = cardDef(state, attId);
            // Use room-level mansionAttachmentMode if set, otherwise fall back to card's attachmentMode
            const effectiveMode = state.mansionAttachmentMode ?? attDef?.attachmentMode ?? 1;
            if (effectiveMode === 1) {
              // Mode 1: replace all existing attachments
              const oldToRemove = [...newAttachments];
              newAttachments = [attId];
              removedAfter = [...removedAfter, ...oldToRemove.filter(id => !removedAfter.includes(id))];
              // Clear counters for old attachments
              newCounters = {};
              for (const [k, v] of Object.entries(oldCounters)) {
                if (k !== attId) newCounters[k] = v;
              }
            } else {
              // Mode 2: append
              newAttachments = [...newAttachments, attId];
            }
          }

          state = {
            ...state,
            mansionAttachments: newAttachments,
            attachmentTrashCounts: newCounters,
          };
        }

        // Unofficial Expansion: EX-002 Special Rocket Launcher — auto-defeats
        // the first revealed Infected with 80+ Health in the batch, then is
        // removed from the game. The auto-defeated Infected still counts as a
        // defeated trophy (Decorations included) but fires no reveal effects.
        const autoDefeatedEntries: Array<{ id: string; def: CardDef }> = [];
        const rocketEntry = infectedEntries.find(({ def }) => specialRocketLauncherId(state, seat, def) !== undefined);
        if (rocketEntry !== undefined) {
          const launcherId = specialRocketLauncherId(state, seat, rocketEntry.def);
          if (launcherId !== undefined) {
            infectedEntries.splice(infectedEntries.indexOf(rocketEntry), 1);
            autoDefeatedEntries.push(rocketEntry);
            removedAfter = [...removedAfter, launcherId];
            state = consumeSpecialRocketLauncher(state, seat, launcherId);
            player = state.seats[seat] as PlayerState;
          }
        }

        // ---- Reveal effects for EVERY revealed Infected ----
        let revealPrompts: Prompt[] = [];
        const revealGains: Array<{ seat: number; cardId: string }> = [];
        const zeroDamageIds: string[] = [];
        const negatedIds = new Set<string>();
        let redirectSeat: number | undefined;
        // Custom card line: CI-003 Osmund Saddler (First Encounter) — each
        // player gains a 10x Ammo. Applied after the explore's seat rebuild.
        let saddlerAmmoGrant = 0;
        const targets: MultiExploreTarget[] = [];
        for (const { id, def } of infectedEntries) {
          // MA-037 Guardian of Insanity: each character takes 10 damage.
          if (def.id === 'ma-037') {
            for (const s of state.seats) {
              const neg = consumeNegateDamage(state, s.seat);
              state = neg.state;
              if (neg.negated) continue;
              const reduce = characterAbilities(state, s.seat).reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
              const ric = applyRicardoDamage(state, s.seat, s.hp ?? 0, Math.max(10 - reduce, 0));
              state = ric.state;
              const newHp = ric.hp;
              state = { ...state, seats: state.seats.map(x => (x.seat === s.seat ? { ...x, hp: newHp } : x)) };
            }
          }
          // MA-031 Proto Tyrant: non-exploring chars with 50+ HP take 40.
          if (def.id === 'ma-031') {
            for (const s of state.seats) {
              if (s.seat === seat || (s.hp ?? 0) < 50) continue;
              const neg = consumeNegateDamage(state, s.seat);
              state = neg.state;
              if (neg.negated) continue;
              const reduce = characterAbilities(state, s.seat).reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
              const ric = applyRicardoDamage(state, s.seat, s.hp ?? 0, Math.max(40 - reduce, 0));
              state = ric.state;
              // JM-001 Jake Muller L1: MA-031's 40 Damage is a qualifying hit.
              state = applyTrashTopFromDiscardOnBigHit(state, s.seat, Math.max(40 - reduce, 0));
              const newHp = ric.hp;
              state = { ...state, seats: state.seats.map(x => (x.seat === s.seat ? { ...x, hp: newHp } : x)) };
            }
          }
          // Mercenaries: Toughness/Luck/redirect reaction is consumed per card.
          const reaction = consumeInfectedEffectReaction(state, seat);
          state = reaction.state;
          if (reaction.negated) negatedIds.add(id);
          redirectSeat = reaction.redirectSeat;
          let hpBonus = 0;
          let atkBonus = 0;
          if (!reaction.negated) {
            const ctx = { seat, revealedInstanceId: id, revealedDef: def, weapons, handAfter, attachedInfectedCount: player.attached.length, characterXp: player.xp ?? 0 };
            const r1 = applyMercenariesRevealEffects(state, ctx);
            state = r1.state;
            revealPrompts.push(...r1.prompts);
            zeroDamageIds.push(...r1.zeroDamageWeaponIds);
            revealGains.push(...r1.gains);
            saddlerAmmoGrant = Math.max(saddlerAmmoGrant, saddlerAmmoGrantPerPlayer(def));
            const r2 = applyNightmareRevealEffects(state, { seat, revealedInstanceId: id, revealedDef: def, weapons });
            state = r2.state;
            revealPrompts.push(...r2.prompts);
            const r3 = applyOutbreakRevealEffects(state, { seat, revealedInstanceId: id, revealedDef: def, weapons, attached: player.attached });
            state = r3.state;
            revealPrompts.push(...r3.prompts);
            zeroDamageIds.push(...r3.zeroDamageWeaponIds);
            hpBonus = r3.revealedHpBonus;
            atkBonus = r3.revealedAttackBonus;
            for (const bid of r3.movedToBottom) {
              if (!mDeck.includes(bid)) mDeck = [...mDeck, bid];
            }
          }
          const buff = nemesisPursuitBuff(state);
          // Virus Mutates: infected with <= threshold HP get bonus HP
          const virusBonus = virusMutatesBonus(state);
          const virusHpBonus = (def.hp ?? 0) <= virusBonus.hpThreshold && virusBonus.hpThreshold > 0 ? virusBonus.hpBonus : 0;
          targets.push({ cardId: def.id, hp: (def.hp ?? 0) + hpBonus + buff.hp + virusHpBonus, attack: (def.attack ?? 0) + atkBonus + buff.attack, infectedEffects: def.infectedEffects });
        }

        // MA-081/MA-049: weapons whose damage is zeroed for this explore.
        if (zeroDamageIds.length > 0) {
          const zero = new Set(zeroDamageIds);
          for (let i = 0; i < exploreWeapons.length; i++) {
            const wid = weapons[i];
            if (wid !== undefined && zero.has(wid)) {
              const w = exploreWeapons[i];
              if (w !== undefined) exploreWeapons[i] = { ...w, damage: 0, weaponEffects: [] };
            }
          }
        }

        // ---- Total Damage (weapons are used ONCE for the whole batch) ----
        let pendingSkillDamage = 0;
        const highHpCount = infectedEntries.filter(({ def }) => (def.hp ?? 0) >= 40).length;
        for (const pe of player.pendingSkillEffects ?? []) {
          if (pe.kind === 'giantKillingPlusDamage') pendingSkillDamage += pe.amount * highHpCount;
          else if (pe.kind === 'giantKillingAllWeaponsPlusDamage') pendingSkillDamage += pe.amount * weapons.length * highHpCount;
          else if (pe.kind === 'reversalBonusPerCharacterDamage') pendingSkillDamage += Math.max(player.maxHp - player.hp, 0);
          else if (pe.kind === 'removeXpForWeaponDamage') pendingSkillDamage += pe.amount * 10;
        }
        const sameNameAttachedCount = infectedEntries.length > 0
          ? state.seats.reduce((sum, s) => sum + (s.dead ? 0 : s.attached.filter(aid => state.cards[aid]?.cardId === infectedEntries[0]?.def.id).length), 0)
          : 0;
        const damage = computeDamage({
          weapons: exploreWeapons,
          ammo: ammoForEffects,
          bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + pendingSkillDamage + perActionBonus + selfHpBonus + costGateBonus + multiWeaponBonus + perDiscardCardBonus + blowbackBonus - mazeDamagePenalty(state, player.playArea.filter(id => cardDef(state, id)?.type === 'action').length),
          knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
          ammoCardsInPlayArea,
          inventoryCount: player.inventory.length,
          damageMultiplier: player.damageMultiplierThisTurn ?? 1,
        });

        // MA-040 Laser Targeting Device: every revealed Infected is defeated.
        const multi = laserTargeting
          ? { defeated: true, combinedHp: 0, combinedAttack: 0, shuffleBackCards: [] as string[], blockedByCannotDefeat: false, effectiveDamage: damage }
          : resolveMultiExplore({
              damage,
              revealed: targets,
              attachedInfectedCount: player.attached.length,
              ammo: ammoForEffects,
              weapons: exploreWeapons,
              characterDamage: Math.max(player.maxHp - player.hp, 0),
              characterXp: player.xp ?? 0,
              sameNameAttachedCount,
              inventoryCount: player.inventory.length,
              actionsInPlayArea: player.playArea.filter(pid => cardDef(state, pid)?.type === 'action').length,
              ammoX10InDiscardCount: ammoX10CountInDiscard(state, seat),
            });
        const defeated = multi.defeated;
        const autoDefeatedIds = autoDefeatedEntries.map(e => e.id);
        const defeatedIds = defeated ? [...infectedEntries.map(e => e.id), ...autoDefeatedIds] : [...autoDefeatedIds];
        const undefeatedEntries = defeated ? [] : infectedEntries;
        // JM-001 Jake Muller L1: the combined hit is what he "takes". Collected
        // here, before the defeated/not-defeated split, so the rebuilt seat
        // and the removed list below can both use it.
        const jakeTrashed = trashTopFromDiscardIds(state, seat, multi.combinedAttack);
        // ---- Outbreak infection tracking ----
        const infectionBySeat = new Map<number, string[]>();
        for (const s of state.seats) infectionBySeat.set(s.seat, [...(s.infectionCards ?? [])]);
        let outbreakDeck = state.infectionDeck ?? [];
        const drawInfectionsFor = (seatIdx: number, count: number): void => {
          if (count <= 0) return;
          const target = state.seats[seatIdx];
          if (target === undefined) return;
          if (isImmuneToInfectionEffects(characterAbilities(state, seatIdx), target.infectionCards)) return;
          const arr = infectionBySeat.get(seatIdx) ?? [];
          for (let i = 0; i < count && outbreakDeck.length > 0; i++) {
            arr.push(outbreakDeck[0] as string);
            outbreakDeck = outbreakDeck.slice(1);
          }
          infectionBySeat.set(seatIdx, arr);
        };
        const infectedEffectSeat = (): number => redirectSeat ?? seat;
        const zombieBAffected: number[] = [];
        // ---- Outcome ----
        const outcomePrompts: Prompt[] = [...revealPrompts];
        const removedIds: string[] = [...removedAfter, ...eventIdsToRemove];
        const chainAttachedIds: string[] = [];
        let decorations = player.decorations;
        // CC-001 Claire Redfield L2: heal when the explore defeats an
        // Infected with a weapon carrying the ability's tag.
        const onDefeatHeal = defeated ? healOnDefeatWithWeaponTag(state, seat, abilities, weapons) : 0;
        let level = player.level;
        let xp = player.xp ?? 0;
        let exploresLeftAfter = exploresLeft + grantedExplores + (laserTargeting ? 1 : 0);
        let partnerAttached = player.partnerAttached ?? [];
        const reaperTrashed: string[] = [];
        let newLeadingHp = leadingIsPartner ? (player.partnerHp ?? player.hp) : player.hp;
        let downed = false;
        let resuscitatePending = false;
        const resuscitatePrompts: Prompt[] = [];
        if (defeated) {
          for (const { id, def } of infectedEntries) {
            if (!negatedIds.has(id)) {
              for (const e of def.infectedEffects ?? []) {
                if (e.kind === 'onDefeatInfectionIncrease') {
                  drawInfectionsFor(infectedEffectSeat(), e.amount);
                  zombieBAffected.push(infectedEffectSeat());
                }
              }
            }
            // Barry Burton: chain-defeat lower-HP Infected from the Mansion top.
            const barryAbility = abilities.find(a => a.kind === 'onDefeatChainLowerHp');
            if (barryAbility !== undefined && barryAbility.kind === 'onDefeatChainLowerHp' &&
                (def.hp ?? 0) <= barryAbility.hpThreshold) {
              let lastHp = def.hp ?? 0;
              while (mDeck.length > 0) {
                const topId = mDeck[0];
                if (topId === undefined) break;
                const topDef = cardDef(state, topId);
                if (topDef?.type !== 'infected') break;
                if ((topDef.hp ?? 0) >= lastHp) break;
                mDeck = mDeck.slice(1);
                chainAttachedIds.push(topId);
                lastHp = topDef.hp ?? 0;
              }
            }
            // MA-036 Reaper: trash the highest-cost card attached to the partner
            // unless this Infected was defeated with exact damage.
            if (def.infectedEffects?.some(e => e.kind === 'trashHighestCostAttachedOnPartnerIfNotExactDefeat')) {
              const exactDefeat = multi.effectiveDamage === multi.combinedHp;
              if (!exactDefeat) {
                const attached = [...partnerAttached];
                let bestId: string | undefined;
                let bestCost = -1;
                for (const aid of attached) {
                  const cost = cardDef(state, aid)?.cost ?? 0;
                  if (cost > bestCost) { bestCost = cost; bestId = aid; }
                }
                if (bestId !== undefined) {
                  partnerAttached = attached.filter(aid => aid !== bestId);
                  reaperTrashed.push(bestId);
                }
              }
            }
          }
          // Ecliptic Express: when defeating an infected, may trash a discard card
          if (hasMansionAttachmentEffect(state, 'trashDiscardOnInfectedDefeat') && player.discard.length > 0) {
            outcomePrompts.push({
              id: `ecliptic-trash-${seat}-${state.version}`,
              seat,
              text: 'Ecliptic Express: trash a card from your discard pile?',
              options: [...player.discard, 'Decline'],
              payload: { kind: 'eclipticTrash' },
            });
          }
          // Decorations for every defeated Infected (Combo Pile aware), including
          // any Barry-chain attachments revealed by the batch.
          const allAttached = [...player.attached, ...defeatedIds, ...chainAttachedIds];
          decorations = player.decorations
            + decorationDelta(state, player.attached, allAttached)
            // JM-001 Jake Muller L2: +amount for each high-Health Infected he
            // defeats (Barry-chain trophies included).
            + jakeDefeatDecorationBonus(state, seat, [...defeatedIds, ...chainAttachedIds]);
          // Level-up thresholds (MA-047 reduces the L2 requirement).
          const charDef = cardDef(state, player.characterInstanceId);
          let level2At = charDef?.level2At ?? 0;
          for (const aid of allAttached) {
            const ad = state.cards[aid] === undefined ? undefined : state.cardDefs[state.cards[aid]?.cardId ?? ''];
            const eff = ad?.infectedEffects?.find(e => e.kind === 'reduceLevel2DecorationRequirement');
            if (eff !== undefined && eff.kind === 'reduceLevel2DecorationRequirement') level2At -= eff.amount;
          }
          level = charDef !== undefined
            ? levelForDecorations(charDef.level1At, Math.max(level2At, charDef.level1At ?? 0), decorations)
            : player.level;
          // Sergei L2: +Explores per Infected defeated.
          exploresLeftAfter += exploreOnInfectedDefeat(abilities) * defeatedIds.length;
          // XP: +1 per explore action (+1 more per high-Decoration Infected).
          const maximizerXp = activeSkillEffects(state, seat).some(e => e.kind === 'xpOnDefeatHighDecoration')
            ? defeatedIds.filter(id => (cardDef(state, id)?.decorations ?? 0) >= 2).length
            : 0;
          // Virus Mutates: bonus XP per explore
          const virusXpBonus = virusMutatesBonus(state).xpBonus;
          xp = (player.xp ?? 0) + 1 + maximizerXp + virusXpBonus;
          // On-defeat "may" prompts, one set per defeated Infected.
          for (const { id } of infectedEntries) {
            const hasSkip = !negatedIds.has(id) && (cardDef(state, id)?.infectedEffects?.some(e => e.kind === 'skipNextTurnOfAPlayerOnDefeat') ?? false);
            const hasNoActions = !negatedIds.has(id) && (cardDef(state, id)?.infectedEffects?.some(e => e.kind === 'noActionsNextTurnOfAPlayerOnDefeat') ?? false);
            if (hasSkip || hasNoActions) {
              outcomePrompts.push({
                id: `p${state.prompts.length + outcomePrompts.length + 1}`,
                seat,
                text: redirectSeat !== undefined
                  ? `This Infected's effect is redirected to ${state.seats[redirectSeat]?.name ?? 'another Player'}.`
                  : 'Choose a player.',
                options: redirectSeat !== undefined
                  ? [String(redirectSeat)]
                  : state.seats.filter(s => !s.dead && !s.downed).map(s => String(s.seat)),
                payload: { kind: hasSkip ? 'skipNextTurn' : 'noActionsNextTurn' },
              });
            }
          }
          if (movesDiscardToInventoryOnDefeat(abilities) && player.discard.length > 0) {
            outcomePrompts.push({
              id: `p${state.prompts.length + outcomePrompts.length + 1}`,
              seat,
              text: 'Move any number of cards from your discard to the bottom of your Inventory.',
              options: [...player.discard, 'DONE'],
              payload: { kind: 'luisSeraDiscardToInventory' },
            });
          }
          if (hasPerfectExploreReward(abilities) && multi.effectiveDamage === multi.combinedHp && player.discard.length > 0) {
            outcomePrompts.push({
              id: `p${state.prompts.length + outcomePrompts.length + 1}`,
              seat,
              text: 'Take one card from your Discard Pile into your hand.',
              options: [...player.discard],
              payload: { kind: 'perfectExploreReward' },
            });
          }
          if (trashCardFromDiscardOnInfectedDefeat(abilities) && player.discard.length > 0) {
            outcomePrompts.push({
              id: `p${state.prompts.length + outcomePrompts.length + 1}`,
              seat,
              text: 'Mysterious Mask: trash a card from your Discard Pile.',
              options: [...player.discard, 'Decline'],
              payload: { kind: 'maskTrashDiscard' },
            });
          }
          if (trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat(abilities) && player.discard.length > 0) {
            outcomePrompts.push({
              id: `p${state.prompts.length + outcomePrompts.length + 1}`,
              seat,
              text: 'Leon: trash a card from your Discard Pile, then gain a card costing up to 20 more than it.',
              options: [...player.discard, 'Decline'],
              payload: { kind: 'leonTrashForGain' },
            });
          }
          if (infectedEntries.some(({ id, def }) => !negatedIds.has(id) && def.infectedEffects?.some(e => e.kind === 'mustExploreNextTurnOnDefeat'))) {
            outcomePrompts.push({
              id: `p${state.prompts.length + outcomePrompts.length + 1}`,
              seat,
              text: 'Cephalo: choose a player. That player must Explore on their next turn.',
              options: state.seats.filter(s => !s.dead && !s.downed).map(s => String(s.seat)),
              payload: { kind: 'cephaloChoosePlayer' },
            });
          }
        } else {
          // ---- Not defeated: the LEADING character takes the combined Damage ----
          const hunkReduction = abilities.reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
          const weskerReduction = abilities.some(a => a.kind === 'exploreDamageReductionPerHandCard')
            ? (abilities.find(a => a.kind === 'exploreDamageReductionPerHandCard') as { amount: number }).amount * handAfter.length
            : 0;
          const damageReduction = infectedDamageReduction(abilities) + hunkReduction + weskerReduction + allDamageReduction(abilities);
          const damageSkillEffects = activeSkillEffects(state, seat);
          const negateConsumption = consumeNegateDamage(state, seat);
          state = negateConsumption.state;
          const skillReduction = skillDamageReduction(damageSkillEffects);
          const giantThreshold = skillGiantKillingThreshold(damageSkillEffects);
          const skillSuppressed = giantThreshold !== undefined &&
            undefeatedEntries.length > 0 &&
            undefeatedEntries.every(({ def }) => (def.hp ?? 0) >= giantThreshold);
          const skillLethal = skillLethalReplacementAmount(damageSkillEffects);
          const baseLeadingHp = leadingIsPartner ? (player.partnerHp ?? player.hp) : player.hp;
          const damageOnAda = !leadingIsPartner && player.partnerInstanceId === undefined;
          const rawSkillDamage = (skillSuppressed || negateConsumption.negated)
            ? 0
            : Math.max(multi.combinedAttack - damageReduction - skillReduction, 0);
          const effectiveSkillDamage = rawSkillDamage >= baseLeadingHp && baseLeadingHp >= 20 && skillLethal !== undefined
            ? skillLethal
            : rawSkillDamage;
          const kevlar = applyDamageWithKevlar(state, seat, effectiveSkillDamage);
          state = kevlar.state;
          // The jacket joined the Mansion bottom; fold it into the local pile
          // or the return below (which spreads this local) drops it into no zone.
          for (const id of kevlar.movedIds) {
            if (!mDeck.includes(id)) mDeck = [...mDeck, id];
          }

          if (damageOnAda) {
            const ric = applyRicardoDamage(state, seat, baseLeadingHp, kevlar.damage);
            state = ric.state;
            newLeadingHp = ric.hp;
          } else {
            const reduce = player.downed || player.dead ? 0 : ricardoReduction(abilities, kevlar.damage);
            newLeadingHp = baseLeadingHp - Math.max(kevlar.damage - reduce, 0);
            if (reduce > 0) state = queueRicardoL2Prompt(state, seat, kevlar.damage, reduce);
          }
          for (const { id, def } of undefeatedEntries) {
            if (negatedIds.has(id)) continue;
            for (const e of def.infectedEffects ?? []) {
              if (e.kind === 'onNotDefeatedInfectionIncrease') {
                drawInfectionsFor(infectedEffectSeat(), e.amount + e.perLevel * player.level);
                zombieBAffected.push(infectedEffectSeat());
              } else if (e.kind === 'onNotDefeatedAttachCounter') {
                // Unofficial Expansion: EX-006 / EX-008 attach a Poison counter.
                state = attachCounterToSeat(state, infectedEffectSeat(), e.counterCardId);
              }
            }
          }
        }
        // MA-038 Explosive Barrel / MA-056o / MA-057o traps.
        for (const id of barrelIds) {
          if (damage >= 80) {
            const ric = applyRicardoDamage(state, seat, player.hp, 30);
            state = ric.state;
            const newHp = ric.hp;
            state = { ...state, seats: state.seats.map(x => (x.seat === seat ? { ...x, hp: newHp } : x)) };
          } else {
            exploresLeftAfter += 1;
          }
        }
        for (const id of trapIds) {
          const trapDef = cardDef(state, id);
          if (trapDef === undefined) continue;
          const playAreaTypes = playAreaAfter.map(pid => cardDef(state, pid)?.type ?? '');
          const actionCount = playAreaAfter.filter(pid => cardDef(state, pid)?.type === 'action').length;
          const trapDamage = outbreakTrapDamage(trapDef, playAreaTypes, actionCount);
          if (trapDamage > 0) {
            const kevlarTrap = applyDamageWithKevlar(state, seat, trapDamage);
            state = kevlarTrap.state;
            for (const bid of kevlarTrap.movedIds) {
              if (!mDeck.includes(bid)) mDeck = [...mDeck, bid];
            }
            const ric = applyRicardoDamage(state, seat, player.hp, kevlarTrap.damage);
            state = ric.state;
            const newHp = ric.hp;
            state = { ...state, seats: state.seats.map(x => (x.seat === seat ? { ...x, hp: newHp } : x)) };
          }
        }

        // ---- Card disposition ----
        const newHp = leadingIsPartner ? player.hp : newLeadingHp;
        const partnerDied = leadingIsPartner && newLeadingHp <= 0;
        const afterPartnerDeath = partnerDied ? removePartnerSkill(state, seat) : state;
        // Non-Infected reveals get a take/bottom choice; MA-039/072 extras shuffle back.
        const nonInfectedPrompts: Prompt[] = nonInfectedIds.map((id, i) => ({
          id: `p${state.prompts.length + outcomePrompts.length + i + 1}`,
          seat,
          text: cardDef(state, id)?.text ?? '',
          options: ['Take', 'Send to bottom of Mansion'],
          payload: { kind: 'takeOrBottom', instanceId: id },
        }));
        // EV-001 Zombie Grab: the multi-explore equivalent of the
        // single-explore event branch. Options read handAfter /
        // discardAfterExplosives (the explore moved the used weapon to the
        // play area); the card parks in limbo until the choice is answered
        // and is shuffled back into the Mansion by the zombieGrab resolver.
        const zombieGrabPrompts: Prompt[] = zombieGrabIds.map((id, i) => ({
          id: `p${state.prompts.length + outcomePrompts.length + nonInfectedIds.length + i + 1}`,
          seat,
          text: cardDef(state, id)?.text ?? '',
          options: [
            ...[...handAfter, ...discardAfterExplosives].filter(wid => cardDef(state, wid)?.type === 'weapon'),
            'Take 20 damage',
          ],
          payload: { kind: 'zombieGrab', amount: '20', instanceId: id },
        }));
        for (const id of undefeatedEntries.map(e => e.id)) {
          const def = cardDef(state, id);
          const effects = def?.infectedEffects ?? [];
          // MA-078 shuffles ITSELF back inside applyMercenariesNotDefeatedEffects
          // (it sets infectedShuffledBack), so the disposition pass must leave it
          // alone — otherwise the same instance is added to the deck twice.
          const selfShuffles = effects.some(
            e => e.kind === 'onNotDefeatedMoveHighestDecorationAttachedToBottomThenShuffle',
          );
          const shuffles = effects.some(
            e => e.kind === 'shuffleBackIfNotDefeated' || e.kind === 'onNotDefeatedGainAmmoAndShuffle',
          );
          const insertEffect = effects.find(e => e.kind === 'onNotDefeatedInsertIntoMansionAt');
          if (selfShuffles) {
            // handled by the not-defeated effect hook below
          } else if (insertEffect !== undefined && insertEffect.kind === 'onNotDefeatedInsertIntoMansionAt') {
            const inserted = insertAt({ deck: mDeck }, id, insertEffect.position);
            mDeck = inserted.deck;
          } else if (shuffles) {
            const shuffled = shuffleBack({ deck: mDeck }, id, rngShuffle);
            mDeck = shuffled.deck;
          } else {
            const bottomed = sendToBottom({ deck: mDeck }, id);
            mDeck = bottomed.deck;
          }
        }
        for (const id of shuffleBackIds) {
          const shuffled = shuffleBack({ deck: mDeck }, id, rngShuffle);
          mDeck = shuffled.deck;
        }
        // ---- Defeat / not-defeated effect hooks (per card) ----
        let fxState: GameState = {
          ...afterPartnerDeath,
          removed: [
            ...removedIds,
            ...reaperTrashed.filter(id => !removedIds.includes(id)),
            // JM-001 Jake Muller L1.
            ...jakeTrashed.filter(id => !removedIds.includes(id)),
            // Alliance Partner Modification (3) PARTNER DEATH: a Partner at ≤0
            // HP is removed from the game permanently and ALL cards attached to
            // it are trashed. Without this the attached cards simply vanished
            // from the player state while still sitting in `state.cards`.
            ...(partnerDied ? partnerAttached.filter(id => !removedIds.includes(id)) : []),
          ],
          mansionDeck: mDeck,
        };
        const defeatFxPrompts: Prompt[] = [];
        for (const { id, def } of infectedEntries) {
          const ctx = { seat, revealedInstanceId: id, revealedDef: def, weapons, handAfter, attachedInfectedCount: player.attached.length, characterXp: player.xp ?? 0 };
          if (defeated) {
            const r = applyMercenariesDefeatEffects(fxState, ctx);
            fxState = r.state;
            defeatFxPrompts.push(...r.prompts);
            const rn = applyNightmareDefeatEffects(fxState, { seat, revealedInstanceId: id, revealedDef: def, weapons });
            fxState = rn.state;
            defeatFxPrompts.push(...rn.prompts);
            // Custom card line: CI-009 shuffles a fresh copy of the named Ooze
            // into the Mansion when it is defeated.
            if (!negatedIds.has(id)) {
              for (const e of def.infectedEffects ?? []) {
                if (e.kind === 'onDefeatShuffleCardIntoMansion') {
                  fxState = shuffleCopyIntoMansion(fxState, e.cardId);
                }
              }
            }
          } else {
            const r = applyMercenariesNotDefeatedEffects(fxState, ctx);
            fxState = r.state;
            defeatFxPrompts.push(...r.prompts);
            // MA-078 (Red Executioner) already shuffled ITSELF back into the
            // Mansion inside the effect and returned the updated deck; doing it
            // again here appended a second copy of the same instance.
            const rn = applyNightmareNotDefeatedEffects(fxState, { seat, revealedInstanceId: id, revealedDef: def, weapons });
            fxState = rn.state;
            defeatFxPrompts.push(...rn.prompts);
          }
        }
        // MA-000 Rachael Foley (ooze): defeated with `maxDamage` or less, it is
        // shuffled back into the Mansion instead of attached (its Decoration is
        // still awarded, like MA-053 Lisa Trevor's bottom-of-Mansion fate).
        const oozeShuffleBackIds = defeated
          ? infectedEntries
              .filter(({ id, def }) => !negatedIds.has(id) && oozeShufflesBackOnDefeat(def, multi.effectiveDamage))
              .map(({ id }) => id)
          : [];
        for (const id of oozeShuffleBackIds) {
          fxState = shuffleIntoMansion(fxState, id);
        }
        // CI-001 Oscar: when the batch is not defeated he tramples the
        // exploring Character, trashing the highest-Damage Weapon(s) they used.
        const oscarTrample = !defeated && infectedEntries.some(({ id, def }) =>
          !negatedIds.has(id) && (def.infectedEffects ?? []).some(e => e.kind === 'onNotDefeatedTrashHighestDamageUsedWeapons'));
        mDeck = fxState.mansionDeck;

        // The not-defeated effects ran on the PRE-explore seat. MA-078 moves the
        // highest-Decoration trophy to the Mansion bottom, which drops it from
        // the Combo Pile AND loses its Decoration Reward. newPlayer is built from
        // the pre-explore seat below, so carry the live attached list forward —
        // otherwise the trophy is both in the Mansion and still attached.
        const liveSeat = fxState.seats[seat] as PlayerState | undefined;
        const preExploreAttached = (state.seats[seat] as PlayerState).attached;
        const attachedBase = liveSeat?.attached ?? preExploreAttached;
        // decorationDelta(A, A) is 0, so this is a no-op when nothing moved.
        decorations += decorationDelta(state, preExploreAttached, attachedBase);

        // Downed handling for a surviving leader.
        let handOut: readonly string[] = handAfter;
        // JM-001 Jake Muller L1: the trashed ids leave the Discard Pile.
        const discardAfterJake = discardAfterExplosives.filter(id => !jakeTrashed.includes(id));
        let discardOut: readonly string[] = discardAfterJake;
        let inventoryOut: readonly string[] = player.inventory;
        if (newHp <= 0 && !defeated) {
          const resuscitateHolders = state.seats.filter(s => !s.dead &&
            [...s.hand, ...s.playArea].some(pid => state.cards[pid]?.cardId === 'ac-050'));
          if (resuscitateHolders.length > 0) {
            resuscitatePending = true;
            for (const s of resuscitateHolders) {
              resuscitatePrompts.push({
                id: `resuscitate-${s.seat}-${state.version}`,
                seat: s.seat,
                text: `${player.name} would be reduced to 0 Health. Trash Resuscitate to set their Health to 10 instead?`,
                options: [...s.hand.filter(pid => state.cards[pid]?.cardId === 'ac-050'), ...s.playArea.filter(pid => state.cards[pid]?.cardId === 'ac-050'), 'Decline'],
                payload: { kind: 'resuscitate', targetSeat: String(seat) },
              });
            }
          } else {
            const flipResult = flipDown(
              {
                hp: newHp,
                maxHp: player.maxHp,
                decorations,
                level,
                downed: false,
                dead: false,
                hand: handAfter,
                discard: discardAfterJake,
                inventory: player.inventory,
              },
              rngShuffle,
            );
            downed = flipResult.downed;
            handOut = flipResult.hand;
            discardOut = flipResult.discard;
            inventoryOut = flipResult.inventory;
          }
        }

        const newPlayer: PlayerState = applyNightmareGains({
          ...player,
          hand: handOut,
          playArea: playAreaAfter,
          discard: discardOut,
          inventory: inventoryOut,
          exploresLeft: exploresLeftAfter + (nemesisPursuit ? 1 : 0),
          turnAmmo: turnAmmoAfter,
          turnGold: turnGoldAfter,
          mustExplore: nemesisPursuit ? true : false,
          decorations,
          level,
          xp,
          pendingSkillEffects: undefined,
          pendingBackstab: undefined,
          attached: defeated
            ? [...attachedBase, ...defeatedIds.filter(id => !oozeShuffleBackIds.includes(id)), ...chainAttachedIds]
            : [...attachedBase, ...autoDefeatedIds],
          // EX-006/EX-008 may have attached a Poison counter since `player` was
          // read — carry the live value forward.
          counters: (state.seats[seat] as PlayerState).counters,
          partnerAttached,
          infectionCards: infectionBySeat.get(seat) ?? player.infectionCards ?? [],
          hp: Math.min((resuscitatePending ? 10 : newHp) + onDefeatHeal, player.maxHp),
          ...(leadingIsPartner ? { partnerHp: newLeadingHp } : {}),
          ...(partnerDied
            ? {
                partnerInstanceId: undefined,
                partnerAttached: undefined,
                partnerLeading: undefined,
                partnerSkillId: undefined,
                // The Partner is gone, so its Health goes with it - leaving
                // partnerHp at 0 would leave stale state on the seat.
                partnerHp: undefined,
                partnerMaxHp: undefined,
              }
            : {}),
          downed,
          // Low on Ammo: pistols used for free (0 ammo cost) are trashed at end of turn
          trashAtEndOfTurn: hasFreePistolTrashAtEnd(state)
            ? [...(player.trashAtEndOfTurn ?? []), ...weapons.filter(id => {
                const wDef = cardDef(state, id);
                return wDef?.type === 'weapon' && (wDef.weaponTags ?? []).includes('pistol');
              })]
            : player.trashAtEndOfTurn,
        });
        // MA-092 "Gain 1 copy" lands in the discard. newPlayer was built before
        // these gains, so carry the gained copies into the exploring seat's
        // discard — otherwise they stay registered but in no zone.
        const gainedDiscardIds: string[] = [];
        for (const g of revealGains) {
          const r = gainCopyTracked(fxState, g.seat, g.cardId);
          fxState = r.state;
          if (g.seat === seat) gainedDiscardIds.push(...r.ids);
        }
        const finalPlayer: PlayerState = gainedDiscardIds.length > 0
          ? { ...newPlayer, discard: [...newPlayer.discard, ...gainedDiscardIds] }
          : newPlayer;
        const zombieBPromptsOut = zombieBAffected.flatMap(seatIdx => zombieBPrompts(fxState, seatIdx, fxState.version));
        const result: GameState = {
          ...fxState,
          ...nextBase,
          seats: fxState.seats.map(s => (s.seat === seat ? finalPlayer : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] })),
          mansionDeck: mDeck,
          rngState: fxState.rngState,
          prompts: [...fxState.prompts, ...outcomePrompts, ...defeatFxPrompts, ...nonInfectedPrompts, ...zombieGrabPrompts, ...resuscitatePrompts, ...zombieBPromptsOut],
          ...(resuscitatePending ? { pendingResuscitate: { seat } } : {}),
          ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),
        };
        // Custom card line: CI-003's 10x Ammo and CI-001's trample both land on
        // the FINAL seat — the rebuilt one would drop them.
        let out = result;
        if (saddlerAmmoGrant > 0) {
          for (const s of out.seats) {
            if (!s.dead) out = gainAmmoX10(out, s.seat, saddlerAmmoGrant);
          }
        }
        if (oscarTrample) out = trashHighestDamageUsedWeapons(out, weapons);
        return out;
      }






      // Mercenaries: explore-time "can" Skills declared this turn. Their damage
      // is added to this explore; the declarations are consumed afterwards.
      let pendingSkillDamage = 0;
      for (const pe of player.pendingSkillEffects ?? []) {
        if (pe.kind === 'giantKillingPlusDamage' && (revealedDef?.hp ?? 0) >= 40) {
          pendingSkillDamage += pe.amount;
        } else if (pe.kind === 'giantKillingAllWeaponsPlusDamage' && (revealedDef?.hp ?? 0) >= 40) {
          pendingSkillDamage += pe.amount * weapons.length;
        } else if (pe.kind === 'reversalBonusPerCharacterDamage') {
          pendingSkillDamage += Math.max(player.maxHp - player.hp, 0);
        } else if (pe.kind === 'removeXpForWeaponDamage') {
          pendingSkillDamage += pe.amount * 10;
        }
      }

      // MA-037 Guardian of Insanity: on reveal, each character takes 10 damage.
      // MA-031 Proto Tyrant: on reveal, non-exploring chars with 50+ HP take 40.
      // SK-008 Luck LV.2 can negate either for the seats that armed it.
      let revealHpDelta: Record<number, number> = {};
      if (revealedDef?.id === 'ma-037') {
        for (const s of state.seats) {
          const neg = consumeNegateDamage(state, s.seat);
          state = neg.state;
          if (neg.negated) continue;
          const hunkReduce = characterAbilities(state, s.seat)
            .reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
          const ric = applyRicardoDamage(state, s.seat, s.hp ?? 0, Math.max(10 - hunkReduce, 0));
          state = ric.state;
          const newHp = ric.hp;
          state = { ...state, seats: state.seats.map(x => (x.seat === s.seat ? { ...x, hp: newHp } : x)) };
        }
      }
      if (revealedDef?.id === 'ma-031') {
        for (const s of state.seats) {
          if (s.seat === seat || (s.hp ?? 0) < 50) continue;
          const neg = consumeNegateDamage(state, s.seat);
          state = neg.state;
          if (neg.negated) continue;
          const hunkReduce = characterAbilities(state, s.seat)
            .reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
          const ric = applyRicardoDamage(state, s.seat, s.hp ?? 0, Math.max(40 - hunkReduce, 0));
          state = ric.state;
          // JM-001 Jake Muller L1: MA-031's 40 Damage is a qualifying hit.
          state = applyTrashTopFromDiscardOnBigHit(state, s.seat, Math.max(40 - hunkReduce, 0));
          const newHp = ric.hp;
          state = { ...state, seats: state.seats.map(x => (x.seat === s.seat ? { ...x, hp: newHp } : x)) };
        }
      }

      // Mercenaries: the Toughness LV.1/LV.3 reaction (negate/redirect this
      // Infected's effects) is consumed once, here, before any of the Infected's
      // reveal/defeat effects are applied.
      const infectedReaction = consumeInfectedEffectReaction(state, seat);
      state = infectedReaction.state;
      const infectedEffectNegated = infectedReaction.negated;
      const infectedEffectRedirectSeat = infectedReaction.redirectSeat;

      // Mercenaries: on-reveal infected effects (MA-076/080/081/083/084/085/086/
      // 089/091/092). Combat-affecting ones are applied by resolveExplore.
      const mercCtx = {
        seat,
        revealedInstanceId,
        revealedDef: revealedDef as CardDef,
        weapons,
        handAfter,
        attachedInfectedCount: player.attached.length,
        characterXp: player.xp ?? 0,
      };
      const revealFx = (revealedDef === undefined || infectedEffectNegated)
        ? { state, prompts: [] as Prompt[], zeroDamageWeaponIds: [] as string[], gains: [] as Array<{ readonly seat: number; readonly cardId: string }> }
        : applyMercenariesRevealEffects(state, mercCtx);
      state = revealFx.state;
      const revealGains = revealFx.gains;
      if (revealFx.prompts.length > 0) {
        state = { ...state, prompts: [...state.prompts, ...revealFx.prompts] };
      }

      // Nightmare: on-reveal infected effects (MA-061 Militia Rocket Launcher,
      // MA-068 Hunter).
      const nightmareRevealFx = infectedEffectNegated
        ? { state, prompts: [] as Prompt[] }
        : applyNightmareRevealEffects(state, { seat, revealedInstanceId, revealedDef: revealedDef as CardDef, weapons });
      state = nightmareRevealFx.state;
      // Re-read the exploring seat: reveal effects may have changed its Health
      // or max Health (MA-061 / MA-068), and the branches below must not
      // overwrite those with the pre-reveal snapshot.
      player = state.seats[seat] as PlayerState;
      if (nightmareRevealFx.prompts.length > 0) {
        state = { ...state, prompts: [...state.prompts, ...nightmareRevealFx.prompts] };
      }

      // Outbreak: on-reveal infected effects (MA-045 Wasp, MA-048 Crimson Head,
      // MA-049 Reinforced Licker).
      const outbreakRevealFx = (revealedDef === undefined || infectedEffectNegated)
        ? { state, prompts: [] as Prompt[], zeroDamageWeaponIds: [] as string[], revealedHpBonus: 0, revealedAttackBonus: 0, movedToBottom: [] as string[] }
        : applyOutbreakRevealEffects(state, {
            seat,
            revealedInstanceId,
            revealedDef: revealedDef as CardDef,
            weapons,
            attached: player.attached,
          });
      state = outbreakRevealFx.state;
      if (outbreakRevealFx.prompts.length > 0) {
        state = { ...state, prompts: [...state.prompts, ...outbreakRevealFx.prompts] };
      }
      // Re-read the exploring seat: MA-045 can lower its Health.
      player = state.seats[seat] as PlayerState;

      // Custom card line: CI-003 Osmund Saddler (First Encounter) — each player
      // gains a 10x Ammo. Applied AFTER the explore's own seat updates, since
      // the rebuilt seat would otherwise drop the gained card.
      const saddlerAmmoGrant = revealedDef?.type === 'infected' && !infectedEffectNegated
        ? saddlerAmmoGrantPerPlayer(revealedDef)
        : 0;

      // TUA-001 Tyrant Ultimate Abyss: roll d6 on reveal for random effect.
      let tuaHpBonus = 0;
      let tuaDisabledWeaponType: string | undefined;
      if (revealedDef?.type === 'infected' && !infectedEffectNegated &&
          (revealedDef.infectedEffects ?? []).some(e => e.kind === 'onRevealRollD6ForEffect')) {
        const rollResult = tyrantUltimateAbyssRoll(state);
        tuaHpBonus = rollResult.hpBonus;
        tuaDisabledWeaponType = rollResult.disabledWeaponType;
        state = { ...state, rngState: rollResult.rngState };
        if (tuaDisabledWeaponType !== undefined) {
          state = {
            ...state,
            disabledWeaponTypesThisTurn: [...(state.disabledWeaponTypesThisTurn ?? []), tuaDisabledWeaponType],
          };
        }
      }

      const zeroDamageIds = [...revealFx.zeroDamageWeaponIds, ...outbreakRevealFx.zeroDamageWeaponIds];
      if (zeroDamageIds.length > 0) {
        const zero = new Set(zeroDamageIds);
        for (let i = 0; i < exploreWeapons.length; i++) {
          const wid = weapons[i];
          if (wid !== undefined && zero.has(wid)) {
            const w = exploreWeapons[i];
            if (w !== undefined) exploreWeapons[i] = { ...w, damage: 0, weaponEffects: [] };
          }
        }
      }
      // TUA-001: zero out weapons of the disabled type for this turn.
      if (tuaDisabledWeaponType !== undefined) {
        for (let i = 0; i < exploreWeapons.length; i++) {
          const wid = weapons[i];
          if (wid !== undefined) {
            const wdef = cardDef(state, wid);
            if ((wdef?.weaponTags ?? []).includes(tuaDisabledWeaponType as any)) {
              const w = exploreWeapons[i];
              if (w !== undefined) exploreWeapons[i] = { ...w, damage: 0, weaponEffects: [] };
            }
          }
        }
      }

      let mansionDeck = rev.mansion.deck;
      // MA-054o Kevlar Jacket: the reveal handlers may have moved an attached
      // jacket to the bottom of the deck; fold those into the local pile.
      for (const id of outbreakRevealFx.movedToBottom) {
        if (!mansionDeck.includes(id)) mansionDeck = [...mansionDeck, id];
      }

      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-040') {
        // Laser Targeting Device: +1 Explore, remove card.
        const newPlayer: PlayerState = applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + 1, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false });
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ce-012') {
        // Disappearance: if any player has 10+ decorations, the player with
        // most decorations swaps their Main Character for another at random,
        // gains full HP, and keeps their deck. Otherwise shuffle back.
        const playersWith10Plus = state.seats.filter(s => s.decorations >= 10 && !s.dead);
        if (playersWith10Plus.length > 0) {
          // Find player with most decorations
          const targetPlayer = playersWith10Plus.reduce((max, s) => s.decorations > max.decorations ? s : max);
          // Get all character card IDs
          const characterIds = Object.values(state.cardDefs)
            .filter((c): c is CardDef => c.type === 'character' && c.set !== 'custom')
            .map(c => c.id);
          // Pick a random character different from current
          const currentCharId = state.cards[targetPlayer.characterInstanceId]?.cardId;
          const otherChars = characterIds.filter(id => id !== currentCharId);
          if (otherChars.length > 0) {
            const roll = nextInt(makeRng(currentRng), otherChars.length);
            const newCharId = otherChars[roll.value];
            if (newCharId !== undefined) {
              const newCharDef = state.cardDefs[newCharId];
              if (newCharDef !== undefined) {
                const newCharInstanceId = `${newCharId}#${targetPlayer.seat + 1}`;
                const newPlayerState: PlayerState = {
                  ...targetPlayer,
                  characterInstanceId: newCharInstanceId,
                  hp: newCharDef.maxHp ?? 100,
                  maxHp: newCharDef.maxHp ?? 100,
                };
                const newCards: Record<string, CardInstance> = {
                  ...state.cards,
                  [newCharInstanceId]: { instanceId: newCharInstanceId, cardId: newCharId, location: { zone: 'hand', index: 0 } },
                };
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s => (s.seat === targetPlayer.seat ? newPlayerState : s)),
                  cards: newCards,
                  removed: [...removedAfter, revealedInstanceId],
                  mansionDeck,
                  rngState: roll.rng.s,
                  prompts: state.prompts,
                };
              }
            }
          }
        }
        // No player has 10+ decorations or character swap failed: shuffle back
        const shuffled = shuffleBack({ deck: mansionDeck }, revealedInstanceId, (items) => {
          const r = shuffle(makeRng(currentRng), items);
          currentRng = r.rng.s;
          return r.value;
        });
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
          removed: removedAfter,
          mansionDeck: shuffled.deck,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-039') {
        // Collapsing Floor Traps: reveal next 2 mansion cards; battle any infected among them; shuffle non-infected back.
        const rev2 = revealTop({ deck: mansionDeck });
        const secondId = rev2.revealedInstanceId;
        const secondDef = cardDef(state, secondId);
        mansionDeck = rev2.mansion.deck;
        // collect infected targets
        const targets = [];
        if (revealedDef && false) {}
        // Treat the two revealed cards; if either is infected, battle combined with current explore damage.
        const infectedTargets = [revealedDef, secondDef].filter(d => d?.type === 'infected');
        const exploreDmg = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + pendingSkillDamage - mazeDamagePenalty(state, player.playArea.filter(id => cardDef(state, id)?.type === 'action').length), knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
        // resolve combined battle
        const multiResult = resolveMultiExplore({
          damage: exploreDmg,
          ammoX10InDiscardCount: ammoX10CountInDiscard(state, seat),
          revealed: [revealedDef, secondDef].filter(d => d?.type === 'infected').map(d => ({
            cardId: d!.id, hp: (d!.hp ?? 0) + nemesisPursuitBuff(state).hp, attack: (d!.attack ?? 0) + nemesisPursuitBuff(state).attack, infectedEffects: d!.infectedEffects,
          })),
        });
        const defeatedDecorations = multiResult.defeated ? infectedTargets.reduce((s, d) => s + (d?.decorations ?? 0), 0) : 0;
        const comboHeal = multiResult.defeated ? healOnDefeatWithWeaponTag(state, seat, abilities, weapons) : 0;
        let newPlayer = applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false, decorations: player.decorations + defeatedDecorations, hp: Math.min(player.hp + comboHeal, player.maxHp) });
        // remove event + any defeated infected from game (simplified: remove all revealed)
        // WE-028 Stun Rod: while your character is battling two or more
        // Infected, you may move one of them with 20 or less Health to the top
        // of the Mansion.
        const stunRodUsed = weapons.some(id => cardDef(state, id)?.weaponEffects?.some(
          e => e.kind === 'moveLowHpInfectedToMansionTop') === true);
        const stunThreshold = weapons.reduce((m, id) => {
          const eff = cardDef(state, id)?.weaponEffects?.find(e => e.kind === 'moveLowHpInfectedToMansionTop');
          return eff !== undefined && eff.kind === 'moveLowHpInfectedToMansionTop' ? eff.hpThreshold : m;
        }, 20);
        const revealedInfectedIds: string[] = [];
        if (cardDef(state, revealedInstanceId)?.type === 'infected') revealedInfectedIds.push(revealedInstanceId);
        if (cardDef(state, secondId)?.type === 'infected') revealedInfectedIds.push(secondId);
        const stunCandidates = revealedInfectedIds.filter(id => {
          const d = cardDef(state, id);
          return d !== undefined && (d.hp ?? 0) <= stunThreshold;
        });
        const stunPrompts: Prompt[] = stunRodUsed && revealedInfectedIds.length >= 2 && stunCandidates.length > 0
          ? [{
              id: `stunRod-${seat}-v${state.version}`,
              seat,
              text: 'Stun Rod: move one of these Infected to the top of the Mansion?',
              options: [...stunCandidates, 'Decline'],
              payload: { kind: 'stunRodChooseInfected' },
            }]
          : [];
        const grabSecond = secondDef?.id === 'ev-001';
        // EV-002 Nemesis Pursuit is removed from the game, never shuffled back.
        const nemesisSecond = isNemesisPursuit(secondDef);
        const removedIds = [revealedInstanceId, secondId].filter(id => {
          const d = cardDef(state, id);
          return (d?.type === 'infected' || d?.type === 'event') && d?.id !== 'ev-001';
        });
        // shuffle non-infected back to bottom (EV-001 parks in limbo until
        // its choice is answered, then the resolver shuffles it back)
        const toShuffleBack = [revealedInstanceId, secondId].filter(id => {
          const d = cardDef(state, id);
          return d?.type !== 'infected' && d?.id !== 'ev-001' && d?.id !== NEMESIS_PURSUIT_ID;
        });
        if (toShuffleBack.length > 0) {
          mansionDeck = [...mansionDeck, ...toShuffleBack];
        }
        const grabPromptsMa039: Prompt[] = grabSecond
          ? [{
              id: `zombieGrab-${seat}-v${state.version}`,
              seat,
              text: secondDef?.text ?? '',
              options: [
                ...[...handAfter, ...discardAfterExplosives].filter(wid => cardDef(state, wid)?.type === 'weapon'),
                'Take 20 damage',
              ],
              payload: { kind: 'zombieGrab', amount: '20', instanceId: secondId },
            }]
          : [];
        const ma039Result: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, ...removedIds.filter(id => {
            const d = cardDef(state, id); return d?.type === 'infected' || d?.type === 'event';
          })],
          mansionDeck,
          rngState: currentRng,
          prompts: [...state.prompts, ...stunPrompts, ...grabPromptsMa039],
        };
        return nemesisSecond ? applyNemesisPursuit(ma039Result, seat) : ma039Result;
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-038') {
        // Explosive Barrel: if total damage >= 80, each exploring char takes 30;
        // otherwise +30 damage collectively and +1 Explore. Then remove card.
        const evDamage = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + pendingSkillDamage - mazeDamagePenalty(state, player.playArea.filter(id => cardDef(state, id)?.type === 'action').length), knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
        let ricHp = player.hp;
        if (evDamage >= 80) {
          const ricBarrel = applyRicardoDamage(state, seat, player.hp, 30);
          state = ricBarrel.state;
          ricHp = ricBarrel.hp;
        }
        let newPlayer: PlayerState = applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + (evDamage < 80 ? 1 : 0), turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false, hp: ricHp });
        // +30 damage collectively handled by not removing; for simplicity add to weaponDamageBonus? skip; damage already resolved via threshold only.
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }

      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-072') {
        // P.R.L. 412: reveal the top Mansion card. If it is an Infected, the
        // player with the fewest Decorations automatically defeats it; either
        // way the P.R.L. 412 is removed. A non-Infected reveal is shuffled back
        // into the Mansion together with the P.R.L. 412.
        const rev2 = revealTop({ deck: mansionDeck });
        const secondId = rev2.revealedInstanceId;
        const secondDef = cardDef(state, secondId);
        mansionDeck = rev2.mansion.deck;
        if (secondDef?.type === 'infected') {
          // One Infected can only be Defeated by one Player, so a tie for the
          // fewest Decorations is broken the same way the game's victory
          // condition breaks a Decoration tie: most Health, then lowest seat.
          const alive = state.seats.filter(x => !x.dead);
          const min = alive.length > 0 ? Math.min(...alive.map(x => x.decorations)) : 0;
          const tied = alive.filter(x => x.decorations === min);
          const bestHp = tied.length > 0 ? Math.max(...tied.map(x => x.hp)) : 0;
          const chosenSeat = tied.filter(x => x.hp === bestHp).map(x => x.seat)[0] ?? -1;
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(x => (x.seat === chosenSeat
              ? { ...x, decorations: x.decorations + (secondDef.decorations ?? 0), attached: [...x.attached, secondId] }
              : x)),
            removed: [...removedAfter, revealedInstanceId],
            mansionDeck,
            rngState: currentRng,
            prompts: state.prompts,
          };
        }
        const grabSecondMa072 = secondDef?.id === 'ev-001';
        // EV-002 Nemesis Pursuit is removed from the game, never shuffled back.
        const nemesisSecondMa072 = isNemesisPursuit(secondDef);
        // EV-001 parks in limbo until its choice is answered; only the
        // P.R.L. 412 itself is shuffled back here.
        const shuffled = (grabSecondMa072 || nemesisSecondMa072)
          ? { deck: mansionDeck }
          : shuffleBack({ deck: mansionDeck }, secondId, rngShuffle);
        const shuffled2 = shuffleBack(shuffled, revealedInstanceId, rngShuffle);
        const grabPromptsMa072: Prompt[] = grabSecondMa072
          ? [{
              id: `zombieGrab-${seat}-v${state.version}`,
              seat,
              text: secondDef?.text ?? '',
              options: [
                ...[...handAfter, ...discardAfterExplosives].filter(wid => cardDef(state, wid)?.type === 'weapon'),
                'Take 20 damage',
              ],
              payload: { kind: 'zombieGrab', amount: '20', instanceId: secondId },
            }]
          : [];
        const ma072Result: GameState = {
          ...state,
          ...nextBase,
          removed: nemesisSecondMa072 ? [...removedAfter, secondId] : removedAfter,
          mansionDeck: shuffled2.deck,
          rngState: currentRng,
          prompts: [...state.prompts, ...grabPromptsMa072],
        };
        return nemesisSecondMa072 ? applyNemesisPursuit(ma072Result, seat) : ma072Result;
      }

      // Outbreak traps: MA-056o Laser Trap / MA-057o Rock Trap. Both damage the
      // exploring character based on the play area, then leave the game.
      if (revealedDef?.type === 'event' && (revealedDef.id === 'ma-056o' || revealedDef.id === 'ma-057o')) {
        const playAreaTypes = playAreaAfter.map(id => cardDef(state, id)?.type ?? '');
        const actionCardsInPlayArea = playAreaAfter.filter(id => cardDef(state, id)?.type === 'action').length;
        const trapDamage = outbreakTrapDamage(revealedDef, playAreaTypes, actionCardsInPlayArea);
        let trapPlayer: PlayerState = applyNightmareGains({
          ...player,
          hand: handAfter,
          playArea: playAreaAfter,
          discard: discardAfterExplosives,
          exploresLeft: exploresLeft + grantedExplores,
          turnAmmo: turnAmmoAfter,
          turnGold: turnGoldAfter,
          mustExplore: false,
        });
        if (trapDamage > 0 && !trapPlayer.dead && !trapPlayer.downed) {
          const kevlarTrap = applyDamageWithKevlar(state, seat, trapDamage);
          state = kevlarTrap.state;
          for (const id of kevlarTrap.movedIds) {
            if (!mansionDeck.includes(id)) mansionDeck = [...mansionDeck, id];
          }
          const ricTrap = applyRicardoDamage(state, seat, trapPlayer.hp, kevlarTrap.damage);
          state = ricTrap.state;
          trapPlayer = {
            ...trapPlayer,
            // Keep the post-kevlar `attached`: the jacket left play.
            attached: (state.seats[seat] as PlayerState).attached,
            hp: ricTrap.hp,
          };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? trapPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }

      // Unofficial Expansion: EX-002 Special Rocket Launcher — the attached
      // launcher auto-defeats the next Infected with 80+ Health revealed while
      // this Character explores, then is removed from the game.
      const rocketLauncherId = revealedDef !== undefined
        ? specialRocketLauncherId(state, seat, revealedDef)
        : undefined;
      let rocketAutoDefeat = false;
      if (rocketLauncherId !== undefined) {
        rocketAutoDefeat = true;
        removedAfter = [...removedAfter, rocketLauncherId];
        state = consumeSpecialRocketLauncher(state, seat, rocketLauncherId);
        player = state.seats[seat] as PlayerState;
      }

      // Reactive trash window: if a Las Plagas infected is revealed, eligible
      // players (Jill L2 with Flash Grenade in hand) may react.
      const isLasPlagas = revealedDef?.type === 'infected' && revealedDef?.plagas === true;
      let reactiveWindow = state.reactiveTrashWindow;
      let reactivePrompts = state.prompts;
      if (isLasPlagas) {
        const eligibleSeats = state.seats.filter(s => {
          if (s.seat === seat || s.dead || s.downed) return false;
          // Jill (Brainwashed) L2 — driven by the ability, not the card id,
          // so the data decides who may react.
          if (!characterAbilities(state, s.seat).some(a => a.kind === 'offTurnFlashGrenadeLasPlagas')) return false;
          // must have Flash Grenade in hand
          return s.hand.some(id => {
            const ci = state.cards[id];
            const cd = ci ? state.cardDefs[ci.cardId] : undefined;
            return cd?.id === 'we-017';
          });
        });
        if (eligibleSeats.length > 0) {
          reactiveWindow = { kind: 'jillFlashGrenade', triggeringSeat: seat, revealedInstanceId };
          for (const es of eligibleSeats) {
            reactivePrompts = [...reactivePrompts, {
              id: 'p' + (reactivePrompts.length + 1),
              seat: es.seat,
              text: 'Trash a Flash Grenade to defeat this Las Plagas infected?',
              options: es.hand.filter(id => {
                const ci = state.cards[id];
                const cd = ci ? state.cardDefs[ci.cardId] : undefined;
                return cd?.id === 'we-017';
              }),
              payload: { kind: 'jillFlashGrenade' },
            }];
          }
        }
      }
      // Reactive trash window: AC-018 Uroboros Injection — any infected revealed,
      // eligible players (holding ac-018) may trash it to give +20 HP to the revealed infected.
      const isAnyInfected = revealedDef?.type === 'infected';
      let ac018Eligible = state.seats.filter(s => {
        if (s.seat === seat || s.dead || s.downed) return false;
        return s.hand.some(id => {
          const ci = state.cards[id];
          const cd = ci ? state.cardDefs[ci.cardId] : undefined;
          return cd?.id === 'ac-018';
        });
      });
      if (isAnyInfected && ac018Eligible.length > 0 && !isLasPlagas) {
        reactiveWindow = { kind: 'uroborosInjection', triggeringSeat: seat, revealedInstanceId };
        for (const es of ac018Eligible) {
          reactivePrompts = [...reactivePrompts, {
            id: 'p' + (reactivePrompts.length + 1),
            seat: es.seat,
            text: 'Trash Uroboros Injection to give +20 HP to the revealed infected?',
            options: es.hand.filter(id => {
              const ci = state.cards[id];
              const cd = ci ? state.cardDefs[ci.cardId] : undefined;
              return cd?.id === 'ac-018';
            }),
            payload: { kind: 'uroborosInjection' },
          }];
        }
      }
      // Reactive trash window: AC-042 Fight or Flight — any infected revealed,
      // eligible players (holding ac-042 in hand) may trash it to move the
      // Infected to the bottom of the Mansion when it is stronger than the
      // Exploring Character.
      const ac042Eligible = revealedDef?.type === 'infected'
        ? state.seats.filter(s => {
            if (s.seat === seat || s.dead || s.downed) return false;
            return s.hand.some(id => cardDef(state, id)?.id === 'ac-042');
          })
        : [];
      if (ac042Eligible.length > 0) {
        reactiveWindow = { kind: 'fightOrFlight', triggeringSeat: seat, revealedInstanceId };
        for (const es of ac042Eligible) {
          reactivePrompts = [...reactivePrompts, {
            id: 'p' + (reactivePrompts.length + 1),
            seat: es.seat,
            text: 'Trash Fight or Flight to move this Infected to the bottom of the Mansion?',
            options: [...es.hand.filter(id => cardDef(state, id)?.id === 'ac-042'), 'Decline'],
            payload: { kind: 'fightOrFlight' },
          }];
        }
      }
      // Mansion attachment event cards: when revealed, the card attaches to
      // the mansion and its ongoing rules apply. Mode 1 = single attachment
      // (new replaces old); mode 2 = multiple attachments allowed.
      if (revealedDef?.type === 'event' && revealedDef.attachmentMode !== undefined) {
        const currentAttachments = state.mansionAttachments ?? [];
        let newAttachments: string[];
        // Use room-level mansionAttachmentMode if set, otherwise fall back to card's attachmentMode
        const effectiveMode = state.mansionAttachmentMode ?? revealedDef.attachmentMode;
        if (effectiveMode === 1) {
          // Mode 1: new attachment replaces all existing ones
          const oldAttachments = [...currentAttachments];
          newAttachments = [revealedInstanceId];
          // Old attachments go to removed (they're done)
          const newRemoved = [...removedAfter, ...oldAttachments.filter(id => !removedAfter.includes(id))];
          // Clear trash counters for old attachments
          const oldCounters = state.attachmentTrashCounts ?? {};
          const newCounters: Record<string, number> = {};
          for (const [k, v] of Object.entries(oldCounters)) {
            if (k !== revealedInstanceId) newCounters[k] = v;
          }
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
            removed: newRemoved,
            mansionDeck,
            mansionAttachments: newAttachments,
            attachmentTrashCounts: newCounters,
            prompts: [...reactivePrompts],
          };
        } else {
          // Mode 2: append the new attachment
          newAttachments = [...currentAttachments, revealedInstanceId];
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
            removed: removedAfter,
            mansionDeck,
            mansionAttachments: newAttachments,
            prompts: [...reactivePrompts],
          };
        }
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ev-001') {
        // Zombie Grab: trash a weapon from hand or discard pile, or take
        // 20 damage. The card is ALWAYS shuffled back into the Mansion.
        const grabWeapons = [...handAfter, ...discardAfterExplosives].filter(id => cardDef(state, id)?.type === 'weapon');
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
          removed: removedAfter,
          mansionDeck,
          prompts: [...reactivePrompts, {
            id: 'p' + (reactivePrompts.length + 1),
            seat,
            text: revealedDef.text,
            options: [...grabWeapons, 'Take 20 damage'],
            payload: { kind: 'zombieGrab', amount: '20', instanceId: revealedInstanceId },
          }],
        };
      }

      if (isNemesisPursuit(revealedDef)) {
        // EV-002 Nemesis Pursuit: removed from the game; the exploring
        // character must explore again; every Infected gets +10 Health and
        // +20 Damage for the rest of this turn.
        const buffedState = withNemesisPursuitBuff(state);
        const nemesisPlayer: PlayerState = applyNightmareGains({
          ...player,
          hand: handAfter,
          playArea: playAreaAfter,
          discard: discardAfterExplosives,
          exploresLeft: exploresLeft + grantedExplores + 1,
          turnAmmo: turnAmmoAfter,
          turnGold: turnGoldAfter,
          mustExplore: true,
        });
        return {
          ...buffedState,
          ...nextBase,
          seats: buffedState.seats.map(s => (s.seat === seat ? nemesisPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          rngState: currentRng,
          prompts: [...reactivePrompts],
        };
      }

      if (revealedDef?.type !== 'infected') {
        // Outbreak: MA-055o Antivirus resolves on reveal — the card is either
        // moved to the bottom of the Mansion or removed from the game, so it
        // never enters the Take/Send-to-bottom choice.
        const antivirusEffect = (revealedDef?.itemEffects ?? []).find(e => e.kind === 'antivirusReduceInfectionOrRemove');
        if (antivirusEffect !== undefined && antivirusEffect.kind === 'antivirusReduceInfectionOrRemove') {
          const antivirusPrompts: Prompt[] = [];
          if ((player.infectionCards?.length ?? 0) >= antivirusEffect.threshold) {
            antivirusPrompts.push({
              id: `antivirus-decrease-${seat}-v${state.version}`,
              seat,
              text: `Antivirus: decrease your Infection Level by ${antivirusEffect.amount}?`,
              options: ['Decrease', 'Decline'],
              payload: { kind: 'antivirusDecrease', instanceId: revealedInstanceId },
            });
          }
          antivirusPrompts.push({
            id: `antivirus-fate-${seat}-v${state.version}`,
            seat,
            text: 'Antivirus: move this card to the bottom of the Mansion or remove it from the game?',
            options: ['Move to bottom of Mansion', 'Remove from game'],
            payload: { kind: 'antivirusFate', instanceId: revealedInstanceId },
          });
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
            removed: removedAfter,
            mansionDeck,
            prompts: [...reactivePrompts, ...antivirusPrompts],
          };
        }
        const prompts = [
          ...reactivePrompts,
          {
            id: 'p' + (reactivePrompts.length + 1),
            seat,
            text: revealedDef?.text ?? '',
            options: ['Take', 'Send to bottom of Mansion'],
            payload: { kind: 'takeOrBottom', instanceId: revealedInstanceId },
          },
        ];
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? applyNightmareGains({ ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false }) : s)),
          removed: removedAfter,
          mansionDeck,
          prompts,
        };
      }

      // Mercenaries: same-name attached count (MA-083 Los Ganados Male).
      const sameNameAttachedCount = revealedDef?.type === 'infected'
        ? state.seats.reduce((sum, s) => sum + (s.dead ? 0 : s.attached.filter(id => state.cards[id]?.cardId === revealedDef.id).length), 0)
        : 0;
      // Mercenaries: HUNK (CH-045) reduces all damage he takes; Albert Wesker
      // (CH-049) reduces explore damage by 10 per card in his hand.
      const hunkReduction = abilities.reduce((sum, a) => (a.kind === 'damageReductionForAmmo' ? sum + a.amount : sum), 0);
      const weskerReduction = abilities.some(a => a.kind === 'exploreDamageReductionPerHandCard')
        ? (abilities.find(a => a.kind === 'exploreDamageReductionPerHandCard') as { amount: number }).amount * handAfter.length
        : 0;

      const outcome = rocketAutoDefeat
        ? { kind: 'defeated' as const, decorations: revealedDef?.decorations ?? 0, damage: 0, hp: revealedDef?.hp ?? 0 }
        : resolveExplore({
              weapons: exploreWeapons,
              ammo: ammoForEffects,
              bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + perActionBonus + selfHpBonus + costGateBonus + multiWeaponBonus + pendingSkillDamage + perDiscardCardBonus + blowbackBonus - mazeDamagePenalty(state, player.playArea.filter(id => cardDef(state, id)?.type === 'action').length),
              ammoCardsInPlayArea,
              ammoX10InDiscardCount: ammoX10CountInDiscard(state, seat),
              revealed: {
                ...revealedDef,
                hp: (revealedDef.hp ?? 0) + outbreakRevealFx.revealedHpBonus + nemesisPursuitBuff(state).hp + (((revealedDef.hp ?? 0) <= virusMutatesBonus(state).hpThreshold && virusMutatesBonus(state).hpThreshold > 0) ? virusMutatesBonus(state).hpBonus : 0) + tuaHpBonus,
                attack: (revealedDef.attack ?? 0) + outbreakRevealFx.revealedAttackBonus + nemesisPursuitBuff(state).attack,
              },
              damageReduction: infectedDamageReduction(abilities) + hunkReduction + weskerReduction,
              knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
              damageMultiplier: player.damageMultiplierThisTurn ?? 1,
              attachedInfectedCount: player.attached.length,
              sameNameAttachedCount,
              characterXp: player.xp ?? 0,
              characterAbilities: abilities,
              actionsInPlayArea: player.playArea.filter(id => cardDef(state, id)?.type === 'action').length,
              inventoryCount: player.inventory.length,
              characterDamage: Math.max(player.maxHp - player.hp, 0),
            });

      if (outcome.kind === 'insufficientAmmo') {
        throw new Error('applyAction: explore: insufficient ammo');
      }

      // AC-048 Backstab: "When your Character Explores during this turn, select
      // a Player. In that case, that Player moves 1 XP on 1 of their Character's
      // Skills to your Character, and they Discard 1 card." The target chooses
      // which of their Skills loses the XP; the Discard is chained after it.
      if (player.pendingBackstab !== undefined) {
        const targetSeat = player.pendingBackstab.targetSeat;
        state = { ...state, seats: state.seats.map(s => (s.seat === seat ? { ...s, pendingBackstab: undefined } : s)) };
        const target = state.seats[targetSeat];
        if (target !== undefined && !target.dead && !target.downed) {
          const skillIds = (target.skills ?? []).filter(id => (state.cards[id]?.xp ?? 0) >= 1);
          if (skillIds.length > 0) {
            state = { ...state, prompts: [...state.prompts, {
              id: `backstab-${targetSeat}-v${state.version}`,
              seat: targetSeat,
              text: "Backstab: move 1 XP on 1 of your Character's Skills to the attacking Character.",
              options: [...skillIds],
              payload: { kind: 'backstabChooseSkill', fromSeat: String(targetSeat), toSeat: String(seat) },
            }] };
          }
        }
      }

      // Defer explore resolution if a reactive window can still change the
      // outcome: Las Plagas (Flash Grenade) or AC-042 Fight or Flight.
      const lasPlagasDefer = revealedDef?.type === 'infected' && revealedDef?.plagas === true &&
        state.seats.some(s => {
          if (s.seat === seat || s.dead || s.downed) return false;
          if (!characterAbilities(state, s.seat).some(a => a.kind === 'offTurnFlashGrenadeLasPlagas')) return false;
          return s.hand.some(id => {
            const ci = state.cards[id];
            const cd = ci ? state.cardDefs[ci.cardId] : undefined;
            return cd?.id === 'we-017';
          });
        });
      const shouldDefer = lasPlagasDefer || ac042Eligible.length > 0;

      if (shouldDefer) {
        const pendingOutcome = outcome.kind === 'defeated' ? 'defeated' : 'notDefeated';
        const pendingDecorations = outcome.kind === 'defeated' ? player.decorations + (revealedDef.decorations ?? 0) : player.decorations;
        const pendingDamageTaken = outcome.kind === 'notDefeated' ? Math.max((revealedDef.attack ?? 0) - 0, 0) : 0;
        const pendingPlayer: PlayerState = {
          ...player,
          hand: handAfter,
          playArea: playAreaAfter,
          discard: discardAfterExplosives,
          exploresLeft,
          turnAmmo: turnAmmoAfter,
          turnGold: turnGoldAfter,
          mustExplore: false,
          decorations: pendingDecorations,
        };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false } : s)),
          removed: removedAfter,
          mansionDeck,
          rngState: currentRng,
          reactiveTrashWindow: { kind: lasPlagasDefer ? 'jillFlashGrenade' : 'fightOrFlight', triggeringSeat: seat, revealedInstanceId },
          pendingExplore: {
            seat,
            revealedInstanceId,
            outcome: pendingOutcome,
            weaponIds: weapons,
            decorations: pendingDecorations,
            decorationDelta: outcome.kind === 'defeated' ? (revealedDef.decorations ?? 0) : 0,
            damageTaken: pendingDamageTaken,
            newPlayer: pendingPlayer,
            mansionDeck,
            rngState: currentRng,
            prePlayer: player,
            revealHpThreshold: ac042Eligible.length > 0 ? player.hp : undefined,
          },
          prompts: reactivePrompts,
        };
      }

      // Outbreak: infected-card effects. Reveal effects fire as soon as the
      // Infected is revealed; the rest depend on the combat outcome.
      const infectionBySeat = new Map<number, string[]>();
      for (const s of state.seats) infectionBySeat.set(s.seat, [...(s.infectionCards ?? [])]);
      let outbreakDeck = state.infectionDeck ?? [];
      const drawInfectionsFor = (seatIdx: number, count: number): void => {
        if (count <= 0) return;
        const target = state.seats[seatIdx];
        if (target === undefined) return;
        // Jill Valentine (Outbreak) L2: at Infection Level 0 she is immune.
        if (isImmuneToInfectionEffects(characterAbilities(state, seatIdx), target.infectionCards)) return;
        const arr = infectionBySeat.get(seatIdx) ?? [];
        for (let i = 0; i < count && outbreakDeck.length > 0; i++) {
          arr.push(outbreakDeck[0] as string);
          outbreakDeck = outbreakDeck.slice(1);
        }
        infectionBySeat.set(seatIdx, arr);
      };
      /** The seat an Infected effect should actually affect. */
      const infectedEffectSeat = (): number => infectedEffectRedirectSeat ?? seat;
      // CH-032 Zombie B: characters whose Infection Level just rose.
      const zombieBAffected: number[] = [];
      if (revealedDef?.type === 'infected') {
        for (const e of revealedDef.infectedEffects ?? []) {
          if (e.kind === 'onRevealInfectionIncrease') {
            if (infectedEffectNegated) continue;
            const targetSeat = infectedEffectSeat();
            const lvl = infectionBySeat.get(targetSeat)?.length ?? 0;
            drawInfectionsFor(targetSeat, lvl <= e.threshold ? e.lowAmount : e.highAmount);
            zombieBAffected.push(targetSeat);
          } else if (e.kind === 'onRevealAllInfectionIncrease') {
            if (infectedEffectNegated) continue;
            if (infectedEffectRedirectSeat !== undefined) {
              drawInfectionsFor(infectedEffectRedirectSeat, e.amount);
              zombieBAffected.push(infectedEffectRedirectSeat);
            } else {
              for (const s of state.seats) {
                if (!s.dead && !s.downed) {
                  drawInfectionsFor(s.seat, e.amount);
                  zombieBAffected.push(s.seat);
                }
              }
            }
          }
        }
      }
      const withInfections = (p: PlayerState): PlayerState => ({
        ...p,
        infectionCards: infectionBySeat.get(p.seat) ?? p.infectionCards ?? [],
      });
      // MA-036 Reaper: "If not defeated with damage equal to its health, trash
      // 1 card with the highest cost attached to your partner." Only an exact
      // defeat (damage dealt === the Infected's health) avoids the penalty.
      const reaperEffect = revealedDef?.infectedEffects?.some(
        e => e.kind === 'trashHighestCostAttachedOnPartnerIfNotExactDefeat') ?? false;
      let reaperPartnerAttached: readonly string[] = player.partnerAttached ?? [];
      let reaperTrashed: readonly string[] = [];
      if (reaperEffect && revealedDef !== undefined) {
        const exactDefeat = outcome.kind === 'defeated' && outcome.damage === outcome.hp;
        if (!exactDefeat) {
          const attached = [...(player.partnerAttached ?? [])];
          let bestId: string | undefined;
          let bestCost = -1;
          for (const id of attached) {
            const cost = cardDef(state, id)?.cost ?? 0;
            if (cost > bestCost) { bestCost = cost; bestId = id; }
          }
          if (bestId !== undefined) {
            reaperPartnerAttached = attached.filter(id => id !== bestId);
            reaperTrashed = [bestId];
          }
        }
      }
      if (outcome.kind === 'defeated') {
        // Outbreak: on-defeat infection effects. MA-053 Lisa Trevor is not
        // attached - it goes to the bottom of the Mansion instead.
        let defeatedInfectionInc = 0;
        let defeatedToBottom = false;
        if (revealedDef?.type === 'infected' && !infectedEffectNegated) {
          for (const e of revealedDef.infectedEffects ?? []) {
            if (e.kind === 'onDefeatInfectionIncrease') {
              defeatedInfectionInc += e.amount;
              defeatedToBottom = e.toMansionBottom;
            }
          }
        }
        if (!infectedEffectNegated) {
          drawInfectionsFor(infectedEffectSeat(), defeatedInfectionInc);
          if (defeatedInfectionInc > 0) zombieBAffected.push(infectedEffectSeat());
        }
        // Mercenaries: CH-051 Barry Burton — when he defeats an infected with
        // 70 or less health, look at the top card of the Mansion; if it is an
        // infected with less health than the one defeated before it this turn,
        // automatically defeat it (the chain continues downward).
        const chainAttachedIds: string[] = [];
        const barryAbility = abilities.find(a => a.kind === 'onDefeatChainLowerHp');
        if (barryAbility !== undefined && barryAbility.kind === 'onDefeatChainLowerHp' &&
            (revealedDef.hp ?? 0) <= barryAbility.hpThreshold) {
          let lastHp = revealedDef.hp ?? 0;
          while (mansionDeck.length > 0) {
            const topId = mansionDeck[0];
            if (topId === undefined) break;
            const topDef = cardDef(state, topId);
            if (topDef?.type !== 'infected') break;
            if ((topDef.hp ?? 0) >= lastHp) break;
            mansionDeck = mansionDeck.slice(1);
            chainAttachedIds.push(topId);
            lastHp = topDef.hp ?? 0;
          }
        }
        // MA-000 Rachael Foley (ooze): defeated with `maxDamage` or less, it is
        // shuffled back into the Mansion instead of attached (its Decoration is
        // still awarded, like MA-053 Lisa Trevor's bottom-of-Mansion fate).
        const oozeShuffleBack = !infectedEffectNegated && revealedDef?.type === 'infected' &&
          oozeShufflesBackOnDefeat(revealedDef, outcome.damage);
        // The Decoration total is adjusted for the Combo Pile change so MA-077
        // Chicken — worth 0 while in a Combo Pile by itself — is handled.
        const newAttachedIds = [...player.attached, revealedInstanceId, ...chainAttachedIds];
        const decorations = player.decorations
          + decorationDelta(state, player.attached, newAttachedIds)
          // JM-001 Jake Muller L2: +amount for each high-Health Infected he
          // defeats (Barry-chain trophies included).
          + jakeDefeatDecorationBonus(state, seat, [revealedInstanceId, ...chainAttachedIds]);
        const maximizerXp = (revealedDef.decorations ?? 0) >= 2 &&
          activeSkillEffects(state, seat).some(e => e.kind === 'xpOnDefeatHighDecoration') ? 1 : 0;
        const charDef = cardDef(state, player.characterInstanceId);
        // MA-047 Reinforced Zombie: while attached, the character's Decoration
        // requirement for Level 2 is reduced by `amount` per copy attached.
        let level2At = charDef?.level2At ?? 0;
        for (const aid of newAttachedIds) {
          const ai = state.cards[aid];
          const ad = ai === undefined ? undefined : state.cardDefs[ai.cardId];
          const eff = ad?.infectedEffects?.find(e => e.kind === 'reduceLevel2DecorationRequirement');
          if (eff !== undefined && eff.kind === 'reduceLevel2DecorationRequirement') level2At -= eff.amount;
        }
        const level = charDef !== undefined
          ? levelForDecorations(charDef.level1At, Math.max(level2At, charDef.level1At ?? 0), decorations)
          : player.level;
        const sergeiExploreBonus = exploreOnInfectedDefeat(abilities);
        const singleDefeatHeal = healOnDefeatWithWeaponTag(state, seat, abilities, weapons);
        const newPlayer: PlayerState = applyNightmareGains({
                  ...player,
                  hand: handAfter,
                  playArea: playAreaAfter,
                  discard: discardAfterExplosives,
                  exploresLeft: exploresLeft + sergeiExploreBonus + grantedExplores,
                  turnAmmo: turnAmmoAfter,
                  turnGold: turnGoldAfter,
                  mustExplore: false,
                  decorations,
                  level,
                  hp: Math.min(player.hp + singleDefeatHeal, player.maxHp),
                  xp: (player.xp ?? 0) + 1 + maximizerXp + virusMutatesBonus(state).xpBonus,
                  pendingSkillEffects: undefined,
                  pendingBackstab: undefined,
                  attached: (defeatedToBottom || oozeShuffleBack) ? player.attached : [...player.attached, revealedInstanceId, ...chainAttachedIds],
                  partnerAttached: reaperPartnerAttached,
                  infectionCards: infectionBySeat.get(seat) ?? player.infectionCards ?? [],
                });
        const hasSkip = !infectedEffectNegated && (revealedDef?.infectedEffects?.some(e => e.kind === 'skipNextTurnOfAPlayerOnDefeat') ?? false);
        const hasNoActions = !infectedEffectNegated && (revealedDef?.infectedEffects?.some(e => e.kind === 'noActionsNextTurnOfAPlayerOnDefeat') ?? false);
        const defeatPrompts = (hasSkip || hasNoActions)
          ? [...state.prompts, {
              id: 'p' + (state.prompts.length + 1),
              seat,
              text: infectedEffectRedirectSeat !== undefined
                ? `This Infected's effect is redirected to ${state.seats[infectedEffectRedirectSeat]?.name ?? 'another Player'}.`
                : 'Choose a player.',
              options: infectedEffectRedirectSeat !== undefined
                ? [String(infectedEffectRedirectSeat)]
                : state.seats.filter(s => !s.dead && !s.downed).map(s => String(s.seat)),
              payload: { kind: hasSkip ? 'skipNextTurn' : 'noActionsNextTurn' },
            }]
          : state.prompts;
        if (defeatedToBottom) {
          const bottomed = sendToBottom({ deck: mansionDeck }, revealedInstanceId);
          mansionDeck = bottomed.deck;
        }
        // Luis Sera (Nightmare) L2: on defeating an Infected, may move any
        // number of cards from the discard pile to the bottom of the Inventory.
        const luisPrompts = movesDiscardToInventoryOnDefeat(abilities) && newPlayer.discard.length > 0
          ? [...defeatPrompts, {
              id: 'p' + (defeatPrompts.length + 1),
              seat,
              text: 'Move any number of cards from your discard to the bottom of your Inventory.',
              options: [...newPlayer.discard, 'DONE'],
              payload: { kind: 'luisSeraDiscardToInventory' },
            }]
          : defeatPrompts;
        // Carlos Oliveira (Alliance) L2: a perfect explore (damage dealt equals
        // the Revealed Infected's health) lets him take one card from his
        // Discard Pile into his hand.
        const carlosPrompts = hasPerfectExploreReward(abilities) &&
          outcome.damage === outcome.hp && newPlayer.discard.length > 0
          ? [...luisPrompts, {
              id: 'p' + (luisPrompts.length + 1),
              seat,
              text: 'Take one card from your Discard Pile into your hand.',
              options: [...newPlayer.discard],
              payload: { kind: 'perfectExploreReward' },
            }]
          : luisPrompts;
        // Mysterious Mask (Nightmare) L1: on defeating an Infected, may trash a
        // card from the discard pile.
        const maskPrompts = trashCardFromDiscardOnInfectedDefeat(abilities) && newPlayer.discard.length > 0
          ? [...carlosPrompts, {
              id: 'p' + (carlosPrompts.length + 1),
              seat,
              text: 'Mysterious Mask: trash a card from your Discard Pile.',
              options: [...newPlayer.discard, 'Decline'],
              payload: { kind: 'maskTrashDiscard' },
            }]
          : carlosPrompts;
        // Leon S. Kennedy (Nightmare) L1: on defeating an Infected, may trash a
        // discard card then gain one costing up to 20 more.
        const leonPrompts = trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat(abilities) && newPlayer.discard.length > 0
          ? [...maskPrompts, {
              id: 'p' + (maskPrompts.length + 1),
              seat,
              text: 'Leon: trash a card from your Discard Pile, then gain a card costing up to 20 more than it.',
              options: [...newPlayer.discard, 'Decline'],
              payload: { kind: 'leonTrashForGain' },
            }]
          : maskPrompts;
        // MA-030 Cephalo (Las Plagas): on defeat, choose a player who must
        // Explore on their next turn.
        const cephaloPrompt: Prompt | undefined = revealedDef?.infectedEffects?.some(
          e => e.kind === 'mustExploreNextTurnOnDefeat') && !infectedEffectNegated
          ? {
              id: 'p' + (leonPrompts.length + 1),
              seat,
              text: 'Cephalo: choose a player. That player must Explore on their next turn.',
              options: state.seats.filter(s => !s.dead && !s.downed).map(s => String(s.seat)),
              payload: { kind: 'cephaloChoosePlayer' },
            }
          : undefined;
        const cephaloPrompts = cephaloPrompt !== undefined ? [...leonPrompts, cephaloPrompt] : leonPrompts;
        // CH-032 Zombie B reacts to any Infection Level rise this explore caused.
        const zombieBDefeatedPrompts = zombieBAffected.flatMap(seatIdx => zombieBPrompts(state, seatIdx, state.version));
        // Mercenaries: on-defeat infected effects + character/weapon abilities
        // (MA-073/074/088/093/094/096/098, CH-047 Chris, WE-044/045/050).
        let defeatFxState: GameState = {
          ...state,
          removed: [...removedAfter, ...reaperTrashed.filter(id => !removedAfter.includes(id))],
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
        };
        const defeatFxPrompts: Prompt[] = [];
        for (const cid of [revealedInstanceId, ...chainAttachedIds]) {
          const cdef = cardDef(state, cid);
          if (cdef === undefined) continue;
          const r = applyMercenariesDefeatEffects(defeatFxState, { ...mercCtx, revealedInstanceId: cid, revealedDef: cdef });
          defeatFxState = r.state;
          defeatFxPrompts.push(...r.prompts);
        }
        const onDefeatFx = applyMercenariesOnDefeatAbilities(defeatFxState, mercCtx);
        defeatFxState = onDefeatFx.state;
        defeatFxPrompts.push(...onDefeatFx.prompts);

        // Nightmare: on-defeat infected effects (MA-055 Bitores Mendez,
        // MA-057 Jack Krauser, MA-063 Zombie Security Guard, MA-066 Ivy).
        const nightmareDefeatFx = applyNightmareDefeatEffects(defeatFxState, { seat, revealedInstanceId, revealedDef: revealedDef as CardDef, weapons });
        defeatFxState = nightmareDefeatFx.state;
        defeatFxPrompts.push(...nightmareDefeatFx.prompts);
        // Custom card line: CI-009 shuffles a fresh copy of the named Ooze into
        // the Mansion when it is defeated; MA-000 (ooze) is shuffled straight
        // back when the defeat damage was 80 or less. `defeatFxState` still
        // carries the PRE-reveal deck here, so hand it the local post-reveal
        // `mansionDeck` before the helpers read it.
        defeatFxState = { ...defeatFxState, mansionDeck };
        if (!infectedEffectNegated && revealedDef?.type === 'infected') {
          for (const e of revealedDef.infectedEffects ?? []) {
            if (e.kind === 'onDefeatShuffleCardIntoMansion') {
              defeatFxState = shuffleCopyIntoMansion(defeatFxState, e.cardId);
              mansionDeck = defeatFxState.mansionDeck;
            }
          }
        }
        if (oozeShuffleBack) {
          defeatFxState = shuffleIntoMansion(defeatFxState, revealedInstanceId);
          mansionDeck = defeatFxState.mansionDeck;
        }
        // Custom card line: CI-003's 10x Ammo lands after the seat rebuild.
        if (saddlerAmmoGrant > 0) {
          for (const s of defeatFxState.seats) {
            if (!s.dead) defeatFxState = gainAmmoX10(defeatFxState, s.seat, saddlerAmmoGrant);
          }
        }
        // MA-092 reveal gains apply AFTER the explore's own seat updates.
        for (const g of revealGains) defeatFxState = gainCopy(defeatFxState, g.seat, g.cardId);
        return {
          ...defeatFxState,
          ...nextBase,
          seats: defeatFxState.seats.map(s => (
            s.seat === seat
              ? s
              : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }
          )),
          mansionDeck,
          rngState: defeatFxState.rngState,
          prompts: [...cephaloPrompts, ...defeatFxPrompts, ...zombieBDefeatedPrompts],
          ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),
        };
      }

      // outcome.kind === 'notDefeated' here (nonInfected can't reach this
      // branch: the reveal was infected; guard for the type system anyway)
      if (outcome.kind !== 'notDefeated') {
        throw new Error('applyAction: explore: unexpected non-infected reveal');
      }
      // JM-001 Jake Muller L1: a hit greater than the threshold trashes the top
      // `count` cards of his Discard Pile. The explore rebuilds the seat below,
      // so the ids are collected here and subtracted from its discard local.
      const jakeTrashed = trashTopFromDiscardIds(state, seat, outcome.damageTaken);
      // Hunk L1: damageRedirectToPartner — when Hunk would take damage and has
      // a partner, redirect the damage to his partner instead (partner absorbs
      // it; Hunk takes none). Automatic redirect when a partner is present.
      const hasDamageRedirect = abilities.some(a => a.kind === 'damageRedirectToPartner');
      const leadingIsPartner = exploreLeader === 'partner' && !!player.partnerInstanceId;
      const baseLeadingHp = leadingIsPartner ? (player.partnerHp ?? player.hp) : player.hp;
      // Ada (Nightmare) L2: lethal damage sets her HP to 10 instead of 0 -
      // only when she is the one taking the damage (never a leading partner).
      const damageOnAda = !leadingIsPartner && !(hasDamageRedirect && player.partnerInstanceId);
      // Mercenaries: Toughness LV.2 (-10 all damage), Luck LV.1 (lethal hit
      // becomes 10 while at 20+ HP), Giant Killing LV.1 (40+ HP Infected deals 0).
      const damageSkillEffects = activeSkillEffects(state, seat);
      // SK-008 Luck LV.2: a declared reaction negates this Damage entirely (the
      // Skill's XP is removed as the printed cost).
      const negateConsumption = consumeNegateDamage(state, seat);
      state = negateConsumption.state;
      const skillReduction = skillDamageReduction(damageSkillEffects);
      const giantThreshold = skillGiantKillingThreshold(damageSkillEffects);
      const skillSuppressed = giantThreshold !== undefined && (revealedDef?.hp ?? 0) >= giantThreshold;
      const skillLethal = skillLethalReplacementAmount(damageSkillEffects);
      const rawSkillDamage = (skillSuppressed || negateConsumption.negated)
        ? 0
        : Math.max((outcome.damageTaken ?? 0) - skillReduction, 0);
      const effectiveSkillDamage = rawSkillDamage >= baseLeadingHp && baseLeadingHp >= 20 && skillLethal !== undefined
        ? skillLethal
        : rawSkillDamage;
      // MA-054o Kevlar Jacket: the jacket absorbs this damage and is moved to
      // the bottom of the Mansion.
      const kevlar = applyDamageWithKevlar(state, seat, effectiveSkillDamage);
      state = kevlar.state;
      // The jacket joined the bottom of the deck; keep the local deck in sync
      // or the return below (which spreads this local) drops it into no zone.
      // Append ONLY the moved jacket: `state.mansionDeck` is still the
      // pre-reveal deck (the reveal lives in this local), so reading it
      // back would restore the revealed card and duplicate it below.
      for (const id of kevlar.movedIds) {
        if (!mansionDeck.includes(id)) mansionDeck = [...mansionDeck, id];
      }

      let newLeadingHp: number;
      if (damageOnAda) {
        const ric = applyRicardoDamage(state, seat, baseLeadingHp, kevlar.damage);
        state = ric.state;
        newLeadingHp = ric.hp;
      } else {
        const reduce = player.downed || player.dead ? 0 : ricardoReduction(abilities, kevlar.damage);
        newLeadingHp = Math.max(baseLeadingHp - Math.max(kevlar.damage - reduce, 0), 0);
        if (reduce > 0) state = queueRicardoL2Prompt(state, seat, kevlar.damage, reduce);
      }
      const newHp = leadingIsPartner ? player.hp : newLeadingHp;
      let downed = false;
      let hand: readonly string[] = handAfter;
      // JM-001 Jake Muller L1: the trashed ids leave the Discard Pile.
      const discardAfterJake = discardAfterExplosives.filter(id => !jakeTrashed.includes(id));
      let discard: readonly string[] = discardAfterJake;
      let inventory: readonly string[] = player.inventory;

      let resuscitatePending = false;
      let resuscitatePrompts: Prompt[] = [];
      if (newHp === 0) {
        // AC-050 Resuscitate: a holder may trash it from hand or play area to
        // set the Character's Health to 10 instead of downing them. The seat is
        // held at 10 HP while the decision is pending; if nobody trashes a
        // Resuscitate, the down is applied to the CURRENT state at resolution.
        const resuscitateHolders = state.seats.filter(s => !s.dead &&
          [...s.hand, ...s.playArea].some(id => state.cards[id]?.cardId === 'ac-050'));
        if (resuscitateHolders.length > 0) {
          resuscitatePending = true;
          resuscitatePrompts = resuscitateHolders.map(s => ({
            id: `resuscitate-${s.seat}-${state.version}`,
            seat: s.seat,
            text: `${player.name} would be reduced to 0 Health. Trash Resuscitate to set their Health to 10 instead?`,
            options: [...s.hand.filter(id => state.cards[id]?.cardId === 'ac-050'), ...s.playArea.filter(id => state.cards[id]?.cardId === 'ac-050'), 'Decline'],
            payload: { kind: 'resuscitate', targetSeat: String(seat) },
          }));
        } else {
          const flipResult = flipDown(
            {
              hp: newHp,
              maxHp: player.maxHp,
              decorations: player.decorations,
              level: player.level,
              downed: false,
              dead: false,
              hand: handAfter,
              discard: discardAfterJake,
              inventory: player.inventory,
            },
            rngShuffle,
          );
          downed = flipResult.downed;
          hand = flipResult.hand;
          discard = flipResult.discard;
          inventory = flipResult.inventory;
        }
      }

      // MA-025 Duvalia (Las Plagas): "When this infected kills a character, the
      // player with the most decorations gains five Ammo x 10 cards." A pending
      // Resuscitate means the character is not killed yet.
      const duvaliaEffect = revealedDef?.infectedEffects?.find(
        e => e.kind === 'onKillGainAmmoX10ToMostDecorated');
      if (duvaliaEffect !== undefined && duvaliaEffect.kind === 'onKillGainAmmoX10ToMostDecorated' &&
          !infectedEffectNegated && newLeadingHp <= 0 && !resuscitatePending) {
        const alive = state.seats.filter(s => !s.dead && !s.downed);
        if (alive.length > 0) {
          const maxDeco = Math.max(...alive.map(s => s.decorations));
          const tied = alive.filter(s => s.decorations === maxDeco);
          const bestHp = Math.max(...tied.map(s => s.hp));
          const chosen = tied.filter(s => s.hp === bestHp).map(s => s.seat)[0];
          if (chosen !== undefined) state = gainAmmoX10(state, chosen, duvaliaEffect.count);
        }
      }

      // Outbreak: not-defeated effects (MA-041 Tyrant T-002, MA-046 Web Spinner).
      let outbreakShuffledBack = false;
      if (revealedDef?.type === 'infected') {
        for (const e of revealedDef.infectedEffects ?? []) {
          if (e.kind === 'onNotDefeatedInfectionIncrease') {
            if (infectedEffectNegated) continue;
            drawInfectionsFor(infectedEffectSeat(), e.amount + e.perLevel * player.level);
            zombieBAffected.push(infectedEffectSeat());
          } else if (e.kind === 'onNotDefeatedShuffleBack') {
            const shuffled = shuffleBack({ deck: mansionDeck }, revealedInstanceId, rngShuffle);
            mansionDeck = shuffled.deck;
            outbreakShuffledBack = true;
          } else if (e.kind === 'onNotDefeatedAttachCounter') {
            // Unofficial Expansion: EX-006 Web Spinner / EX-008 Yawn attach a
            // Poison counter to the Character who initiated the Exploration.
            if (infectedEffectNegated) continue;
            state = attachCounterToSeat(state, infectedEffectSeat(), e.counterCardId);
          }
        }
      }

      // Partner Modification: a partner reduced to 0 Health dies — its Skill
      // and any XP on it are Removed from the Game.
      const partnerDied = leadingIsPartner && newLeadingHp <= 0;
      const afterPartnerDeath = partnerDied ? removePartnerSkill(state, seat) : state;
      const newPlayer: PlayerState = applyNightmareGains({
              ...player,
              hand,
              playArea: playAreaAfter,
              discard,
              inventory,
              attached: (state.seats[seat] as PlayerState).attached,
              // EX-006/EX-008 may have attached a Poison counter to this seat
              // since `player` was read — carry the live value forward.
              counters: (state.seats[seat] as PlayerState).counters,
              exploresLeft: exploresLeft + grantedExplores,
              turnAmmo: turnAmmoAfter,
              turnGold: turnGoldAfter,
              mustExplore: false,
              hp: resuscitatePending ? 10 : newHp,
              xp: (player.xp ?? 0) + 1,
              pendingSkillEffects: undefined,
              pendingBackstab: undefined,
              ...(leadingIsPartner ? { partnerHp: newLeadingHp } : {}),
              partnerAttached: reaperPartnerAttached,
              ...(partnerDied
                ? {
                    partnerInstanceId: undefined,
                    partnerAttached: undefined,
                    partnerLeading: undefined,
                    partnerSkillId: undefined,
                    partnerHp: undefined,
                    partnerMaxHp: undefined,
                  }
                : {}),
              downed,
              infectionCards: infectionBySeat.get(seat) ?? player.infectionCards ?? [],
            });
      const removedFinal = partnerDied
        ? [...removedAfter, ...afterPartnerDeath.removed.filter(id => !removedAfter.includes(id))]
        : removedAfter;
      const removedWithReaper = [
        ...removedFinal,
        ...reaperTrashed.filter(id => !removedFinal.includes(id)),
        // JM-001 Jake Muller L1.
        ...jakeTrashed.filter(id => !removedFinal.includes(id)),
        // Alliance Partner Modification (3) PARTNER DEATH: trash every card the
        // dead Partner had attached.
        ...(partnerDied ? reaperPartnerAttached.filter(id => !removedFinal.includes(id)) : []),
      ];

      // Mercenaries: not-defeated infected effects (MA-075/078/079/082/090).
      // Applied on top of the post-explore player so max-HP / inventory / ammo
      // changes are not overwritten by the explore's own updates.
      state = {
        ...afterPartnerDeath,
        removed: removedWithReaper,
        mansionDeck,
        seats: afterPartnerDeath.seats.map(s => (s.seat === seat ? newPlayer : s)),
      };
      const notDefeatedFx = infectedEffectNegated
        ? { state, prompts: [] as Prompt[], infectedShuffledBack: false }
        : applyMercenariesNotDefeatedEffects(state, mercCtx);
      state = notDefeatedFx.state;
      mansionDeck = state.mansionDeck;
      if (notDefeatedFx.prompts.length > 0) {
        state = { ...state, prompts: [...state.prompts, ...notDefeatedFx.prompts] };
      }

      // Custom card line: CI-001 Oscar tramples the exploring Character when
      // he is not defeated, trashing the highest-Damage Weapon(s) they used.
      if (!infectedEffectNegated && revealedDef?.type === 'infected' &&
          (revealedDef.infectedEffects ?? []).some(e => e.kind === 'onNotDefeatedTrashHighestDamageUsedWeapons')) {
        state = trashHighestDamageUsedWeapons(state, weapons);
      }
      // Custom card line: CI-003's 10x Ammo lands after the seat rebuild.
      if (saddlerAmmoGrant > 0) {
        for (const s of state.seats) {
          if (!s.dead) state = gainAmmoX10(state, s.seat, saddlerAmmoGrant);
        }
      }

      // Nightmare: on-not-defeated infected effects (MA-054 Osmund Saddler).
      const nightmareNotDefeatedFx = applyNightmareNotDefeatedEffects(state, { seat, revealedInstanceId, revealedDef: revealedDef as CardDef, weapons });
      state = nightmareNotDefeatedFx.state;
      // MA-092 reveal gains apply AFTER the explore's own seat updates.
      for (const g of revealGains) state = gainCopy(state, g.seat, g.cardId);

      const insertEffect = revealedDef?.infectedEffects?.find(e => e.kind === 'onNotDefeatedInsertIntoMansionAt');
      const insertPosition = !infectedEffectNegated && insertEffect !== undefined && insertEffect.kind === 'onNotDefeatedInsertIntoMansionAt'
        ? insertEffect.position
        : undefined;
      // AH-001 Abandon All Hope: if active and this is the Boss, insert at top 10
      const isBoss = state.endInfectedCardId !== undefined && revealedDef?.id === state.endInfectedCardId;
      const bossShuffleToTop10 = state.storyModeBossShuffleActive === true && isBoss && outcome.kind === 'notDefeated';
      if (bossShuffleToTop10) {
        const inserted = insertAt({ deck: mansionDeck }, revealedInstanceId, 10);
        mansionDeck = inserted.deck;
      } else if (insertPosition !== undefined) {
        const inserted = insertAt({ deck: mansionDeck }, revealedInstanceId, insertPosition);
        mansionDeck = inserted.deck;
      } else if (outcome.shuffleBack) {
        const shuffled = shuffleBack({ deck: mansionDeck }, revealedInstanceId, rngShuffle);
        mansionDeck = shuffled.deck;
      } else if (!outbreakShuffledBack && !notDefeatedFx.infectedShuffledBack) {
        const bottomed = sendToBottom({ deck: mansionDeck }, revealedInstanceId);
        mansionDeck = bottomed.deck;
      }

      // CH-032 Zombie B reacts to any Infection Level rise this explore caused.
      const zombieBNotDefeatedPrompts = zombieBAffected.flatMap(seatIdx => zombieBPrompts(state, seatIdx, state.version));

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (
          s.seat === seat
            ? s
            : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }
        )),
        mansionDeck,
        rngState: state.rngState,
        prompts: [...state.prompts, ...resuscitatePrompts, ...zombieBNotDefeatedPrompts],
        ...(resuscitatePending ? { pendingResuscitate: { seat } } : {}),
        ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),
      };
    }

    case 'removeAttachedItem': {
      const { seat, instanceId } = action;
      const player = state.seats[seat] as PlayerState;
      const def = cardDef(state, instanceId);
      const effect = (def?.itemEffects ?? []).find(e => e.kind === 'attachThenRemoveForCardsAndGold');
      if (def === undefined || effect === undefined || effect.kind !== 'attachThenRemoveForCardsAndGold') {
        return { ...state, ...nextBase };
      }
      if (!player.attached.includes(instanceId)) return { ...state, ...nextBase };
      let s: GameState = {
        ...state,
        ...nextBase,
        seats: state.seats.map(x => (x.seat === seat
          ? { ...x, attached: x.attached.filter(id => id !== instanceId), turnGold: x.turnGold + effect.gold }
          : x)),
        removed: [...state.removed, instanceId],
      };
      if (effect.cards > 0) {
        const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: effect.cards, rngState: s.rngState });
        s = {
          ...s,
          rngState: d.rngState,
          seats: s.seats.map(x => (x.seat === seat
            ? { ...x, hand: [...x.hand, ...d.hand], inventory: d.deck, discard: d.discard }
            : x)),
        };
      }
      return s;
    }

    case 'buy': {
      const { seat, pileId } = action;
      const player = state.seats[seat] as PlayerState;
      const pile = state.marketPiles[pileId];
      if (pile === undefined) {
        throw new Error('applyAction: buy: unknown pile: ' + pileId);
      }
      const boughtInstanceId = pile.cards[0] as string;
      const boughtDef = cardDef(state, boughtInstanceId);
      // Mikhail Victor L1 / Billy Coen L1: weapons cost `amount` less to buy
      // (Billy's reduction is tag-scoped to melee). Shared helper so the
      // apply path and validate's affordability check cannot drift.
      const cost = buyCostAfterReduction(characterAbilities(state, seat), boughtDef);

      // Carlos Oliveira L2: on buy card cost >= threshold, +amount explore.
      const charInst = state.cards[player.characterInstanceId];
      const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];

      // Carlos Oliveira L2: on buy card cost >= threshold, +amount explore.
      const exploreAbility = charDef?.abilities !== undefined
        ? abilitiesForLevel(charDef.abilities, player.level).find(a => a.kind === 'exploreOnBuyCardCostAtLeast')
        : undefined;
      const boughtCost = boughtDef?.cost ?? 0;
      const bonusExplores = (exploreAbility !== undefined && boughtCost >= (exploreAbility as { threshold: number }).threshold)
        ? (exploreAbility as { amount: number }).amount
        : 0;

      const marketPiles = { ...state.marketPiles, [pileId]: { pileId, cards: pile.cards.slice(1) } };

      let s: GameState = {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? {
          ...player,
          turnGold: player.turnGold - cost,
          buysLeft: player.buysLeft - 1,
          exploresLeft: player.exploresLeft + bonusExplores,
        } : s)),
        marketPiles,
      };
      // Centralized gain: the bought instance moves from its market pile into
      // the discard (or to hand under Gathering Forces). Passing instanceId
      // keeps the physical card's identity instead of minting a duplicate.
      s = gainCard(s, {
        seat,
        cardId: boughtDef?.id ?? (boughtInstanceId.split('#')[0] as string),
        instanceId: boughtInstanceId,
        destination: 'discard',
        reason: 'buy',
      });
      // The log entry only carries the pileId, and a single-card pile is empty
      // by the time the history is rendered — record the physical card so the
      // line can still name it (the custom EX piles are all single-card).
      {
        const log = [...s.log];
        const last = log[log.length - 1];
        if (last !== undefined && last.action.type === 'buy') {
          log[log.length - 1] = { ...last, action: { ...last.action, instanceId: boughtInstanceId } };
        }
        s = { ...s, log };
      }

      // CH-050 Rebecca Chambers (Mercenaries) L1: "When you buy a card, you may
      // move that card to another player's discard pile."
      if (seatAbilities(s, seat).some(a => a.kind === 'buyRedirectToPlayerDiscard')) {
        const others = s.seats.filter(x => x.seat !== seat && !x.dead && !x.downed);
        if (others.length > 0) {
          return {
            ...s,
            prompts: [...s.prompts, {
              id: `rebecca-buy-${seat}-v${s.version}`,
              seat,
              text: `Move ${boughtDef?.name ?? 'the bought card'} to another player's discard pile?`,
              options: [...others.map(x => String(x.seat)), 'Keep'],
              payload: { kind: 'rebeccaBuyRedirect', instanceId: boughtInstanceId },
            }],
          };
        }
      }

      return s;
    }

    case 'useCharacterAbility': {
          const { seat, abilityIndex } = action;
          const player = state.seats[seat] as PlayerState;
          // Alliance Partner Modification: the ability may belong to the Main
          // character or to the Partner.
          const source = characterSource(state, seat, action.character ?? 'main');
          const charDef = source?.def;
          const ability = charDef?.abilities?.[abilityIndex];
          if (charDef === undefined || ability === undefined) {
            // validate already guaranteed these exist; guard for the type system.
            return { ...state, ...nextBase };
          }
          const promptId = `ability-${seat}-v${nextBase.version}-${abilityIndex}`;
          switch (ability.kind) {
            case 'plusDamageThisTurn': {
              // Barry L1: one of Barry's weapons gets +amount damage this turn
              // (once per turn — enforced by validate's log scan).
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s =>
                  s.seat === seat
                    ? { ...player, weaponDamageBonusThisTurn: player.weaponDamageBonusThisTurn + ability.amount }
                    : s,
                ),
              };
            }
            case 'exchangeHandWithInventoryTop': {
              // Sheva L1: choose a hand card; it swaps with the top of Inventory.
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Exchange 1 card in hand with the top card of your Inventory.',
                    options: [...player.hand],
                    payload: { kind: 'exchangeHandWithInventoryTop' },
                  },
                ],
              };
            }
            case 'revealMansionTopNoEffect': {
              // Ada L1: look at the Mansion top without engaging; it stays put.
              const topId = state.mansionDeck[0];
              const topDef = topId === undefined ? undefined : cardDef(state, topId);
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: `You peek at the Mansion: ${topDef?.name ?? 'an unknown card'} (${topDef?.hp ?? '?'} HP). It stays on top.`,
                    options: ['OK'],
                    payload: { kind: 'lookAtMansionTop' },
                  },
                ],
              };
            }
            case 'revealInventoryTopForAction': {
              // Ricardo Irving (Custom CU-001) L1: reveal the top of your
              // Inventory; when it is an Action, it moves to your hand.
              const invTopId = player.inventory[0];
              const invTopDef = invTopId === undefined ? undefined : cardDef(state, invTopId);
              const movedId = invTopDef?.type === 'action' ? invTopId : undefined;
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? {
                      ...s,
                      inventory: movedId === undefined ? s.inventory : s.inventory.slice(1),
                      hand: movedId === undefined ? s.hand : [...s.hand, movedId],
                    }
                  : s)),
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: movedId === undefined
                      ? `You reveal ${invTopDef?.name ?? 'a card'} — not an Action. It stays on top of your Inventory.`
                      : `You reveal ${invTopDef?.name ?? 'a card'} — an Action. It moves to your hand.`,
                    options: ['OK'],
                    payload: { kind: 'revealInventoryTop' },
                  },
                ],
              };
            }
            case 'drawFromInventoryOncePerTurn': {
              // FCH-001 Carlos Oliveira L1: draw top of inventory; Weapon/Ammo
              // goes to hand, anything else is discarded.
              const invTopId = player.inventory[0];
              if (invTopId === undefined) {
                return {
                  ...state,
                  ...nextBase,
                  prompts: [
                    ...state.prompts,
                    {
                      id: promptId,
                      seat,
                      text: 'Your Inventory is empty.',
                      options: ['OK'],
                      payload: { kind: 'carlosDrawFromInventory' },
                    },
                  ],
                };
              }
              const invTopDef = cardDef(state, invTopId);
              const isWeaponOrAmmo = invTopDef?.type === 'weapon' || invTopDef?.type === 'ammunition';
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? {
                      ...s,
                      inventory: s.inventory.slice(1),
                      hand: isWeaponOrAmmo ? [...s.hand, invTopId] : s.hand,
                      discard: isWeaponOrAmmo ? s.discard : [...s.discard, invTopId],
                    }
                  : s)),
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: isWeaponOrAmmo
                      ? `You draw ${invTopDef?.name ?? 'a card'} — it goes to your hand.`
                      : `You draw ${invTopDef?.name ?? 'a card'} — it is discarded.`,
                    options: ['OK'],
                    payload: { kind: 'carlosDrawFromInventory' },
                  },
                ],
              };
            }
            case 'discardActionCardFromHandForPlusTwoCards': {
              // Mysterious Mask (Nightmare) L2: discard one Action card from
              // hand for +2 cards.
              const actionsInHand = player.hand.filter(id => cardDef(state, id)?.type === 'action');
              if (actionsInHand.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [...state.prompts, {
                  id: promptId,
                  seat,
                  text: 'Mysterious Mask: discard one Action card from your hand for +2 cards.',
                  options: [...actionsInHand, 'Decline'],
                  payload: { kind: 'maskDiscardActionForCards' },
                }],
              };
            }
            case 'trashFromHandAtWill': {
              // Rebecca L2: trash any number of cards from hand (DONE ends).
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Trash any number of cards from your hand.',
                    options: [...player.hand, 'DONE'],
                    payload: { kind: 'trashFromHandAtWill' },
                  },
                ],
              };
            }
            case 'discardAnyForAmmo': {
              // Chris Redfield (Outbreak) L1: discard any number of cards from
              // hand, then gain +amount Ammo for each card discarded.
              const amount = (seatAbilities(state, seat).find(a => a.kind === 'discardAnyForAmmo') as { amount: number } | undefined)?.amount ?? 0;
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Discard any number of cards from your hand for Ammo.',
                    options: [...player.hand, 'DONE'],
                    payload: { kind: 'discardAnyForAmmo', count: '0', amount: String(amount) },
                  },
                ],
              };
            }
            case 'gainInfectionForGold': {
              // Excella Gionne (Outbreak) L1: +1 Infection Level for +amount Gold.
              const deck = state.infectionDeck ?? [];
              const topInfection = deck[0];
              const amount = (seatAbilities(state, seat).find(a => a.kind === 'gainInfectionForGold') as { amount: number } | undefined)?.amount ?? 0;
              return {
                ...state,
                ...nextBase,
                ...(state.infectionDeck !== undefined ? { infectionDeck: deck.slice(1) } : {}),
                seats: state.seats.map(s => (s.seat === seat
                  ? {
                      ...player,
                      infectionCards: topInfection !== undefined ? [...(player.infectionCards ?? []), topInfection] : (player.infectionCards ?? []),
                      turnGold: player.turnGold + amount,
                    }
                  : s)),
              };
            }
            case 'moveHandCardToTopOfInventory': {
              // Leon S. Kennedy (Outbreak) L1: put a card from hand on top of the Inventory.
              // No cards to move -> no prompt (an empty option list would deadlock the seat).
              if (player.hand.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Put a card from your hand on top of your Inventory.',
                    options: player.hand,
                    payload: { kind: 'leonHandToInventoryTop' },
                  },
                ],
              };
            }
            case 'discardForActionFromDiscard': {
              // Leon S. Kennedy (Outbreak) L2: discard a card, then move an action
              // card from the discard pile to your hand.
              // No cards to discard -> no prompt (an empty option list would deadlock the seat).
              if (player.hand.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Discard one card from your hand.',
                    options: player.hand,
                    payload: { kind: 'leonDiscardForAction' },
                  },
                ],
              };
            }
            case 'gainSpecificWeaponIntoInventory': {
              // Kevin Ryman (Outbreak) L1: shuffle a Samurai Edge from the
              // Resource Area (or from outside the game) into the Inventory.
              const cardId = (seatAbilities(state, seat).find(a => a.kind === 'gainSpecificWeaponIntoInventory') as { cardId: string } | undefined)?.cardId ?? 'we-027';
              let gainedId: string | undefined = undefined;
              const piles = { ...state.marketPiles };
              for (const pile of Object.values(piles)) {
                const top = pile.cards[0];
                if (top !== undefined && state.cards[top]?.cardId === cardId) {
                  gainedId = top;
                  piles[pile.pileId] = { ...pile, cards: pile.cards.slice(1) };
                  break;
                }
              }
              return gainCard(
                { ...state, ...nextBase, marketPiles: piles },
                {
                  seat,
                  cardId,
                  instanceId: gainedId,
                  destination: 'topInventory',
                  shuffleIntoInventory: true,
                  reason: 'ability',
                },
              );
            }
            case 'movePlayAreaWeaponToInventoryTop': {
              // Kevin Ryman (Outbreak) L2: move a Pistol from the Play Area to
              // the top of the Inventory.
              const tag = (seatAbilities(state, seat).find(a => a.kind === 'movePlayAreaWeaponToInventoryTop') as { tag: string } | undefined)?.tag ?? 'pistol';
              const candidates = player.playArea.filter(id => {
                const d = cardDef(state, id);
                return d?.type === 'weapon' && (d.weaponTags ?? []).includes(tag as never);
              });
              if (candidates.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Move one Pistol weapon in your Play Area to the top of your Inventory.',
                    options: candidates,
                    payload: { kind: 'kevinPistolToInventoryTop' },
                  },
                ],
              };
            }
            case 'discardWeaponToCopyEffects': {
              // David King (Outbreak) L1: discard a weapon from hand and apply
              // its effect text to another weapon this turn.
              if (player.hand.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Discard a weapon from your hand to copy its effect text.',
                    options: player.hand.filter(id => cardDef(state, id)?.type === 'weapon'),
                    payload: { kind: 'davidDiscardWeapon' },
                  },
                ],
              };
            }
            case 'exchangeBuyForAction': {
              // Ada L2: spend the Buy for an extra Action.
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s =>
                  s.seat === seat
                    ? { ...player, buysLeft: player.buysLeft - 1, actionsLeft: player.actionsLeft + 1 }
                    : s,
                ),
              };
            }
            case 'skipTurnForSuperNextTurn': {
              // PR-002 Jill: Skip / Decline prompt.
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Skip your current Turn and Discard your Hand for a super next Turn?',
                    options: ['Skip my turn', 'Decline'],
                    payload: { kind: 'skipTurn' },
                  },
                ],
              };
            }
            case 'giveOneCardToPlayerThenMaybeAnother': {
              // PR-009 Rebecca L1: choose another player (+1 card), then maybe
              // a second gift.
              const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Choose a player to give +1 card.',
                    options: [...others.map(s => String(s.seat)), 'Decline'],
                    payload: { kind: 'giveOneCardToPlayer' },
                  },
                ],
              };
            }
            case 'revealHandForDamageIfTwoTypes': {
              // PR-010 Hunk L1: reveal hand for possible +10 damage.
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Reveal your hand for +10 damage this turn (needs 2+ card types)?',
                    options: ['Reveal my hand', 'Decline'],
                    payload: { kind: 'revealHandTwoTypes' },
                  },
                ],
              };
            }
            case 'forceAllyExploreWithSupport': {
              // FCH-008 Sherry Birkin: choose another player; they
              // immediately Explore with Sherry's support. Every living
              // opponent is offered — the explore always happens, and the
              // resolution spends whichever weapons the combined Ammo can pay
              // for (an empty arsenal still explores unarmed).
              const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Choose a player: they Explore with Sherry.',
                    options: others.map(s => String(s.seat)),
                    payload: { kind: 'sherryForceExplore' },
                  },
                ],
              };
            }
            case 'forceExploreOtherPlayer': {
              // Wesker L2: choose another player; they get +1 Explore and must
              // Explore on their next turn (choice resolved via prompt).
              const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Choose a player: they get +1 Explore and must Explore on their next turn.',
                    options: others.map(s => String(s.seat)),
                    payload: { kind: 'forceExploreOtherPlayer' },
                  },
                ],
              };
            }
            case 'chosenWeaponTypeAmmoDiscount': {
              // Chris (Alliance) L2: choose a weapon type present in hand/play
              // area; its weapons require 20 less ammo this turn.
              const candidateWeapons = [...player.hand, ...player.playArea]
                .map(id => cardDef(state, id))
                .filter((d): d is CardDef => !!d && d.type === 'weapon' && !!d.weaponType);
              const types = [...new Set(candidateWeapons.map(d => d.weaponType as string))];
              if (types.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Choose a weapon type: its weapons require 20 less ammo this turn.',
                    options: [...types, 'Decline'],
                    payload: { kind: 'chrisAmmoDiscountType' },
                  },
                ],
              };
            }
            case 'discardCardForHealAndDamage': {
              // Steve (Alliance) L2: discard the named card from hand -> recover
              // heal HP (capped) and gain +damage base damage this turn.
              const idx = player.hand.findIndex(id => cardDef(state, id)?.id === ability.cardId);
              if (idx === -1) {
                return { ...state, ...nextBase };
              }
              const discarded = player.hand[idx]!;
              // Steve's recovery is his own: when the Partner owns the
              // ability, the Health goes to the Partner's separate pool.
              const healTarget: Partial<PlayerState> = action.character === 'partner'
                ? { partnerHp: Math.min((player.partnerHp ?? player.hp) + ability.heal, player.partnerMaxHp ?? player.maxHp) }
                : { hp: Math.min(player.hp + ability.heal, player.maxHp) };
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? {
                      ...player,
                      hand: player.hand.filter(id => id !== discarded),
                      discard: [...player.discard, discarded],
                      ...healTarget,
                      weaponDamageBonusThisTurn: player.weaponDamageBonusThisTurn + ability.damage,
                    }
                  : s)),
              };
            }
            case 'gainAmmoX10ForGold': {
              // Billy (Alliance) L1: gain one Ammo x10 (Resource Area -> discard
              // per the rules glossary) and get +amount gold.
              const pileEntry = Object.entries(state.marketPiles).find(([, pile]) => {
                const top = pile.cards[0];
                return top !== undefined && cardDef(state, top)?.id === 'am-001';
              });
              if (pileEntry === undefined) {
                return { ...state, ...nextBase };
              }
              const [pileId, pile] = pileEntry;
              const gainedId = pile.cards[0]!;
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? { ...player, discard: [...player.discard, gainedId], turnGold: player.turnGold + ability.amount }
                  : s)),
                marketPiles: {
                  ...state.marketPiles,
                  [pileId]: { pileId, cards: pile.cards.slice(1) },
                },
              };
            }
            case 'discardToHandIfTenPlus': {
              // Billy (Alliance) L2: move one discard card to hand.
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Move one card from your discard to your hand.',
                    options: [...player.discard],
                    payload: { kind: 'discardToHandIfTenPlus' },
                  },
                ],
              };
            }
            case 'discardCardToInventoryBottom': {
              // Leon (Alliance) L1: choose one discard card and move it to the
              // BOTTOM of the inventory (the draw pile's far end).
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: 'Move one card from your discard to the bottom of your Inventory.',
                    options: [...player.discard],
                    payload: { kind: 'discardCardToInventoryBottom' },
                  },
                ],
              };
            }
            case 'inventoryBottomToTop': {
              // Leon (Alliance) L2: move the bottom card of the inventory to the top.
              const bottom = player.inventory[player.inventory.length - 1];
              if (bottom === undefined) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? { ...player, inventory: [bottom, ...player.inventory.slice(0, -1)] }
                  : s)),
              };
            }
            case 'choosePlayerToDiscardOneCardDuringTurn': {
              // Nightmare Wesker L2: the one other player with 30 or less HP
              // discards one card. The victim chooses which card, so the
              // prompt is addressed to THEIR seat and resolved out of turn
              // by that player's client (same pattern as the reactive trash
              // window).
              const lowHpOthers = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed && (s.hp ?? 0) <= 30);
              const target = lowHpOthers.length === 1 ? lowHpOthers[0] : undefined;
              if (target === undefined || target.hand.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat: target.seat,
                    text: 'Wesker forces you to discard one card.',
                    options: [...target.hand],
                    payload: { kind: 'weskerDiscardOneCard' },
                  },
                ],
              };
            }
            case 'choosePlayerIncreaseAmmoReqNextTurn': {
              // CH-048 Jill Valentine (Mercenaries) L1: choose a player; all of
              // the weapons they use on their next turn require +amount Ammo.
              const amount = ability.kind === 'choosePlayerIncreaseAmmoReqNextTurn' ? ability.amount : 10;
              const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
              if (others.length === 0) {
                return { ...state, ...nextBase };
              }
              return {
                ...state,
                ...nextBase,
                prompts: [
                  ...state.prompts,
                  {
                    id: promptId,
                    seat,
                    text: `Choose a player: all of the weapons they use on their next turn require +${amount} Ammo.`,
                    options: others.map(s => String(s.seat)),
                    payload: { kind: 'jillAmmoIncrease', amount: String(amount) },
                  },
                ],
              };
            }
            default:
              // Passive/text-only abilities (generic, weaponTagBonus, ...): no-op.
              return { ...state, ...nextBase };
          }
        }

    case 'attachToPartner': {
          const { seat, instanceId, replaceIndex } = action;
          const player = state.seats[seat] as PlayerState;
          let attached = [...(player.partnerAttached ?? [])];
          const hand = player.hand.filter(id => id !== instanceId);
          let newDiscard = [...player.discard];
          const attachCap = partnerAttachCap(seatAbilities(state, seat));
          if (attached.length >= attachCap && replaceIndex !== undefined && replaceIndex >= 0 && replaceIndex < attachCap) {
            const removed = attached[replaceIndex];
            if (removed !== undefined) {
              attached = attached.filter((_, i) => i !== replaceIndex);
              newDiscard = [...newDiscard, removed];
            }
          }
          attached = [...attached, instanceId];
          const newPlayer: PlayerState = {
            ...player,
            hand,
            actionsLeft: player.actionsLeft - 1,
            partnerAttached: attached,
            discard: newDiscard,
          };
          return { ...state, ...nextBase, seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)) };
        }

    case 'chooseExploreLeader': {
          const { seat, leader } = action;
          const player = state.seats[seat] as PlayerState;
          const newPlayer: PlayerState = {
            ...player,
            partnerLeading: leader === 'partner',
          };
          return { ...state, ...nextBase, seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)) };
        }

    case 'attack': {
          const { seat, targetSeat, weaponInstanceId } = action;
          const player = state.seats[seat] as PlayerState;
          const target = state.seats[targetSeat] as PlayerState;
          const attackerDef = cardDef(state, player.characterInstanceId);
          const infectedAttacker = player.isInfectedCharacter === true;

          let damage = 0;
          let newHand = player.hand;
          let newPlayArea = player.playArea;
          let newDiscard = player.discard;
          let turnAmmoAfter = player.turnAmmo;
          const trashedWeaponIds: string[] = [];

          if (infectedAttacker) {
            // Infected Characters deal their base Damage (Zombie A/B/C: 0/5/10)
            // plus any Infection cards they use.
            damage = (attackerDef?.baseDamage ?? 0) + baseDamageBonusIfHpAtMost(characterAbilities(state, seat), player.hp);
            const infectionIds = action.infectionCardIds ?? [];
            const bileUsed = infectionIds.filter(id => state.cards[id]?.cardId === 'in-003').length;
            for (const iid of infectionIds) {
              const idef = cardDef(state, iid);
              if (idef === undefined) {
                throw new Error('applyAction: attack: unknown infection card');
              }
              damage += idef.damage ?? 0;
              if (idef.id === 'in-003') damage += 5 * Math.max(bileUsed - 1, 0);
            }
            newHand = player.hand.filter(id => !infectionIds.includes(id));
            newDiscard = [...newDiscard, ...infectionIds];
          } else {
            const wId = weaponInstanceId ?? player.hand.find(id => cardDef(state, id)?.type === 'weapon');
            if (wId === undefined) {
              throw new Error('applyAction: attack: no weapon available');
            }
            const wDef = cardDef(state, wId);
            if (wDef === undefined) {
              throw new Error('applyAction: attack: unknown weapon');
            }
            const req = wDef.ammoReq ?? 0;
            if (player.turnAmmo < req) {
              throw new Error('applyAction: attack: insufficient ammo');
            }
            turnAmmoAfter = player.turnAmmo - req;
            damage = computeDamage({ weapons: [{ damage: wDef.damage ?? 0, ammoReq: req }], ammo: turnAmmoAfter, bonusDamage: 0 })
              + baseDamageBonusIfHpAtMost(characterAbilities(state, seat), player.hp);
            // WE-001 Grenade: "Trashed after use" — it also leaves the game when
            // used to Attack, not just when Exploring.
            const trashWeaponAfterUse = wDef?.weaponEffects?.some(e => e.kind === 'trashAfterUse') === true;
            if (player.hand.includes(wId)) {
              newHand = player.hand.filter(id => id !== wId);
              newDiscard = trashWeaponAfterUse ? newDiscard : [...newDiscard, wId];
            } else if (player.playArea.includes(wId)) {
              newPlayArea = player.playArea.filter(id => id !== wId);
            }
            if (trashWeaponAfterUse) trashedWeaponIds.push(wId);
          }

          const targetDef = cardDef(state, target.characterInstanceId);
          const targetSurvives = target.hp - damage > 0;
          // Outbreak infection-card effects.
          let infectionDeckAfter = state.infectionDeck ?? [];
          let healSelf = 0;
          let targetInfectionCards = [...(target.infectionCards ?? [])];
          const targetFlags: { actionsCapNextTurn?: number; cannotAttackSeatNextTurn?: number } = {};
          for (const iid of action.infectionCardIds ?? []) {
            const idef = cardDef(state, iid);
            for (const e of idef?.actionEffects ?? []) {
              if (e.kind === 'infectionActionsNextTurn') targetFlags.actionsCapNextTurn = e.actions;
              else if (e.kind === 'drag') targetFlags.cannotAttackSeatNextTurn = seat;
              else if (e.kind === 'devour') healSelf += e.heal;
              else if (e.kind === 'infectionIncrease') {
                if (!isImmuneToInfectionEffects(characterAbilities(state, targetSeat), target.infectionCards)) {
                  for (let i = 0; i < e.amount && infectionDeckAfter.length > 0; i++) {
                    targetInfectionCards.push(infectionDeckAfter[0] as string);
                    infectionDeckAfter = infectionDeckAfter.slice(1);
                  }
                }
              }
            }
          }
          // IN-002 Virulent Frenzy: "Look at the top three cards of your
          // inventory. Trash all non-infection cards. Move the rest to the top
          // of your inventory in any order."
          const virulentFrenzyUsed = (action.infectionCardIds ?? []).some(
            id => state.cards[id]?.cardId === 'in-002');
          let frenzyInventory = player.inventory;
          let frenzyTrashed: string[] = [];
          let frenzyInfections: string[] = [];
          let frenzyPrompts: Prompt[] = [];
          if (virulentFrenzyUsed) {
            const top3 = player.inventory.slice(0, 3);
            frenzyTrashed = top3.filter(id => !state.cards[id]?.cardId.startsWith('in-'));
            frenzyInfections = top3.filter(id => state.cards[id]?.cardId.startsWith('in-'));
            frenzyInventory = player.inventory.filter(id => !frenzyTrashed.includes(id) && !frenzyInfections.includes(id));
            if (frenzyInfections.length > 0) {
              frenzyPrompts = [{
                id: `virulentFrenzy-${seat}-v${state.version}`,
                seat,
                text: 'Virulent Frenzy: put the Infection cards on top of your Inventory, in any order.',
                options: [...frenzyInfections],
                payload: { kind: 'virulentFrenzyOrder', remaining: frenzyInfections.join(','), placed: '' },
              }];
            }
          }
          // IN-004 Slough Armor: "When your infected character is attacked, you
          // may discard this card from your hand. If you do, reduce the damage
          // of one weapon being used by 20." The attack reducer is atomic, so
          // the engine auto-takes the beneficial option (documented limitation).
          const sloughArmorId = target.isInfectedCharacter === true
            ? target.hand.find(id => state.cards[id]?.cardId === 'in-004')
            : undefined;
          const sloughArmorEffect = sloughArmorId !== undefined
            ? cardDef(state, sloughArmorId)?.actionEffects?.find(e => e.kind === 'sloughArmor')
            : undefined;
          const sloughReduction = sloughArmorEffect !== undefined && sloughArmorEffect.kind === 'sloughArmor'
            ? sloughArmorEffect.amount
            : 0;
          if (sloughReduction > 0) {
            damage = Math.max(damage - sloughReduction, 0);
          }
          // MA-054o Kevlar Jacket: the target's jacket absorbs this damage.
          const kevlar = applyDamageWithKevlar(state, targetSeat, damage);
          state = kevlar.state;
          const ricTarget = applyRicardoDamage(state, targetSeat, target.hp, kevlar.damage);
          state = ricTarget.state;
          const newTarget: PlayerState = {
            ...target,
            // Keep the post-kevlar `attached`: the jacket left play.
            attached: (state.seats[targetSeat] as PlayerState).attached,
            hp: ricTarget.hp,
            hand: sloughArmorId !== undefined ? target.hand.filter(id => id !== sloughArmorId) : target.hand,
            discard: sloughArmorId !== undefined ? [...target.discard, sloughArmorId] : target.discard,
            infectionCards: targetInfectionCards,
            ...targetFlags,
          };
          let finalPlayer: PlayerState = {
            ...player,
            hand: newHand,
            playArea: newPlayArea,
            discard: newDiscard,
            inventory: frenzyInventory,
            turnAmmo: turnAmmoAfter,
            exploresLeft: player.exploresLeft - 1,
            ...(healSelf > 0 ? { hp: Math.min(player.hp + healSelf, player.maxHp) } : {}),
          };
          // An Infected Character that survives deals its base Damage back.
          if (targetSurvives && target.isInfectedCharacter === true) {
            const ric = applyRicardoDamage(state, seat, finalPlayer.hp, targetDef?.baseDamage ?? 0);
            state = ric.state;
            finalPlayer = { ...finalPlayer, hp: ric.hp };
          }
          // CH-031 Zombie A: when this infected character attacks, all other
          // non-infected characters that are not being attacked take damage.
          const aoeAmount = seatAbilities(state, seat)
            .filter(a => a.kind === 'zombieAAoEOnAttack')
            .reduce((sum, a) => (a.kind === 'zombieAAoEOnAttack' ? sum + a.amount : sum), 0);
          // CH-032 Zombie B reacts to the target's Infection Level rising.
          const infectionIncreased = targetInfectionCards.length > (target.infectionCards ?? []).length;
          const seatsAfter: readonly PlayerState[] = state.seats.map(s => {
            if (s.seat === seat) return finalPlayer;
            if (s.seat === targetSeat) return newTarget;
            // CH-031 Zombie A: other non-infected characters take damage.
            if (aoeAmount > 0 && s.isInfectedCharacter !== true && !s.dead) {
              const ric = applyRicardoDamage(state, s.seat, s.hp, aoeAmount);
              state = ric.state;
              return { ...s, hp: ric.hp };
            }
            return s;
          });
          const removedAfterAttack = [...state.removed, ...trashedWeaponIds, ...frenzyTrashed]
            .filter((id, i, arr) => arr.indexOf(id) === i);
          const postAttackState: GameState = {
            ...state,
            ...nextBase,
            seats: seatsAfter,
            ...(removedAfterAttack.length > state.removed.length ? { removed: removedAfterAttack } : {}),
            ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckAfter } : {}),
          };
          // Built from the POST-attack state so it only offers cards still in hand.
          const zombieBAttackPrompts = infectionIncreased ? zombieBPrompts(postAttackState, targetSeat, state.version) : [];
          const attackPrompts = [...frenzyPrompts, ...zombieBAttackPrompts];
          return {
            ...postAttackState,
            ...(attackPrompts.length > 0
              ? { prompts: [...state.prompts, ...attackPrompts] }
              : {}),
          };
        }

    case 'endTurn': {
          const { seat } = action;
          const player = state.seats[seat] as PlayerState;

          const dh = discardHand({ hand: player.hand, discard: player.discard });
          const dh2 = discardHand({ hand: player.playArea, discard: dh.discard });

          // Mercenaries: weapons that were given "+X damage, Trash at the end of
          // this turn" (Custom Standard Sidearm, Reliable Blade) leave the game.
          const trashNow = player.trashAtEndOfTurn ?? [];
          const trashSet = new Set(trashNow);
          const discardAfterTrash = dh2.discard.filter(id => !trashSet.has(id));
          const removedAfterTrash = trashNow.length > 0
            ? [...state.removed, ...trashNow.filter(id => !state.removed.includes(id))]
            : state.removed;

          // Mansion attachment effects at end of turn (e.g., Rampage trashing
          // inventory cards). Applied to the active player's inventory.
          let currentInventory = player.inventory;
          let currentRemoved = removedAfterTrash;
          let currentTrashCounts = { ...(state.attachmentTrashCounts ?? {}) };
          let currentAttachments = [...(state.mansionAttachments ?? [])];
          const attachmentsToRemove: string[] = [];

          for (const attId of currentAttachments) {
            const attDef = cardDef(state, attId);
            if (attDef?.attachmentEffects === undefined) continue;
            for (const effect of attDef.attachmentEffects) {
              if (effect.kind === 'trashTopInventoryAtTurnEnd') {
                // Trash the top N cards from inventory
                const toTrash = currentInventory.slice(0, effect.count);
                if (toTrash.length > 0) {
                  currentInventory = currentInventory.slice(effect.count);
                  currentRemoved = [...currentRemoved, ...toTrash.filter(id => !currentRemoved.includes(id))];
                  // Update trash counter
                  const currentCount = currentTrashCounts[attId] ?? 0;
                  const newCount = currentCount + toTrash.length;
                  currentTrashCounts[attId] = newCount;
                  // Check if attachment should be removed
                  if (newCount >= effect.removeAfter) {
                    attachmentsToRemove.push(attId);
                  }
                }
              }
            }
          }

          // Remove attachments that have reached their limit
          if (attachmentsToRemove.length > 0) {
            currentAttachments = currentAttachments.filter(id => !attachmentsToRemove.includes(id));
            currentRemoved = [...currentRemoved, ...attachmentsToRemove.filter(id => !currentRemoved.includes(id))];
            // Clean up counters for removed attachments
            for (const attId of attachmentsToRemove) {
              delete currentTrashCounts[attId];
            }
          }

          // Outbreak: if the active Player did not Explore the Mansion or
          // Attack an Infected Character this turn, increase their Infection
          // Level by 1 (draw the top Infection card, place it face up next to
          // the Character). Infected Characters cannot change their level.
          let infectionDeckOut = state.infectionDeck ?? [];
          const infectionCardsOut = [...(player.infectionCards ?? [])];
          // AC-023 Power of the t-Virus: at end of turn, if the player
          // explored or attacked an Infected Character, +1 Infection.
          const playedTVirus = player.playArea.some(id => cardDef(state, id)?.id === 'ac-023');
          if (
            state.infectionDeck !== undefined &&
            player.isInfectedCharacter !== true &&
            // Outbreak: a face-down Character is out of the game, so its
            // Infection Level cannot be raised for any reason.
            !player.downed &&
            !isImmuneToInfectionEffects(characterAbilities(state, seat), player.infectionCards) &&
            ((player.exploredOrAttackedThisTurn === true && playedTVirus) ||
              (player.exploredOrAttackedThisTurn !== true))
          ) {
            const [topInfection, ...restInfections] = infectionDeckOut;
            if (topInfection !== undefined) {
              infectionCardsOut.push(topInfection);
              infectionDeckOut = restInfections;
            }
          }

          // Infected Horde: if player didn't explore this turn, take damage instead.
          const hordeBonus = infectedHordeBonus(state);
          let hordeHp = player.hp;
          if (hordeBonus.damage > 0 && !player.exploredOrAttackedThisTurn && !player.downed && !player.dead) {
            const ric = applyRicardoDamage(state, seat, player.hp, hordeBonus.damage);
            state = ric.state;
            hordeHp = ric.hp;
          }

          // RC-002 Rebecca Chambers L1: if didn't explore this turn, heal at end of turn.
          const rebeccaHealAbility = seatAbilities(state, seat).find(a => a.kind === 'healIfDidNotExplore');
          if (rebeccaHealAbility !== undefined && rebeccaHealAbility.kind === 'healIfDidNotExplore' &&
              !player.exploredOrAttackedThisTurn && !player.downed && !player.dead) {
            hordeHp = Math.min(player.maxHp, hordeHp + rebeccaHealAbility.amount);
          }

          const ctx = advanceTurn({
            seatCount: state.seats.length,
            activeSeat: seat,
            turnNumber: state.turnNumber,
            aliveSeats: state.seats.filter(s => !s.dead).map(s => s.seat),
          });

          // Downed players skip their turn: flipDown already merged
          // hand+discard into the inventory. Do NOT draw the end-of-turn 5 —
          // the revive branch of startTurn redraws and would silently drop
          // them (deck shrinkage bug: -5 cards per death).
          if (player.downed) {
            const downedPlayer: PlayerState = {
              ...player,
              hp: hordeHp,
              hand: [],
              discard: discardAfterTrash,
              playArea: [],
              infectionCards: infectionCardsOut,
            };
            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? downedPlayer : s)),
              removed: currentRemoved,
              activeSeat: ctx.activeSeat,
              turnNumber: ctx.turnNumber,
              ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckOut } : {}),
              mansionAttachments: currentAttachments,
              attachmentTrashCounts: currentTrashCounts,
            };
          }

          // "End of turn: discard Play Area (non-attached) + hand, draw 5
          // (reshuffle discard into inventory if needed)" — rulebook.
          // MA-093 Los Ganados (Handscythe): draw 1 additional card.
          const extraDraws = player.pendingEndOfTurnDraws ?? 0;
          const d = drawWithReshuffle({ deck: currentInventory, discard: discardAfterTrash, count: 5 + extraDraws, rngState: state.rngState });

          const newPlayer: PlayerState = {
            ...player,
            hp: hordeHp,
            hand: d.hand,
            inventory: d.deck,
            discard: d.discard,
            playArea: [],
            infectionCards: infectionCardsOut,
          };

          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            removed: currentRemoved,
            activeSeat: ctx.activeSeat,
            turnNumber: ctx.turnNumber,
            rngState: d.rngState,
            ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckOut } : {}),
            mansionAttachments: currentAttachments,
            attachmentTrashCounts: currentTrashCounts,
          };
        }

    case 'moveXp': {
      const { seat, skillInstanceId, amount } = action;
      return moveXp({ ...state, ...nextBase }, seat, skillInstanceId, amount);
    }

    case 'useSkill': {
      const { seat, skillInstanceId } = action;
      return applyUseSkill({ ...state, ...nextBase }, seat, skillInstanceId);
    }

    case 'useWeaponAbility': {
      // Mercenaries: manual ("can") weapon effects (WE-043 Ibex Standard,
      // WE-046 Custom Lightning Hawk, WE-049 Custom Standard Sidearm).
      const { seat, instanceId } = action;
      const player = state.seats[seat] as PlayerState;
      const def = cardDef(state, instanceId);
      if (def === undefined) return { ...state, ...nextBase };
      const used = new Set(player.usedWeaponEffectsThisTurn ?? []);
      const pid = `weapon-${instanceId}-v${nextBase.version}`;
      for (const e of def.weaponEffects ?? []) {
        if (e.kind === 'payAmmoForDamage') {
          if (used.has(instanceId) || player.turnAmmo < e.ammoCost) return { ...state, ...nextBase };
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? {
              ...s,
              turnAmmo: s.turnAmmo - e.ammoCost,
              weaponDamageBonusById: { ...(s.weaponDamageBonusById ?? {}), [instanceId]: (s.weaponDamageBonusById?.[instanceId] ?? 0) + e.amount },
              usedWeaponEffectsThisTurn: [...(s.usedWeaponEffectsThisTurn ?? []), instanceId],
            } : s)),
          };
        }
        if (e.kind === 'removeXpForDamage') {
          if (used.has(instanceId)) return { ...state, ...nextBase };
          const xp = player.xp ?? 0;
          if (xp < 1) return { ...state, ...nextBase };
          return {
            ...state,
            ...nextBase,
            prompts: [...state.prompts, {
              id: pid,
              seat,
              text: `Remove any amount of XP on your Character (up to ${xp}) for +${e.perXp} Damage per XP on ${def.name}.`,
              options: Array.from({ length: xp }, (_, i) => String(i + 1)),
              payload: { kind: 'we046ChooseAmount', weaponInstanceId: instanceId, perXp: String(e.perXp) },
            }],
          };
        }
        if (e.kind === 'selfPlusDamageTrashAtTurnEnd') {
          if (used.has(instanceId)) return { ...state, ...nextBase };
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? {
              ...s,
              weaponDamageBonusById: { ...(s.weaponDamageBonusById ?? {}), [instanceId]: (s.weaponDamageBonusById?.[instanceId] ?? 0) + e.amount },
              trashAtEndOfTurn: [...(s.trashAtEndOfTurn ?? []), instanceId],
              usedWeaponEffectsThisTurn: [...(s.usedWeaponEffectsThisTurn ?? []), instanceId],
            } : s)),
          };
        }
      }
      return { ...state, ...nextBase };
    }

    case 'chooseOption': {
      const { seat, promptId, option } = action;
      const prompt = state.prompts.find(p => p.id === promptId) as NonNullable<GameState['prompts'][number]>;
      const newPrompts = state.prompts.filter(p => p.id !== promptId);
      const player = state.seats[seat] as PlayerState;
      const kind = prompt.payload?.kind;
      const chosenId = prompt.options[option];
      const instanceId = String(prompt.payload?.instanceId ?? '');

      // Mercenaries Skill draft: advance the draft state machine.
      if (kind === 'skillDraftPick' || kind === 'skillDraftKeep') {
        return advanceDraft({ ...state, ...nextBase, prompts: newPrompts }, seat, chosenId ?? '');
      }

      if (kind === 'weskersSecretMansion' && chosenId !== undefined) {
        const top4 = state.mansionDeck.slice(0, 4);
        const rest = state.mansionDeck.slice(4);
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, mansionDeck: [...rest, ...top4], prompts: newPrompts };
        }
        const remaining = top4.filter(id => id !== chosenId);
        return { ...state, ...nextBase, mansionDeck: [chosenId, ...rest, ...remaining], prompts: newPrompts };
      }
      if (kind === 'lookAtMansionTop3AndReorder') {
        // AC-003 The Ecliptic Express: show top 3, player reorders (simplified: keep order for now)
        // The "must explore" effect is handled via mustExplore flag
        const top3 = state.mansionDeck.slice(0, 3);
        const rest = state.mansionDeck.slice(3);
        // For now, keep the order as-is. Full reordering requires multi-step prompt.
        return {
          ...state,
          ...nextBase,
          mansionDeck: [...top3, ...rest],
          seats: state.seats.map(s => (s.seat === seat ? { ...s, mustExplore: true } : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'rollD6ForDamageEffect') {
        // AC-003 Unknown Odds: roll d6 and apply damage effect
        const roll = nextInt(makeRng(state.rngState), 6).value + 1;
        const newRng = nextInt(makeRng(state.rngState), 6).rng.s;
        let newPlayer = { ...player };
        // 1-2: take 20 damage, 3-4: +20 damage this turn, 5-6: +10 damage and take 10 damage
        if (roll <= 2) {
          newPlayer.hp = Math.max(0, newPlayer.hp - 20);
        } else if (roll <= 4) {
          newPlayer.weaponDamageBonusThisTurn = (newPlayer.weaponDamageBonusThisTurn ?? 0) + 20;
        } else {
          newPlayer.weaponDamageBonusThisTurn = (newPlayer.weaponDamageBonusThisTurn ?? 0) + 10;
          newPlayer.hp = Math.max(0, newPlayer.hp - 10);
        }
        return {
          ...state,
          ...nextBase,
          rngState: newRng,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'martialArtsChoice') {
        // AC-000 Martial Arts: choose +10 damage to Knife/Melee OR attach for double damage
        if (chosenId === '+10 Damage to Knife/Melee') {
          // Option 1: +10 damage to Knife and Melee weapons this turn
          const newPlayer = { ...player, knifeMeleeDamageBonusThisTurn: (player.knifeMeleeDamageBonusThisTurn ?? 0) + 10 };
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            prompts: newPrompts,
          };
        } else if (chosenId === 'Attach for Double Damage') {
          // Option 2: Attach to character
          const newPlayer = {
            ...player,
            attached: [...player.attached, instanceId],
            playArea: player.playArea.filter(id => id !== instanceId),
          };
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            prompts: newPrompts,
          };
        }
      }
      if (kind === 'tacticalAdvanceChooseType') {
        // AC-003 Tactical Advance: choose weapon type for +5 damage (+10 for Melee/Knife)
        const chosenType = chosenId?.toLowerCase();
        if (chosenType !== undefined) {
          const bonus = (chosenType === 'melee' || chosenType === 'knife') ? 10 : 5;
          const newPlayer = {
            ...player,
            tacticalAdvanceType: chosenType,
            tacticalAdvanceBonus: bonus,
          };
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            prompts: newPrompts,
          };
        }
      }
      if (kind === 'mysteriousFindRoll') {
        // AC-003 Mysterious Find: roll d6 for cards/ammo/gold
        const roll = nextInt(makeRng(state.rngState), 6).value + 1;
        const newRng = nextInt(makeRng(state.rngState), 6).rng.s;
        let newPlayer = { ...player };
        // 1-2: +3 Cards, 3-4: +30 Ammo, 5-6: +30 Gold
        if (roll <= 2) {
          const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 3, rngState: newRng });
          newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
        } else if (roll <= 4) {
          newPlayer = { ...newPlayer, turnAmmo: newPlayer.turnAmmo + 30 };
        } else {
          newPlayer = { ...newPlayer, turnGold: newPlayer.turnGold + 30 };
        }
        return {
          ...state,
          ...nextBase,
          rngState: newRng,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'recoverWeaponFromDiscardToHand' && chosenId !== undefined) {
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat
              ? { ...player, hand: [...player.hand, chosenId], discard: player.discard.filter(id => id !== chosenId) }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'moveHandCardToTopOfInventory' && chosenId !== undefined) {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat
              ? { ...player, hand: player.hand.filter(id => id !== chosenId), inventory: [chosenId, ...player.inventory] }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'trashHandCard' && chosenId !== undefined) {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId) } : s,
          ),
          removed: [...state.removed, chosenId],
          prompts: trashRedirectPrompt(state, seat, chosenId, newPrompts, nextBase.version),
        };
      }

      if (kind === 'smartReloadTrashAmmo' && chosenId !== undefined) {
        // SK-016: trash a 0-cost ammo, then choose an ammo (cost <= 30) to gain.
        const next: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId) } : s)),
          removed: [...state.removed, chosenId],
          prompts: newPrompts,
        };
        const ammoTops = Object.values(state.marketPiles)
          .map(p => p.cards[0])
          .filter((id): id is string => id !== undefined)
          .filter(id => {
            const d = cardDef(state, id);
            return d?.type === 'ammunition' && (d.cost ?? 0) <= 30;
          });
        if (ammoTops.length === 0) return next;
        return {
          ...next,
          prompts: [...next.prompts, {
            id: `${prompt.id}:gain`,
            seat,
            text: 'Gain an Ammunition with a cost of 30 or less.',
            options: ammoTops,
            payload: { kind: 'smartReloadGainAmmo' },
          }],
        };
      }
      if (kind === 'smartReloadGainAmmo' && chosenId !== undefined) {
        const pileEntry = Object.entries(state.marketPiles).find(([, p]) => p.cards[0] === chosenId);
        if (pileEntry === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const [pileId, pile] = pileEntry;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, discard: [...s.discard, chosenId] } : s)),
          marketPiles: { ...state.marketPiles, [pileId]: { ...pile, cards: pile.cards.filter(id => id !== chosenId) } },
          prompts: newPrompts,
        };
      }
      if (kind === 'skillMovePlayAreaWeaponToInventoryTop' && chosenId !== undefined) {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, playArea: player.playArea.filter(id => id !== chosenId), inventory: [chosenId, ...player.inventory] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'skillNameWeaponType' && chosenId !== undefined) {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, skillAmmoDiscountTypes: [...(s.skillAmmoDiscountTypes ?? []), chosenId] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'skillDuplicateWeaponEffect' && chosenId !== undefined) {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'duplicateWeaponEffect', weaponInstanceId: chosenId }] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'skillRemoveXpForWeaponDamage' && chosenId !== undefined) {
        const xp = player.xp ?? 0;
        if (xp < 1) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:xp`,
            seat,
            text: `Remove how many XP? (1-${xp})`,
            options: Array.from({ length: xp }, (_, i) => String(i + 1)),
            payload: { kind: 'skillRemoveXpAmount', weaponInstanceId: chosenId, skillInstanceId: String(prompt.payload?.skillInstanceId ?? '') },
          }],
        };
      }
      if (kind === 'skillRemoveXpAmount' && chosenId !== undefined) {
        const weaponInstanceId = String(prompt.payload?.weaponInstanceId ?? '');
        const skillInstanceId = String(prompt.payload?.skillInstanceId ?? '');
        return resolveSkillXpAmount({ ...state, ...nextBase, prompts: newPrompts }, seat, skillInstanceId, weaponInstanceId, Number(chosenId));
      }
      if (kind === 'skillRevealPistolsForExplore' && chosenId !== undefined) {
        // SK-029 Handgun Technique LV.2: reveal N Pistols from hand -> +1 Explore.
        if (chosenId !== 'Reveal') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, exploresLeft: s.exploresLeft + 1 } : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'skillRedirectInfectedEffect' && chosenId !== undefined) {
        // SK-012 Toughness LV.3: arm a reaction redirecting the next Infected
        // effect to the chosen Player.
        const skillInstanceId = String(prompt.payload?.skillInstanceId ?? '');
        const targetSeat = Number(chosenId);
        if (!Number.isInteger(targetSeat) || targetSeat === seat) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'redirectNextInfectedEffect', skillInstanceId, targetSeat }] }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'skipNextTurn' || kind === 'noActionsNextTurn') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        if (Number.isNaN(targetSeat)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === targetSeat
              ? { ...s, skipNextTurn: kind === 'skipNextTurn' ? true : s.skipNextTurn, noActionsNextTurn: kind === 'noActionsNextTurn' ? true : s.noActionsNextTurn }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'uroborosInjection' && chosenId !== undefined) {
        const window = state.reactiveTrashWindow;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId) } : s,
          ),
          removed: [...state.removed, chosenId],
          reactiveTrashWindow: undefined,
          prompts: newPrompts,
        };
      }

      if (kind === 'fightOrFlight' && chosenId !== undefined) {
        // AC-042 Fight or Flight: trash the card; when the revealed Infected has
        // more Health than the Exploring Character, the explore is cancelled
        // (the Infected goes to the bottom of the Mansion, no combat).
        const pe = state.pendingExplore;
        let s: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(x => (x.seat === seat ? { ...x, hand: x.hand.filter(id => id !== chosenId) } : x)),
          removed: [...state.removed, chosenId],
          reactiveTrashWindow: undefined,
          prompts: newPrompts,
        };
        const remaining = newPrompts.some(p => p.payload?.kind === 'fightOrFlight');
        if (!remaining && pe) {
          const revealedDef = cardDef(s, pe.revealedInstanceId);
          if (pe.revealHpThreshold !== undefined && (revealedDef?.hp ?? 0) > pe.revealHpThreshold) {
            const pre = pe.prePlayer ?? s.seats[pe.seat] ?? pe.newPlayer;
            const restored: PlayerState = { ...pre, exploresLeft: Math.max(pre.exploresLeft - 1, 0) };
            // The revealed Infected was not defeated, so its own
            // not-defeated effect still places it (MX-001 inserts it 5th
            // from the top). The pre-reveal deck still holds the card, so
            // drop it before placing.
            const deckWithout = s.mansionDeck.filter(id => id !== pe.revealedInstanceId);
            const insertFx = revealedDef?.infectedEffects?.find(e => e.kind === 'onNotDefeatedInsertIntoMansionAt');
            const placed = insertFx !== undefined && insertFx.kind === 'onNotDefeatedInsertIntoMansionAt'
              ? insertAt({ deck: deckWithout }, pe.revealedInstanceId, insertFx.position)
              : { deck: [...deckWithout, pe.revealedInstanceId] };
            return {
              ...s,
              seats: s.seats.map(x => (x.seat === pe.seat ? restored : x)),
              mansionDeck: placed.deck,
              pendingExplore: undefined,
              prompts: newPrompts,
            };
          }
          const defeated = pe.outcome === 'defeated';
          const currentSeat = s.seats[pe.seat] ?? pe.newPlayer;
          let newPlayer: PlayerState;
          if (defeated) {
            newPlayer = { ...currentSeat, hp: Math.min(currentSeat.hp + healOnDefeatWithWeaponTag(s, pe.seat, characterAbilities(s, pe.seat), pe.weaponIds ?? []), currentSeat.maxHp), decorations: currentSeat.decorations + decorationDelta(s, currentSeat.attached, [...currentSeat.attached, pe.revealedInstanceId]), attached: [...currentSeat.attached, pe.revealedInstanceId] };
          } else {
            const ric = applyRicardoDamage(s, pe.seat, currentSeat.hp, pe.damageTaken);
            s = ric.state;
            // EX-006/EX-008: attach a Poison counter to the exploring Character.
            const counterFx = cardDef(s, pe.revealedInstanceId)?.infectedEffects?.find(e => e.kind === 'onNotDefeatedAttachCounter');
            if (counterFx !== undefined && counterFx.kind === 'onNotDefeatedAttachCounter') {
              s = attachCounterToSeat(s, pe.seat, counterFx.counterCardId);
            }
            newPlayer = { ...(s.seats[pe.seat] ?? currentSeat), hp: ric.hp };
          }
          // Not defeated: the Infected's own effect places it (MX-001
          // inserts it 5th from the top). The pre-reveal deck still holds
          // the card, so drop it before placing.
          const deckWithout = s.mansionDeck.filter(id => id !== pe.revealedInstanceId);
          const insertFx = defeated
            ? undefined
            : cardDef(s, pe.revealedInstanceId)?.infectedEffects?.find(e => e.kind === 'onNotDefeatedInsertIntoMansionAt');
          const bottomed = defeated
            ? { deck: s.mansionDeck }
            : insertFx !== undefined && insertFx.kind === 'onNotDefeatedInsertIntoMansionAt'
              ? insertAt({ deck: deckWithout }, pe.revealedInstanceId, insertFx.position)
              : sendToBottom({ deck: deckWithout }, pe.revealedInstanceId);
          return {
            ...s,
            seats: s.seats.map(x => (x.seat === pe.seat ? newPlayer : x)),
            removed: defeated ? [...s.removed, pe.revealedInstanceId] : s.removed,
            mansionDeck: bottomed.deck,
            pendingExplore: undefined,
            prompts: newPrompts,
          };
        }
        return s;
      }

      if (kind === 'jillFlashGrenade' && chosenId !== undefined) {
        const window = state.reactiveTrashWindow;
        const trashed = true;
        const updatedState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId) } : s,
          ),
          removed: [...state.removed, chosenId],
          reactiveTrashWindow: undefined,
          flashGrenadeDefeatedInstanceId: window?.revealedInstanceId,
          prompts: newPrompts,
        };
        // If no more reactive prompts, resolve the pending explore.
        const remainingReactive = newPrompts.some(p => p.payload?.kind === 'jillFlashGrenade');
        if (!remainingReactive && updatedState.pendingExplore) {
          const pe = updatedState.pendingExplore;
          const defeated = !!updatedState.flashGrenadeDefeatedInstanceId;
          // SK-008 Luck LV.2: a declared reaction negates this Damage.
          const neg = defeated ? { state: updatedState, negated: false } : consumeNegateDamage(updatedState, pe.seat);
          let baseState = neg.state;
          // Apply the combat OUTCOME to the seat's CURRENT state. The saved
          // `newPlayer` snapshot is stale — the exploring player may have kept
          // acting while the reactive prompt was open — and restoring it would
          // silently discard those changes (cards orphaned, pools reverted).
          const currentSeat = baseState.seats[pe.seat] ?? pe.newPlayer;
          let newPlayer: PlayerState;
          if (defeated) {
            newPlayer = { ...currentSeat, hp: Math.min(currentSeat.hp + healOnDefeatWithWeaponTag(baseState, pe.seat, characterAbilities(baseState, pe.seat), pe.weaponIds ?? []), currentSeat.maxHp), decorations: currentSeat.decorations + decorationDelta(baseState, currentSeat.attached, [...currentSeat.attached, pe.revealedInstanceId]), attached: [...currentSeat.attached, pe.revealedInstanceId] };
          } else {
            const ric = applyRicardoDamage(baseState, pe.seat, currentSeat.hp, neg.negated ? 0 : pe.damageTaken);
            baseState = ric.state;
            // EX-006/EX-008: attach a Poison counter to the exploring Character.
            const counterFx = cardDef(baseState, pe.revealedInstanceId)?.infectedEffects?.find(e => e.kind === 'onNotDefeatedAttachCounter');
            if (counterFx !== undefined && counterFx.kind === 'onNotDefeatedAttachCounter') {
              baseState = attachCounterToSeat(baseState, pe.seat, counterFx.counterCardId);
            }
            newPlayer = { ...(baseState.seats[pe.seat] ?? currentSeat), hp: ric.hp };
          }
          // The Infected's own fate likewise applies to the CURRENT deck (it
          // may have changed while the prompt was open).
          const bottomed = defeated
            ? { deck: baseState.mansionDeck }
            : sendToBottom({ deck: baseState.mansionDeck }, pe.revealedInstanceId);
          return {
            ...baseState,
            ...nextBase,
            seats: baseState.seats.map(s => (s.seat === pe.seat ? newPlayer : s)),
            removed: defeated ? [...baseState.removed, pe.revealedInstanceId] : baseState.removed,
            mansionDeck: bottomed.deck,
            pendingExplore: undefined,
            flashGrenadeDefeatedInstanceId: undefined,
            prompts: newPrompts,
          };
        }
        return updatedState;
      }

      if (kind === 'chooseWeaponType') {
        const chosen = prompt.options[option];
        if (chosen === 'Decline' || chosen === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, desperateForcesTypes: [...(player.desperateForcesTypes ?? []), chosen] } : s,
          ),
          prompts: newPrompts,
        };
      }

            if (kind === 'trashUpToTwoFromDiscard') {
              // Options are discard instance ids + a 'DONE' sentinel. Each non-DONE
              // choice trashes that card; up to 2 total, then the prompt chain ends.
              const alreadyTrashed = typeof prompt.payload?.trashed === 'number' ? prompt.payload.trashed : 0;
              if (chosenId === 'DONE' || chosenId === undefined || !player.discard.includes(chosenId)) {
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s => (s.seat === seat ? { ...player, discard: player.discard.filter(id => id !== chosenId) } : s)),
                  removed: chosenId !== 'DONE' && chosenId !== undefined ? [...state.removed, chosenId] : state.removed,
                  prompts: newPrompts,
                };
              }
              const n = alreadyTrashed + 1;
              let prompts = newPrompts;
              if (n < 2) {
                const remaining = player.discard.filter(id => id !== chosenId);
                if (remaining.length > 0) {
                  prompts = [
                    ...prompts,
                    {
                      id: `${prompt.id}:t${n}`,
                      seat,
                      text: prompt.text,
                      options: [...remaining, 'DONE'],
                      payload: { kind: 'trashUpToTwoFromDiscard', trashed: n },
                    },
                  ];
                }
              }
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s =>
                  s.seat === seat ? { ...player, discard: player.discard.filter(id => id !== chosenId) } : s,
                ),
                removed: [...state.removed, chosenId],
                prompts: trashRedirectPrompt(state, seat, chosenId, prompts, nextBase.version),
              };
            }

      if (kind === 'upgradeAmmoBy30Gold' && chosenId !== undefined) {
        const chosenDef = cardDef(state, chosenId);
        const chosenCost = chosenDef?.cost ?? 0;
        const targetCost = chosenCost + 30;
        const ammoDefsMap = new Map();
        for (const c of Object.values(state.cards)) {
          const d = cardDef(state, c.instanceId);
          if (d?.type === 'ammunition') ammoDefsMap.set(d.id, d);
        }
        const uniq = [...ammoDefsMap.values()];
        let target = uniq.filter(d => (d.cost ?? 0) >= targetCost).sort((a,b)=> (a.cost??0)-(b.cost??0))[0];
        if (!target) target = uniq.sort((a,b)=> (b.cost??0)-(a.cost??0))[0];
        let s: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId) } : s,
          ),
          removed: [...state.removed, chosenId],
          prompts: newPrompts,
        };
        return gainCard(s, { seat, cardId: target.id, destination: 'discard', reason: 'ability' });
      }

      if (kind === 'higherPriorities') {
        // AC-028: choose +3 cards or +2 actions.
        if (chosenId === '+3 cards') {
          const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 3, rngState: state.rngState });
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat
              ? { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard }
              : s)),
            prompts: newPrompts,
          };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...player, actionsLeft: player.actionsLeft + 2 } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'powerOfTVirus') {
        // AC-023: optionally trash this card for +20 Gold this turn.
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, turnGold: player.turnGold + 20, playArea: player.playArea.filter(id => id !== prompt.payload?.instanceId) }
            : s)),
          removed: [...state.removed, String(prompt.payload?.instanceId ?? '')],
          prompts: newPrompts,
        };
      }

      if (kind === 'discardAnyForAmmo') {
        // Chris Redfield (Outbreak) L1: discard any number of cards from hand,
        // then gain +amount Ammo for each card discarded.
        const count = Number(prompt.payload?.count ?? '0');
        if (chosenId === undefined || chosenId === 'DONE') {
          const amount = Number(prompt.payload?.amount ?? '0');
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat
              ? { ...player, turnAmmo: player.turnAmmo + amount * count }
              : s)),
            prompts: newPrompts,
          };
        }
        const remaining = player.hand.filter(id => id !== chosenId);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hand: remaining, discard: [...player.discard, chosenId] }
            : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Discard any number of cards from your hand for Ammo.',
            options: [...remaining, 'DONE'],
            payload: { kind: 'discardAnyForAmmo', count: String(count + 1), amount: String(prompt.payload?.amount ?? '0') },
          }],
        };
      }
      if (kind === 'davidDiscardWeapon') {
        if (chosenId === undefined || !player.hand.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const effects = cardDef(state, chosenId)?.weaponEffects ?? [];
        const afterDiscard: PlayerState = {
          ...player,
          hand: player.hand.filter(id => id !== chosenId),
          discard: [...player.discard, chosenId],
        };
        const targets = [...afterDiscard.hand, ...afterDiscard.playArea]
          .filter(id => cardDef(state, id)?.type === 'weapon' && id !== chosenId);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? afterDiscard : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Apply that effect text to which weapon?',
            options: [...targets, 'Decline'],
            payload: { kind: 'davidCopyEffects', effects: JSON.stringify(effects) },
          }],
        };
      }

      if (kind === 'davidCopyEffects') {
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const effects = JSON.parse(String(prompt.payload?.effects ?? '[]')) as WeaponEffect[];
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, copiedWeaponEffects: { instanceId: chosenId, effects } }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'kevinPistolToInventoryTop') {
        if (chosenId === undefined || !player.playArea.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...player,
                playArea: player.playArea.filter(id => id !== chosenId),
                inventory: [chosenId, ...player.inventory],
              }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'rebeccaDiscardForInfection') {
        // Rebecca Chambers (Outbreak) L1: discard any number of cards from
        // hand; her Infection Level drops by 1 per card discarded.
        const count = Number(prompt.payload?.count ?? '0');
        if (chosenId === undefined || chosenId === 'DONE') {
          const lvl = player.infectionCards?.length ?? 0;
          const remove = Math.min(count, lvl);
          const removedInfections = (player.infectionCards ?? []).slice(lvl - remove);
          const remainingInfections = (player.infectionCards ?? []).slice(0, lvl - remove);
          const base: GameState = {
            ...state,
            ...nextBase,
            ...(state.infectionDeck !== undefined
              ? { infectionDeck: [...(state.infectionDeck ?? []), ...removedInfections] }
              : {}),
            seats: state.seats.map(s => (s.seat === seat
              ? { ...s, infectionCards: remainingInfections }
              : s)),
            prompts: newPrompts,
          };
          if (remove > 0) return applyInfectionDecreaseDraws(base, seat);
          return base;
        }
        const remaining = player.hand.filter(id => id !== chosenId);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hand: remaining, discard: [...player.discard, chosenId] }
            : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Discard any number of cards from your hand to decrease Rebecca\'s Infection Level.',
            options: [...remaining, 'DONE'],
            payload: { kind: 'rebeccaDiscardForInfection', count: String(count + 1) },
          }],
        };
      }
      if (kind === 'turnStartDamageForExplore') {
        // HUNK (Outbreak) L1: take the damage and gain +1 Explore.
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const dmg = Number(prompt.payload?.amount ?? '10');
        const promptCountBefore = state.prompts.length;
        const ric = applyRicardoDamage(state, seat, player.hp, dmg);
        state = ric.state;
        const ricPrompts = state.prompts.slice(promptCountBefore);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hp: ric.hp, exploresLeft: player.exploresLeft + 1 }
            : s)),
          prompts: [...newPrompts, ...ricPrompts],
          usedStartOfTurnAbilities: { ...(state.usedStartOfTurnAbilities ?? {}), turnStartDamageForExplore: true },
        };
      }

      if (kind === 'turnStartPlusExploreRequiresTwoExplores') {
        // CH-000 Rachael Foley L1: take +1 Explore, and she then owes two
        // Explores this turn (endTurn is blocked until they are spent, as long
        // as she can still explore legally).
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, exploresLeft: s.exploresLeft + 1, exploresRequiredThisTurn: 2 }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'zombieBInfectionIncrease') {
        // CH-032 Zombie B: trash an infection card from hand; the affected
        // character's Infection Level rises by 1 more.
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(prompt.payload?.targetSeat);
        const deck = state.infectionDeck ?? [];
        const added = deck[0];
        if (!Number.isInteger(targetSeat) || added === undefined || !player.hand.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === seat) {
              return { ...s, hand: s.hand.filter(id => id !== chosenId), discard: [...s.discard, chosenId] };
            }
            if (s.seat === targetSeat) {
              return { ...s, infectionCards: [...(s.infectionCards ?? []), added] };
            }
            return s;
          }),
          infectionDeck: deck.slice(1),
          prompts: newPrompts,
        };
      }

      if (kind === 'zombieCTurnStartInfectionSwap') {
        // CH-033 Zombie C: move one infection card from hand to the bottom of
        // the Infection Deck, then take the top card of the deck into hand.
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const deck = state.infectionDeck ?? [];
        const top = deck[0];
        if (top === undefined || !player.hand.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: [...s.hand.filter(id => id !== chosenId), top] }
            : s)),
          infectionDeck: [...deck.slice(1), chosenId],
          prompts: newPrompts,
        };
      }

      if (kind === 'turnStartRevealActionsForCards') {
        // Ada Wong (Outbreak) L2: reveal any number of action cards from hand,
        // then draw 1 card per action card revealed.
        const count = Number(prompt.payload?.count ?? '0');
        if (chosenId === undefined || chosenId === 'DONE') {
          if (count === 0) {
            return { ...state, ...nextBase, prompts: newPrompts };
          }
          const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count, rngState: state.rngState });
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat
              ? { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard }
              : s)),
            prompts: newPrompts,
          };
        }
        const isAction = cardDef(state, chosenId)?.type === 'action';
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Reveal any number of action cards from your hand.',
            options: [...player.hand.filter(id => cardDef(state, id)?.type === 'action'), 'DONE'],
            payload: { kind: 'turnStartRevealActionsForCards', count: String(count + (isAction ? 1 : 0)) },
          }],
        };
      }

      if (kind === 'leonHandToInventoryTop') {
        if (chosenId === undefined || !player.hand.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...player,
                hand: player.hand.filter(id => id !== chosenId),
                inventory: [chosenId, ...player.inventory],
              }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'leonDiscardForAction') {
        if (chosenId === undefined || !player.hand.includes(chosenId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const afterDiscard: PlayerState = {
          ...player,
          hand: player.hand.filter(id => id !== chosenId),
          discard: [...player.discard, chosenId],
        };
        const actionsInDiscard = afterDiscard.discard.filter(id => cardDef(state, id)?.type === 'action');
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? afterDiscard : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Move one action card from your discard pile to your hand.',
            options: [...actionsInDiscard, 'Decline'],
            payload: { kind: 'leonActionFromDiscard' },
          }],
        };
      }

      if (kind === 'leonActionFromDiscard') {
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...player,
                discard: player.discard.filter(id => id !== chosenId),
                hand: [...player.hand, chosenId],
              }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'injectionDiscard') {
        // AC-026 Injection: discard any number, then draw the same amount,
        // then optionally trash this card for -1 Infection Level.
        const count = Number(prompt.payload?.count ?? '0');
        if (chosenId === undefined || chosenId === 'DONE') {
          const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count, rngState: state.rngState });
          const drawnPlayer: PlayerState = {
            ...player,
            hand: [...player.hand, ...d.hand],
            inventory: d.deck,
            discard: d.discard,
          };
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat ? drawnPlayer : s)),
            prompts: [...newPrompts, {
              id: 'p' + (newPrompts.length + 1),
              seat,
              text: 'You may trash Injection to decrease your Infection Level by 1.',
              options: ['Trash for -1 Infection', 'Decline'],
              payload: { kind: 'injectionTrash', instanceId },
            }],
          };
        }
        const remaining = player.hand.filter(id => id !== chosenId);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hand: remaining, discard: [...player.discard, chosenId] }
            : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Discard any number of cards from your hand, then draw the same amount.',
            options: [...remaining, 'DONE'],
            payload: { kind: 'injectionDiscard', instanceId, count: String(count + 1) },
          }],
        };
      }

      if (kind === 'injectionTrash') {
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const lvl = player.infectionCards?.length ?? 0;
        // Trashing Injection lowers the Infection Level by 1: the top infection
        // card leaves the face-up pile and goes back to the Infection Deck
        // (rulebook: "Level decreases, move 1 of the ... Infection Deck").
        const removedInfection = lvl > 0 ? (player.infectionCards ?? [])[lvl - 1] : undefined;
        const after: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...player,
                playArea: player.playArea.filter(id => id !== instanceId),
                infectionCards: lvl > 0 ? (player.infectionCards ?? []).slice(0, -1) : [],
              }
            : s)),
          ...(state.infectionDeck !== undefined && removedInfection !== undefined
            ? { infectionDeck: [...(state.infectionDeck ?? []), removedInfection] }
            : {}),
          removed: [...state.removed, instanceId],
          prompts: newPrompts,
        };
        // Rebecca Chambers (Outbreak) L2: another character's Infection Level
        // decreasing gives her +1 card.
        return lvl > 0 ? applyInfectionDecreaseDraws(after, seat) : after;
      }

      if (kind === 'partingWays') {
        // AC-029: optionally trash a card from hand, then gain a Resource card
        // costing up to 20 more than the trashed card.
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const trashedCost = cardDef(state, chosenId)?.cost ?? 0;
        const maxCost = trashedCost + 20;
        const affordable = Object.values(state.marketPiles)
          .map(pile => pile.cards[0])
          .filter((id): id is string => id !== undefined)
          .filter(id => (cardDef(state, id)?.cost ?? 0) <= maxCost);
        const afterTrash: PlayerState = {
          ...player,
          hand: player.hand.filter(id => id !== chosenId),
          discard: [...player.discard, chosenId],
        };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? afterTrash : s)),
          prompts: [...newPrompts, {
            id: 'p' + (newPrompts.length + 1),
            seat,
            text: 'Gain a Resource card costing up to ' + maxCost + ' Gold.',
            options: [...affordable, 'Decline'],
            payload: { kind: 'partingWaysGain' },
          }],
        };
      }

      if (kind === 'partingWaysGain') {
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const s = gainCard(
          { ...state, ...nextBase },
          { seat, cardId: cardDef(state, chosenId)?.id ?? '', destination: 'discard', reason: 'ability' },
        );
        return { ...s, prompts: newPrompts };
      }

      if (kind === 'gatheringDarkness') {
        // AC-031: choose another player; they trash their highest-cost
        // Ammunition and move one Ammo x10 into their hand per 10 ammo it
        // provided. This card is trashed.
        if (chosenId === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(chosenId);
        const target = state.seats[targetSeat] as PlayerState;
        const targetAmmo = target.hand.filter(id => cardDef(state, id)?.type === 'ammunition');
        targetAmmo.sort((a, b) => (cardDef(state, b)?.cost ?? 0) - (cardDef(state, a)?.cost ?? 0));
        const trashedAmmo = targetAmmo[0];
        const provided = trashedAmmo !== undefined ? (cardDef(state, trashedAmmo)?.bonuses?.ammo ?? 0) : 0;
        let s: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(x => (x.seat === targetSeat
            ? {
                ...target,
                hand: trashedAmmo !== undefined ? target.hand.filter(id => id !== trashedAmmo) : target.hand,
                discard: trashedAmmo !== undefined ? [...target.discard, trashedAmmo] : target.discard,
              }
            : x)),
        };
        const times = Math.floor(provided / 10);
        for (let i = 0; i < times; i++) {
          s = gainCard(s, { seat: targetSeat, cardId: 'am-001', destination: 'hand' });
        }
        return {
          ...s,
          removed: [...s.removed, instanceId],
          seats: s.seats.map(x => (x.seat === seat ? { ...x, playArea: x.playArea.filter(id => id !== instanceId) } : x)),
          prompts: newPrompts,
        };
      }
      if (kind === 'iHaveThis') {
        // AC-024: reveal a weapon costing 50 or more from hand -> +1 card.
        if (chosenId === undefined || chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 1, rngState: state.rngState });
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'stealRevealedWeaponsFromOpponentsTopCards') {
              // Master of Unlocking chain: options are revealed weapon instance
              // ids + 'DONE'. Taking one moves it from the owner's inventory to
              // this player's discard; the chain re-prompts with the rest.
              if (chosenId === 'DONE' || chosenId === undefined) {
                return {
                  ...state,
                  ...nextBase,
                  prompts: newPrompts,
                };
              }
              // Find the opponent whose inventory top is the chosen weapon.
              const owner = state.seats.find(s => s.seat !== seat && !s.dead && !s.downed && s.inventory[0] === chosenId);
              if (owner === undefined) {
                // Weapon vanished (defensive) — drop the chain.
                return {
                  ...state,
                  ...nextBase,
                  prompts: newPrompts,
                };
              }
              const remaining = prompt.options.filter(id => id !== chosenId && id !== 'DONE');
              let prompts = newPrompts;
              if (remaining.length > 0) {
                prompts = [
                  ...prompts,
                  {
                    id: `${prompt.id}:t${state.prompts.length}`,
                    seat,
                    text: prompt.text,
                    options: [...remaining, 'DONE'],
                    payload: { kind: 'stealRevealedWeaponsFromOpponentsTopCards' },
                  },
                ];
              }
              const takenBySeat = (s: { seat: number }): boolean => s.seat === seat;
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => {
                  if (s.seat === owner.seat) {
                    return { ...s, inventory: s.inventory.slice(1) };
                  }
                  if (takenBySeat(s)) {
                    return { ...player, discard: [...s.discard, chosenId] };
                  }
                  return s;
                }),
                prompts,
              };
            }

      if (kind === 'zombieGrab') {
        // Zombie Grab: trash a weapon from hand or discard pile, or take
        // 20 damage. Either way the card is shuffled back into the Mansion.
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '20');
        const grabInstanceId = String(prompt.payload?.instanceId ?? '');
        if (chosen === undefined || grabInstanceId === '') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        let next: GameState;
        if (chosen === 'Take 20 damage') {
          const target = state.seats[seat];
          const hp = applyHpLoss(characterAbilities(state, seat), target?.hp ?? 0, amount, (target?.downed ?? false) || (target?.dead ?? false));
          next = { ...state, seats: state.seats.map(s => (s.seat === seat ? { ...s, hp } : s)) };
        } else {
          next = {
            ...state,
            seats: state.seats.map(s => (s.seat === seat
              ? { ...s, hand: s.hand.filter(id => id !== chosen), discard: s.discard.filter(id => id !== chosen) }
              : s)),
            removed: [...state.removed, chosen],
          };
        }
        const rngBox = { current: next.rngState };
        const rngShuffle = (items: readonly string[]): string[] => {
          const r = shuffle(makeRng(rngBox.current), items);
          rngBox.current = r.rng.s;
          return r.value;
        };
        const shuffled = shuffleBack({ deck: next.mansionDeck }, grabInstanceId, rngShuffle);
        return {
          ...next,
          ...nextBase,
          rngState: rngBox.current,
          mansionDeck: shuffled.deck,
          prompts: newPrompts,
        };
      }

      if (kind === 'eclipticTrash') {
        // Ecliptic Express: trash a card from discard pile, or decline.
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, discard: s.discard.filter(id => id !== chosen) }
            : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'survivalHorrorRoll') {
        // Survival Horror: apply the die roll effect.
        const roll = Number(prompt.payload?.roll ?? '1');
        const shSeat = Number(prompt.payload?.seat ?? String(seat));
        const shPlayer = state.seats[shSeat];
        if (shPlayer === undefined) return { ...state, ...nextBase, prompts: newPrompts };

        let newState: GameState = state;
        let newPlayer = { ...shPlayer };

        switch (roll) {
          case 1: // Weapons deal -5 damage this turn
            newPlayer.weaponDamageBonusThisTurn = (newPlayer.weaponDamageBonusThisTurn ?? 0) - 5;
            break;
          case 2: // Take 10 damage
            newPlayer.hp = Math.max(0, newPlayer.hp - 10);
            break;
          case 3: // Trash the top card of inventory
            if (newPlayer.inventory.length > 0) {
              const [topCard, ...rest] = newPlayer.inventory;
              newPlayer.inventory = rest;
              if (topCard !== undefined) {
                newState = { ...newState, removed: [...newState.removed, topCard] };
              }
            }
            break;
          case 4: // +2 cards
            if (newPlayer.inventory.length >= 2) {
              const drawn = newPlayer.inventory.slice(0, 2);
              newPlayer.inventory = newPlayer.inventory.slice(2);
              newPlayer.hand = [...newPlayer.hand, ...drawn];
            } else {
              const drawn = [...newPlayer.inventory];
              newPlayer.inventory = [];
              newPlayer.hand = [...newPlayer.hand, ...drawn];
            }
            break;
          case 5: // Heal +10 health
            newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + 10);
            break;
          case 6: // Weapons deal +5 damage this turn
            newPlayer.weaponDamageBonusThisTurn = (newPlayer.weaponDamageBonusThisTurn ?? 0) + 5;
            break;
        }

        return {
          ...newState,
          ...nextBase,
          seats: newState.seats.map(s => (s.seat === shSeat ? newPlayer : s)),
          prompts: newPrompts,
          survivalHorrorRolledThisTurn: true,
        };
      }

      if (kind === 'weaponCaseChooseWeapon') {
        // EX-003 Weapon Case: the chosen weapon moves from its Resource Area
        // pile into the taker's discard. The token itself was already removed
        // from the game when the choice was offered.
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const def = cardDef(state, chosen);
        if (def === undefined || def.type !== 'weapon') return { ...state, ...nextBase, prompts: newPrompts };
        let removedFromPile = false;
        const marketPiles = { ...state.marketPiles };
        for (const pile of Object.values(marketPiles)) {
          if (pile.cards.includes(chosen)) {
            marketPiles[pile.pileId] = { ...pile, cards: pile.cards.filter(id => id !== chosen) };
            removedFromPile = true;
            break;
          }
        }
        if (!removedFromPile) return { ...state, ...nextBase, prompts: newPrompts };
        const stripped: GameState = { ...state, ...nextBase, marketPiles, prompts: newPrompts };
        return gainCard(stripped, {
          seat,
          cardId: def.id,
          instanceId: chosen,
          destination: 'discard',
          reason: 'token',
        });
      }

      if (kind === 'antiqueCoinChooseWeapon') {
        // Antique Coin (IT-000): the chosen weapon moves from its Resource
        // Area pile into the player's discard. The coin itself was already
        // trashed when the choice was offered.
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const weaponDef = cardDef(state, chosen);
        if (weaponDef === undefined || weaponDef.type !== 'weapon') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        let removedFromPile = false;
        const marketPiles = { ...state.marketPiles };
        for (const pile of Object.values(marketPiles)) {
          if (pile.cards.includes(chosen)) {
            marketPiles[pile.pileId] = { ...pile, cards: pile.cards.filter(id => id !== chosen) };
            removedFromPile = true;
            break;
          }
        }
        if (!removedFromPile) return { ...state, ...nextBase, prompts: newPrompts };
        const stripped: GameState = { ...state, ...nextBase, marketPiles, prompts: newPrompts };
        return gainCard(stripped, {
          seat,
          cardId: weaponDef.id,
          instanceId: chosen,
          destination: 'discard',
          reason: 'other',
        });
      }

      if (kind === 'sherryForceExplore') {
        // FCH-008 Sherry Birkin: the chosen player immediately Explores
        // with Sherry's support (see engine/allyExplore.ts).
        const targetSeat = Number(prompt.options[option]);
        if (Number.isNaN(targetSeat)) return { ...state, ...nextBase, prompts: newPrompts };
        const resolved = resolveAllyExplore(state, seat, targetSeat);
        // CH-000 Rachael Foley L1: a forced ally Explore is still an Explore,
        // so it pays down the target's Explore debt too.
        const afterDebt = payExploreDebt(resolved, targetSeat, 1);
        // Record the forced explore in the log. It is not a player-submitted
        // explore action, so without this entry the client's reveal overlay
        // never fires for it and the turn history omits what the target did.
        // `forcedBy` lets the overlay show for Sherry too (she is the one who
        // forced it, and in pass-and-play she is the device holder).
        const forcedExplore: Action = {
          type: 'explore',
          seat: targetSeat,
          weapons: allyExploreUsedWeaponIds(state, seat, targetSeat),
          exploreCount: 1,
          forcedBy: seat,
        };
        return {
          ...afterDebt,
          ...nextBase,
          log: [...nextBase.log, { seq: nextBase.log.length + 1, action: forcedExplore }],
          prompts: [...newPrompts, ...afterDebt.prompts.filter(p => p.id !== prompt.id)],
        };
      }

      if (kind === 'forceExploreOtherPlayer') {
        // Wesker L2: the chosen player must Explore on their next turn
        // (startTurn grants +1 Explore; validate blocks their endTurn until
        // they do; exploring clears the obligation).
        const targetSeat = Number(prompt.options[option]);
        if (Number.isNaN(targetSeat)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === targetSeat ? { ...s, mustExplore: true } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'virulentFrenzyOrder') {
        // IN-002 Virulent Frenzy: the player orders the looked-at Infection
        // cards on top of their Inventory (selection order = top to bottom).
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === '') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const remaining = String(prompt.payload?.remaining ?? '').split(',').filter(Boolean).filter(id => id !== chosen);
        const placed = String(prompt.payload?.placed ?? '').split(',').filter(Boolean);
        const newPlaced = [...placed, chosen];
        const inv = [...newPlaced, ...player.inventory.filter(id => !newPlaced.includes(id))];
        const base: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, inventory: inv } : s)),
        };
        if (remaining.length === 0) return { ...base, prompts: newPrompts };
        return {
          ...base,
          prompts: [...newPrompts, {
            id: `${prompt.id}:${remaining.length}`,
            seat,
            text: prompt.text,
            options: [...remaining],
            payload: { kind: 'virulentFrenzyOrder', remaining: remaining.join(','), placed: newPlaced.join(',') },
          }],
        };
      }

      if (kind === 'stunRodChooseInfected') {
        // WE-028 Stun Rod: move one of the battled Infected to the top of the
        // Mansion.
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        if (state.cards[chosen] === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => ({ ...s, attached: s.attached.filter(id => id !== chosen) })),
          mansionDeck: [chosen, ...state.mansionDeck.filter(id => id !== chosen)],
          removed: state.removed.filter(id => id !== chosen),
          prompts: newPrompts,
        };
      }

      if (kind === 'cephaloChoosePlayer') {
        // MA-030 Cephalo (Las Plagas): the chosen player must Explore on their
        // next turn (same obligation mechanism as Wesker L2).
        const targetSeat = Number(prompt.options[option]);
        if (Number.isNaN(targetSeat)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === targetSeat ? { ...s, mustExplore: true } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'chrisAmmoDiscountType') {
        // Chris (Alliance) L2: record the chosen weapon type for this turn.
        const chosen = prompt.options[option];
        if (chosen === 'Decline' || chosen === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, chrisAmmoDiscountTypes: [...(player.chrisAmmoDiscountTypes ?? []), chosen] } : s,
          ),
          prompts: newPrompts,
        };
      }
      if (kind === 'perfectExploreReward') {
        // Carlos (Alliance) L2: the chosen discard card moves to the hand.
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.discard.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, discard: player.discard.filter(id => id !== chosen), hand: [...player.hand, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'discardToHandIfTenPlus') {
        // Billy (Alliance) L2: the chosen discard card moves to the hand.
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.discard.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, discard: player.discard.filter(id => id !== chosen), hand: [...player.hand, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'discardCardToInventoryBottom') {
        // Leon (Alliance) L1: the chosen discard card goes to the bottom of the
        // inventory (appended - the draw pile draws from index 0).
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.discard.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, discard: player.discard.filter(id => id !== chosen), inventory: [...player.inventory, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'weskerDiscardOneCard') {
        // Nightmare Wesker L2: the victim (the prompt's seat) discards the
        // chosen card from their own hand.
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hand: player.hand.filter(id => id !== chosen), discard: [...player.discard, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }
      if (kind === 'trashRedirect') {
        // Rebecca L1: option 0 leaves the card in the trash; any other option
        // is a seat number whose discard pile receives it (removed from trash).
        const trashedId = prompt.payload?.instanceId as string | undefined;
        if (trashedId === undefined || option === 0) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(prompt.options[option]);
        if (Number.isNaN(targetSeat) || !state.removed.includes(trashedId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === targetSeat ? { ...s, discard: [...s.discard, trashedId] } : s,
          ),
          removed: state.removed.filter(id => id !== trashedId),
          prompts: newPrompts,
        };
      }

      if (kind === 'skipTurn') {
        // PR-002 Jill: option 0 = skip. Hand goes to discard, the turn ends
        // immediately (advanceTurn), and skipRewardPending arms the super
        // next turn. Option 1 = decline.
        if (option !== 0) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const dh = discardHand({ hand: player.hand, discard: player.discard });
        const ctx = advanceTurn({
          seatCount: state.seats.length,
          activeSeat: seat,
          turnNumber: state.turnNumber,
          aliveSeats: state.seats.filter(s => !s.dead).map(s => s.seat),
        });
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat
              ? { ...player, hand: [], discard: dh.discard, skipRewardPending: true }
              : s,
          ),
          activeSeat: ctx.activeSeat,
          turnNumber: ctx.turnNumber,
          prompts: newPrompts,
        };
      }

      if (kind === 'giveOneCardToPlayer') {
        // PR-009 Rebecca L1: give the chosen player +1 card from their
        // inventory (reshuffling discard if needed); then offer a second
        // gift ("If you do, you can have a Player get +1 card").
        const targetOpt = prompt.options[option];
        if (targetOpt === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(targetOpt);
        if (Number.isNaN(targetSeat)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const target = state.seats[targetSeat];
        if (target === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const d = drawWithReshuffle({
          deck: target.inventory,
          discard: target.discard,
          count: 1,
          rngState: state.rngState,
        });
        const gifted: GameState = {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s =>
            s.seat === targetSeat
              ? { ...target, hand: [...target.hand, ...d.hand], inventory: d.deck, discard: d.discard }
              : s,
          ),
          prompts: newPrompts,
        };
        // Second gift: same choices, chain prompt.
        const others = gifted.seats.filter(s => s.seat !== seat && !s.dead && !s.downed);
        return {
          ...gifted,
          prompts: [
            ...gifted.prompts,
            {
              id: `gift2-${seat}-v${nextBase.version}`,
              seat,
              text: 'You gave a card. Give another player +1 card?',
              options: [...others.map(s => String(s.seat)), 'Decline'],
              payload: { kind: 'giveOneCardNoChain' },
            },
          ],
        };
      }

      if (kind === 'rebeccaDrawDiscard') {
        // RC-001 Rebecca Chambers L1: draw +1 card, then discard a card.
        if (option !== 0) {
          // Decline
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const d = drawWithReshuffle({
          deck: player.inventory,
          discard: player.discard,
          count: 1,
          rngState: state.rngState,
        });
        const drewState: GameState = {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s =>
            s.seat === seat
              ? { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard }
              : s,
          ),
          prompts: newPrompts,
          usedStartOfTurnAbilities: { ...(state.usedStartOfTurnAbilities ?? {}), turnStartDrawThenDiscardCard: true },
        };
        // Now prompt to discard a card from hand.
        const drewPlayer = drewState.seats[seat];
        if (drewPlayer === undefined || drewPlayer.hand.length === 0) {
          return drewState;
        }
        return {
          ...drewState,
          prompts: [
            ...drewState.prompts,
            {
              id: `rebecca-discard-${seat}-v${nextBase.version}`,
              seat,
              text: 'Rebecca Chambers: discard a card.',
              options: [...drewPlayer.hand],
              payload: { kind: 'rebeccaDiscard' },
            },
          ],
        };
      }

      if (kind === 'rebeccaDiscard') {
        // RC-001 Rebecca Chambers L1: discard the chosen card.
        // L2: if discarding due to card effect during turn, gain +20 gold.
        const chosenId = prompt.options[option];
        if (chosenId === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const p = state.seats[seat];
        if (p === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const goldBonus = rebeccaDiscardGoldBonus(state, seat);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...p, hand: p.hand.filter(id => id !== chosenId), discard: [...p.discard, chosenId], turnGold: p.turnGold + goldBonus } : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'carlosSearchAmmo') {
        // FCH-001 Carlos Oliveira L2: search discard for an Ammo card to hand.
        const chosenId = prompt.options[option];
        if (chosenId === 'Decline' || chosenId === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const p = state.seats[seat];
        if (p === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...p, hand: [...p.hand, chosenId], discard: p.discard.filter(id => id !== chosenId) } : s,
          ),
          prompts: newPrompts,
          usedStartOfTurnAbilities: { ...(state.usedStartOfTurnAbilities ?? {}), searchDiscardForAmmoAtTurnStart: true },
        };
      }

      if (kind === 'giveOneCardNoChain') {
        const targetOpt = prompt.options[option];
        if (targetOpt === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(targetOpt);
        if (Number.isNaN(targetSeat)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const target = state.seats[targetSeat];
        if (target === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const d = drawWithReshuffle({
          deck: target.inventory,
          discard: target.discard,
          count: 1,
          rngState: state.rngState,
        });
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s =>
            s.seat === targetSeat
              ? { ...target, hand: [...target.hand, ...d.hand], inventory: d.deck, discard: d.discard }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'revealHandTwoTypes') {
        // PR-010 Hunk L1: option 0 reveals; 2+ different card types in hand
        // grants +10 damage this turn.
        if (option !== 0) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const types = new Set(
          player.hand.map(id => cardDef(state, id)?.type ?? 'unknown')
        );
        const bonus = types.size >= 2 ? 10 : 0;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat
              ? { ...player, weaponDamageBonusThisTurn: player.weaponDamageBonusThisTurn + bonus }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'healGreenHerb') {
              // SK-004 Medic LV.1: +10 to any heal; SK-005 Medic LV.2: may trash
              // 1 discard card when healing.
              const healEffects = activeSkillEffects(state, seat);
              const healBonus = skillHealAmountBonus(healEffects);
              const withHealPrompts = (base: readonly Prompt[]): readonly Prompt[] => {
                if (!skillHealTrashFromDiscard(healEffects) || player.discard.length === 0) return base;
                return [...base, {
                  id: `skill-heal-trash-${seat}-v${nextBase.version}`,
                  seat,
                  text: 'Medic LV.2: Trash 1 card from your Discard Pile.',
                  options: [...player.discard, 'Decline'],
                  payload: { kind: 'skillHealTrashFromDiscard' },
                }];
              };
              // CH-037 Josh Stone L1: +gold the first time he is healed this turn.
              const joshGold = ((): number => {
                if (player.healedFirstTimeThisTurn) return 0;
                const ab = seatAbilities(state, seat).find(a => a.kind === 'goldOnFirstHealThisTurn') as
                  | { amount: number }
                  | undefined;
                return ab?.amount ?? 0;
              })();
              // Alliance Partner Modification: the Green Herb heals exactly ONE
              // character. The prompt options are ordered target-major, then
              // amount, so the index decodes back into (target, amount).
              const targets: readonly ('main' | 'partner')[] =
                player.partnerInstanceId !== undefined ? ['main', 'partner'] : ['main'];
              const amounts: readonly number[] =
                player.hand.some(id => isGreenHerb(state, id)) ? [20, 60] : [20];
              const healSeat = targets[Math.floor(option / amounts.length)] ?? 'main';
              const healAmount = amounts[option % amounts.length] ?? 20;
              const healSeats = (extra?: Partial<PlayerState>): readonly PlayerState[] =>
                state.seats.map(s => {
                  if (s.seat !== seat) return s;
                  return {
                    ...s,
                    ...extra,
                    hp: healSeat === 'main'
                      ? Math.min(s.hp + healAmount + healBonus, s.maxHp)
                      : s.hp,
                    ...(healSeat === 'partner' && s.partnerInstanceId !== undefined
                      ? {
                          partnerHp: Math.min(
                            (s.partnerHp ?? s.hp) + healAmount + healBonus,
                            s.partnerMaxHp ?? s.maxHp,
                          ),
                        }
                      : {}),
                  };
                });
              if (healAmount === 20) {
                return {
                  ...state,
                  ...nextBase,
                  seats: healSeats({
                    turnGold: player.turnGold + joshGold,
                    healedFirstTimeThisTurn: true,
                  }),
                  prompts: withHealPrompts(newPrompts),
                };
              }
              // Heal 60 requires a second Green Herb in hand; both the played
              // herb (already in removed) and the hand herb are trashed.
              const otherHerb = player.hand.find(id => isGreenHerb(state, id));
              if (otherHerb === undefined) {
                return {
                  ...state,
                  ...nextBase,
                  seats: healSeats(),
                  prompts: withHealPrompts(newPrompts),
                };
              }
              return {
                ...state,
                ...nextBase,
                seats: healSeats({ hand: player.hand.filter(id => id !== otherHerb) }),
                removed: [...state.removed, otherHerb],
                prompts: withHealPrompts(newPrompts),
              };
            }

      if (kind === 'healTarget') {
        // First Aid Spray: heal exactly ONE character to full. The options are
        // ['Heal Main', 'Heal Partner'].
        const healSeat: 'main' | 'partner' = option === 1 ? 'partner' : 'main';
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat !== seat) return s;
            return {
              ...s,
              hp: healSeat === 'main' ? s.maxHp : s.hp,
              ...(healSeat === 'partner' && s.partnerInstanceId !== undefined
                ? { partnerHp: s.partnerMaxHp ?? s.maxHp }
                : {}),
            };
          }),
          prompts: newPrompts,
        };
      }

      if (kind === 'skillHealTrashFromDiscard' && chosenId !== undefined && chosenId !== 'Decline') {
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...player, discard: player.discard.filter(id => id !== chosenId) } : s)),
          removed: [...state.removed, chosenId],
          prompts: newPrompts,
        };
      }

      if (kind === 'takeOrBottom') {
              const instanceId = prompt.payload?.instanceId as string | undefined;
              if (option === 0 && instanceId !== undefined) {
                // Token cards (Rocket Launcher Case, Gatling Gun Case): gain the
                // weapon, trash the token. The weapon instance is created on the
                // fly (token-only weapons are not registered at setup).
                const takenDef = cardDef(state, instanceId);
                const grantEffect = (takenDef?.tokenEffects ?? []).find(
                  e => e.kind === 'gainWeaponAndTrashToken'
                );
                if (grantEffect !== undefined && grantEffect.kind === 'gainWeaponAndTrashToken') {
                  const granted: GameState = {
                    ...state,
                    ...nextBase,
                    removed: [...state.removed, instanceId],
                    prompts: newPrompts,
                  };
                  return gainCard(granted, {
                    seat,
                    cardId: grantEffect.weaponCardId,
                    destination: 'discard',
                    reason: 'token',
                  });
                }
                // Unofficial Expansion: EX-001 Special Rocket Launcher Case /
                // EX-004 Ammunition Box — gain the named card, REMOVE the token
                // from the game (the printed text says remove, not trash).
                const grantCardEffect = (takenDef?.tokenEffects ?? []).find(
                  e => e.kind === 'gainCardAndRemoveToken'
                );
                if (grantCardEffect !== undefined && grantCardEffect.kind === 'gainCardAndRemoveToken') {
                  const granted: GameState = {
                    ...state,
                    ...nextBase,
                    removed: [...state.removed, instanceId],
                    prompts: newPrompts,
                  };
                  return gainCard(granted, {
                    seat,
                    cardId: grantCardEffect.cardId,
                    destination: 'discard',
                    reason: 'token',
                  });
                }
                // Unofficial Expansion: EX-003 Weapon Case — choose any weapon
                // from the Resource Area, gain it, remove the token.
                const anyWeaponEffect = (takenDef?.tokenEffects ?? []).find(
                  e => e.kind === 'gainAnyWeaponAndRemoveToken'
                );
                if (anyWeaponEffect !== undefined && anyWeaponEffect.kind === 'gainAnyWeaponAndRemoveToken') {
                  const weaponIds = marketWeaponIds(state);
                  const removedToken: GameState = {
                    ...state,
                    ...nextBase,
                    removed: [...state.removed, instanceId],
                    prompts: newPrompts,
                  };
                  if (weaponIds.length === 0) return removedToken;
                  return {
                    ...removedToken,
                    prompts: [...newPrompts, {
                      id: `weaponCase-${seat}-v${state.version}`,
                      seat,
                      text: 'Weapon Case: choose any weapon from the Resource Area.',
                      options: weaponIds,
                      payload: { kind: 'weaponCaseChooseWeapon' },
                    }],
                  };
                }
                // Yellow Herb (plusMaxHp item): attaching to the character when
                // gained via Explore — NOT to the discard pile. Raises max HP
                // immediately and owes a heal at the start of the NEXT turn.
                const herbEffect = (takenDef?.itemEffects ?? []).find(e => e.kind === 'plusMaxHp');
                if (herbEffect !== undefined && herbEffect.kind === 'plusMaxHp') {
                  return {
                    ...state,
                    ...nextBase,
                    seats: state.seats.map(s =>
                      s.seat === seat
                        ? {
                            ...player,
                            attached: [...player.attached, instanceId],
                            maxHp: player.maxHp + herbEffect.amount,
                            pendingHerbHeal: (player.pendingHerbHeal ?? 0) + herbEffect.amount,
                          }
                        : s,
                    ),
                    prompts: newPrompts,
                  };
                }
                // Nightmare: MA-070 Treasure Map — attach to the character
                // instead of the discard pile.
                const attachEffect = (takenDef?.itemEffects ?? []).find(e => e.kind === 'attachThenRemoveForCardsAndGold');
                if (attachEffect !== undefined && attachEffect.kind === 'attachThenRemoveForCardsAndGold') {
                  return {
                    ...state,
                    ...nextBase,
                    seats: state.seats.map(s =>
                      s.seat === seat ? { ...player, attached: [...player.attached, instanceId] } : s,
                    ),
                    prompts: newPrompts,
                  };
                }
                // Nightmare: MA-071 Hidden Treasure — +gold +buy, then remove.
                const treasureEffect = (takenDef?.itemEffects ?? []).find(e => e.kind === 'gainGoldAndBuyThenRemove');
                if (treasureEffect !== undefined && treasureEffect.kind === 'gainGoldAndBuyThenRemove') {
                  return {
                    ...state,
                    ...nextBase,
                    seats: state.seats.map(s =>
                      s.seat === seat
                        ? { ...player, turnGold: player.turnGold + treasureEffect.gold, buysLeft: player.buysLeft + treasureEffect.buys }
                        : s,
                    ),
                    removed: [...state.removed, instanceId],
                    prompts: newPrompts,
                  };
                }
                // Outbreak: MA-054o Kevlar Jacket — attach to the character
                // instead of the discard pile.
                const kevlarEffect = (takenDef?.itemEffects ?? []).find(e => e.kind === 'attachAndPreventDamageByMovingToMansionBottom');
                if (kevlarEffect !== undefined && kevlarEffect.kind === 'attachAndPreventDamageByMovingToMansionBottom') {
                  return {
                    ...state,
                    ...nextBase,
                    seats: state.seats.map(s =>
                      s.seat === seat ? { ...player, attached: [...player.attached, instanceId] } : s,
                    ),
                    prompts: newPrompts,
                  };
                }
                // Outbreak: MA-055o Antivirus is resolved on reveal (see the
                // non-Infected reveal branch above), never through Take.
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s =>
                    s.seat === seat ? { ...player, discard: [...player.discard, instanceId] } : s,
                  ),
                  prompts: newPrompts,
                };
              }
              if (option === 1 && instanceId !== undefined) {
                return {
                  ...state,
                  ...nextBase,
                  mansionDeck: [...state.mansionDeck, instanceId],
                  prompts: newPrompts,
                };
              }
            }

            if (kind === 'antivirusDecrease') {
              // MA-055o Antivirus: remove `amount` Infection cards from the
              // exploring character. The cured cards go to the BOTTOM of the
              // Infection Deck (the deck is a closed system).
              const instanceId = prompt.payload?.instanceId as string | undefined;
              const takenDef = instanceId !== undefined ? cardDef(state, instanceId) : undefined;
              const eff = (takenDef?.itemEffects ?? []).find(e => e.kind === 'antivirusReduceInfectionOrRemove');
              if (option === 0 && eff !== undefined && eff.kind === 'antivirusReduceInfectionOrRemove') {
                const cards = [...(player.infectionCards ?? [])];
                const keep = Math.max(cards.length - eff.amount, 0);
                const remaining = cards.slice(0, keep);
                const cured = cards.slice(keep);
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s => (s.seat === seat ? { ...s, infectionCards: remaining } : s)),
                  ...(state.infectionDeck !== undefined ? { infectionDeck: [...state.infectionDeck, ...cured] } : {}),
                  prompts: newPrompts,
                };
              }
              return { ...state, ...nextBase, prompts: newPrompts };
            }

            if (kind === 'antivirusFate') {
              const instanceId = prompt.payload?.instanceId as string | undefined;
              if (option === 0 && instanceId !== undefined) {
                return { ...state, ...nextBase, mansionDeck: [...state.mansionDeck, instanceId], prompts: newPrompts };
              }
              if (option === 1 && instanceId !== undefined) {
                return { ...state, ...nextBase, removed: [...state.removed, instanceId], prompts: newPrompts };
              }
              return { ...state, ...nextBase, prompts: newPrompts };
            }

            if (kind === 'gainKnifeAtTurnStart') {
              // Krauser L1: the chosen option is the instance id of a market pile's
              // TOP knife card ('Decline' ends it). Gain = Resource Area -> the
              // player's Discard Pile (rules glossary), mirroring buy's bookkeeping
              // minus the Gold/Buy cost.
              const gainedId = prompt.options[option];
              if (gainedId === undefined || gainedId === 'Decline') {
                return { ...state, ...nextBase, prompts: newPrompts };
              }
              // Find the pile whose top card is the chosen knife.
              const pileEntry = Object.entries(state.marketPiles).find(
                ([, pile]) => pile.cards[0] === gainedId
              );
              if (pileEntry === undefined) {
                // Top card changed underneath us (defensive) — drop the prompt.
                return { ...state, ...nextBase, prompts: newPrompts };
              }
              const [pileId, pile] = pileEntry;
              let afterPile: GameState = {
                ...state,
                ...nextBase,
                marketPiles: {
                  ...state.marketPiles,
                  [pileId]: { pileId, cards: pile.cards.slice(1) },
                },
                prompts: newPrompts,
              };
              const knifeDef = cardDef(state, gainedId);
              afterPile = gainCard(afterPile, {
                seat,
                cardId: knifeDef?.id ?? (gainedId.split('#')[0] as string),
                instanceId: gainedId,
                destination: 'discard',
                reason: 'turnStart',
              });
              return afterPile;
            }

            if (kind === 'drawOncePerTurnIfDamaged') {
              // AW-001 Albert Wesker L0: draw +1 card from inventory.
              const chosenId = prompt.options[option];
              if (chosenId === 'Decline') {
                return { ...state, ...nextBase, prompts: newPrompts };
              }
              const d = drawWithReshuffle({
                deck: player.inventory,
                discard: player.discard,
                count: 1,
                rngState: state.rngState,
              });
              return {
                ...state,
                ...nextBase,
                rngState: d.rngState,
                seats: state.seats.map(s =>
                  s.seat === seat
                    ? { ...s, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: d.discard }
                    : s
                ),
                prompts: newPrompts,
              };
            }

      if (kind === 'ricardoL2') {
        // CU-001 Ricardo Irving L2: accept -> the chosen Character takes
        // `give` Damage (the reduction is already provisionally applied);
        // Decline -> the full hit lands, i.e. re-apply the reduction.
        const chosen = prompt.options[option];
        const give = Number(prompt.payload?.give ?? '0');
        const reduction = Number(prompt.payload?.reduction ?? '0');
        if (chosen === undefined || chosen === 'Decline') {
          const p = state.seats[seat];
          if (p === undefined || reduction <= 0) {
            return { ...state, ...nextBase, prompts: newPrompts };
          }
          const hp = applyHpLoss(characterAbilities(state, seat), p.hp, reduction, p.downed || p.dead);
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? { ...s, hp } : s)),
            prompts: newPrompts,
          };
        }
        const targetSeat = Number(chosen);
        const target = state.seats[targetSeat];
        if (target === undefined || give <= 0) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetHp = applyHpLoss(characterAbilities(state, targetSeat), target.hp, give, target.downed || target.dead);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === targetSeat ? { ...s, hp: targetHp } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'exchangeHandWithInventoryTop') {
        // Sheva L1: the chosen hand card swaps with the top of Inventory.
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const top = player.inventory[0];
        if (top === undefined) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat
              ? {
                  ...player,
                  hand: player.hand.map(id => (id === chosen ? top : id)),
                  inventory: [chosen, ...player.inventory.slice(1)],
                }
              : s,
          ),
          prompts: newPrompts,
        };
      }

      if (kind === 'luisSeraDiscardToInventory') {
        // Luis Sera (Nightmare) L2: move discard cards to the BOTTOM of the
        // Inventory (the draw pile's far end), any number; DONE ends the chain.
        const chosen = prompt.options[option];
        if (chosen === 'DONE' || chosen === undefined || !player.discard.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const remaining = player.discard.filter(id => id !== chosen);
        const newPlayer = { ...player, discard: remaining, inventory: [...player.inventory, chosen] };
        let prompts = newPrompts;
        if (remaining.length > 0) {
          prompts = [
            ...prompts,
            {
              id: `${prompt.id}:t${state.log.length}`,
              seat,
              text: prompt.text,
              options: [...remaining, 'DONE'],
              payload: { kind: 'luisSeraDiscardToInventory' },
            },
          ];
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          prompts,
        };
      }
      if (kind === 'trashFromHandAtWill') {
        // Rebecca L2: trash cards from hand, any number; DONE ends the chain.
        const chosen = prompt.options[option];
        if (chosen === 'DONE' || chosen === undefined || !player.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const remaining = player.hand.filter(id => id !== chosen);
        const newPlayer = { ...player, hand: remaining };
        let prompts = newPrompts;
        if (remaining.length > 0) {
          prompts = [
            ...prompts,
            {
              id: `${prompt.id}:t${state.log.length}`,
              seat,
              text: prompt.text,
              options: [...remaining, 'DONE'],
              payload: { kind: 'trashFromHandAtWill' },
            },
          ];
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...state.removed, chosen],
          prompts,
        };
      }

      // -------------------------------------------------------------------
      // Mercenaries expansion prompt resolutions
      // -------------------------------------------------------------------

      if (kind === 'resuscitate') {
        // AC-050: trash the card to keep the Character at 10 HP; otherwise the
        // downed state is restored.
        const chosen = prompt.options[option];
        const targetSeat = Number(prompt.payload?.targetSeat ?? '');
        const pending = state.pendingResuscitate;
        if (pending === undefined || pending.seat !== targetSeat) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const clearPrompts = newPrompts.filter(p =>
          !(p.payload?.kind === 'resuscitate' && p.payload?.targetSeat === String(targetSeat)));
        if (chosen === undefined || chosen === 'Decline') {
          // Nobody trashed a Resuscitate: apply the down to the CURRENT state
          // (the saved Character may have kept acting while the prompt was open).
          let next: GameState = { ...state, ...nextBase, pendingResuscitate: undefined, prompts: clearPrompts };
          const current = next.seats[targetSeat];
          if (current !== undefined && !current.downed && !current.dead && current.hp > 0) {
            let rng = makeRng(next.rngState);
            const rngShuffle = (items: readonly string[]): string[] => {
              const r = shuffle(rng, items);
              rng = r.rng;
              return [...r.value];
            };
            const flip = flipDown(
              {
                hp: 0,
                maxHp: current.maxHp,
                decorations: current.decorations,
                level: current.level,
                downed: false,
                dead: false,
                hand: current.hand,
                discard: current.discard,
                inventory: current.inventory,
              },
              rngShuffle,
            );
            next = {
              ...next,
              rngState: rng.s,
              seats: next.seats.map(s => (s.seat === targetSeat
                ? { ...s, hp: flip.hp, downed: flip.downed, dead: flip.dead, hand: flip.hand, discard: flip.discard, inventory: flip.inventory }
                : s)),
            };
          }
          return next;
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: s.hand.filter(id => id !== chosen), playArea: s.playArea.filter(id => id !== chosen) }
            : s)),
          removed: [...state.removed, chosen],
          pendingResuscitate: undefined,
          prompts: clearPrompts,
        };
      }

      if (kind === 'specialistActionsForBuy') {
        // CR-001 Claire Redfield L2 (SPECIALIST): at turn start, may get
        // +actions Actions and -buy Buy.
        const chosen = prompt.options[option];
        const extraActions = Number(prompt.payload?.actions ?? '0');
        const lostBuy = Number(prompt.payload?.buy ?? '0');
        if (chosen !== 'Yes') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, actionsLeft: s.actionsLeft + extraActions, buysLeft: Math.max(s.buysLeft - lostBuy, 0) }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'claireBuyForAmmo') {
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '10');
        if (chosen !== 'Yes') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, buysLeft: Math.max(s.buysLeft - 1, 0), allWeaponsAmmoDiscountThisTurn: amount }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'jillAmmoIncrease') {
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '10');
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === targetSeat ? { ...s, ammoReqIncreaseNextTurn: amount } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'rebeccaBuyRedirect') {
        const chosen = prompt.options[option];
        const boughtId = String(prompt.payload?.instanceId ?? '');
        if (chosen === undefined || chosen === 'Keep' || boughtId === '') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const targetSeat = Number(chosen);
        let s = removeInstanceEverywhere({ ...state, ...nextBase, prompts: newPrompts }, boughtId);
        s = { ...s, seats: s.seats.map(x => (x.seat === targetSeat ? { ...x, discard: [...x.discard, boughtId] } : x)) };
        return s;
      }

      if (kind === 'we046ChooseAmount') {
        const chosen = prompt.options[option];
        const weaponId = String(prompt.payload?.weaponInstanceId ?? '');
        const perXp = Number(prompt.payload?.perXp ?? '10');
        const amount = Number(chosen);
        if (chosen === undefined || weaponId === '' || !Number.isFinite(amount) || amount < 1) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...s,
                xp: Math.max((s.xp ?? 0) - amount, 0),
                weaponDamageBonusById: { ...(s.weaponDamageBonusById ?? {}), [weaponId]: (s.weaponDamageBonusById?.[weaponId] ?? 0) + perXp * amount },
                usedWeaponEffectsThisTurn: [...(s.usedWeaponEffectsThisTurn ?? []), weaponId],
              }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'ma073ChoosePlayer') {
        const chosen = prompt.options[option];
        const count = Number(prompt.payload?.count ?? '1');
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        return gainAmmoX10({ ...state, ...nextBase, prompts: newPrompts }, Number(chosen), count);
      }

      if (kind === 'ma074ChoosePlayer') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        const target = state.seats[targetSeat];
        if (target === undefined || target.hand.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:card`,
            seat: targetSeat,
            text: 'Trash 1 card from your Hand and replace it with 1 "Ammo x10".',
            options: [...target.hand],
            payload: { kind: 'ma074ChooseHandCard', targetSeat: String(targetSeat) },
          }],
        };
      }

      if (kind === 'ma074ChooseHandCard') {
        const chosen = prompt.options[option];
        const targetSeat = Number(prompt.payload?.targetSeat ?? '');
        if (chosen === undefined || !state.seats[targetSeat]?.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        let s: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(x => (x.seat === targetSeat ? { ...x, hand: x.hand.filter(id => id !== chosen) } : x)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
        s = gainAmmoX10(s, targetSeat, 1, 'hand');
        return s;
      }

      if (kind === 'ma076RemoveSkillXp') {
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '1');
        const inst = chosen === undefined ? undefined : state.cards[chosen];
        if (chosen === undefined || inst === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          cards: { ...state.cards, [chosen]: { ...inst, xp: Math.max((inst.xp ?? 0) - amount, 0) } },
          prompts: newPrompts,
        };
      }

      if (kind === 'ma080ChooseCard') {
        const chosen = prompt.options[option];
        const targets = String(prompt.payload?.targets ?? '');
        const count = Number(prompt.payload?.count ?? '2');
        const cards = String(prompt.payload?.cards ?? '');
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        // The outcome may have moved the discard to the Inventory since the
        // prompt was created (e.g. the exploring Character was Downed by this
        // Infected's attack). Only cards still in the Discard Pile are movable.
        const liveDiscard = player.discard;
        const accumulated = cards.split(',').filter(Boolean).filter(id => liveDiscard.includes(id));
        const targetPrompt = (live: readonly string[]): Prompt => ({
          id: `${prompt.id}:target`,
          seat,
          text: 'Choose the Player with the highest Decorations to receive the moved cards.',
          options: targets.split(',').filter(Boolean),
          payload: { kind: 'ma080ChooseTarget', cards: live.join(',') },
        });
        if (chosen === 'DONE' || !liveDiscard.includes(chosen)) {
          if (accumulated.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
          return { ...state, ...nextBase, prompts: [...newPrompts, targetPrompt(accumulated)] };
        }
        const newCards = [...accumulated, chosen];
        const remaining = liveDiscard.filter(id => !newCards.includes(id));
        if (newCards.length >= count || remaining.length === 0) {
          return { ...state, ...nextBase, prompts: [...newPrompts, targetPrompt(newCards)] };
        }
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:c${newCards.length}`,
            seat,
            text: prompt.text,
            options: [...remaining, 'DONE'],
            payload: { kind: 'ma080ChooseCard', targets, count: String(count), cards: newCards.join(',') },
          }],
        };
      }

      if (kind === 'ma080ChooseTarget') {
        const chosen = prompt.options[option];
        const cards = String(prompt.payload?.cards ?? '').split(',').filter(Boolean)
          .filter(id => state.seats[seat]?.discard.includes(id));
        if (chosen === undefined || cards.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === seat) return { ...s, discard: s.discard.filter(id => !cards.includes(id)) };
            if (s.seat === targetSeat) return { ...s, discard: [...s.discard, ...cards] };
            return s;
          }),
          prompts: newPrompts,
        };
      }

      if (kind === 'ma086PassCard') {
        const chosen = prompt.options[option];
        const targetSeat = Number(prompt.payload?.targetSeat ?? '');
        if (chosen === undefined || !player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === seat) return { ...s, hand: s.hand.filter(id => id !== chosen) };
            if (s.seat === targetSeat) return { ...s, hand: [...s.hand, chosen] };
            return s;
          }),
          prompts: newPrompts,
        };
      }

      if (kind === 'ma089RemovePileTop') {
        const chosen = prompt.options[option];
        const pile = chosen === undefined ? undefined : state.marketPiles[chosen];
        const top = pile?.cards[0];
        if (pile === undefined || top === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          marketPiles: { ...state.marketPiles, [chosen as string]: { ...pile, cards: pile.cards.slice(1) } },
          removed: [...state.removed, top],
          prompts: newPrompts,
        };
      }

      if (kind === 'ma092ChooseCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        return gainCopy({ ...state, ...nextBase, prompts: newPrompts }, seat, chosen);
      }

      if (kind === 'ma088ChooseCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed).map(s => String(s.seat));
        if (others.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:target`,
            seat,
            text: "Choose an opponent's Discard Pile.",
            options: others,
            payload: { kind: 'ma088ChooseTarget', cardId: chosen },
          }],
        };
      }

      if (kind === 'ma088ChooseTarget') {
        const chosen = prompt.options[option];
        const cardId = String(prompt.payload?.cardId ?? '');
        if (chosen === undefined || cardId === '') return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        const pileEntry = Object.entries(state.marketPiles).find(([, p]) => p.cards[0] === cardId);
        if (pileEntry === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const [pileId, pile] = pileEntry;
        return {
          ...state,
          ...nextBase,
          marketPiles: { ...state.marketPiles, [pileId]: { ...pile, cards: pile.cards.slice(1) } },
          seats: state.seats.map(s => (s.seat === targetSeat ? { ...s, discard: [...s.discard, cardId] } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'ma094ChooseCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const owner = ownerSeatOf(state, chosen);
        if (owner === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === owner ? { ...s, discard: s.discard.filter(id => id !== chosen) } : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'ma096ChooseSeat') {
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '20');
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        return dealDamageToCharacter({ ...state, ...nextBase, prompts: newPrompts }, Number(chosen), amount);
      }

      if (kind === 'ma098ChooseCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed).map(s => String(s.seat));
        if (others.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:target`,
            seat,
            text: "Choose another Player's Discard Pile.",
            options: others,
            payload: { kind: 'ma098ChooseTarget', cardId: chosen },
          }],
        };
      }

      if (kind === 'ma098ChooseTarget') {
        const chosen = prompt.options[option];
        const cardId = String(prompt.payload?.cardId ?? '');
        if (chosen === undefined || cardId === '') return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        // Another prompt from the same explore may already have moved this
        // card; moving it again would duplicate it into the target's discard.
        const ma098Source = state.seats[seat];
        if (ma098Source === undefined || (!ma098Source.hand.includes(cardId) && !ma098Source.discard.includes(cardId))) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === seat) return { ...s, hand: s.hand.filter(id => id !== cardId), discard: s.discard.filter(id => id !== cardId) };
            if (s.seat === targetSeat) return { ...s, discard: [...s.discard, cardId] };
            return s;
          }),
          prompts: newPrompts,
        };
      }

      if (kind === 'ma090ChooseWeapon') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, playArea: s.playArea.filter(id => id !== chosen) } : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'chrisTrashDiscardOrHand') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        if (!player.discard.includes(chosen) && !player.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, discard: s.discard.filter(id => id !== chosen), hand: s.hand.filter(id => id !== chosen) }
            : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'we044ChooseCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const others = state.seats.filter(s => s.seat !== seat && !s.dead && !s.downed).map(s => String(s.seat));
        if (others.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:target`,
            seat,
            text: "Choose another Player's Discard Pile.",
            options: others,
            payload: { kind: 'we044ChooseTarget', cardId: chosen },
          }],
        };
      }

      if (kind === 'we044ChooseTarget') {
        const chosen = prompt.options[option];
        const cardId = String(prompt.payload?.cardId ?? '');
        if (chosen === undefined || cardId === '') return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        // Another prompt from the same explore (e.g. MA-098) may already have
        // moved this card. Moving it again would duplicate it into the target's
        // discard, so verify it is still in the source seat's zones.
        const source = state.seats[seat];
        if (source === undefined || (!source.hand.includes(cardId) && !source.discard.includes(cardId))) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === seat) return { ...s, hand: s.hand.filter(id => id !== cardId), discard: s.discard.filter(id => id !== cardId) };
            if (s.seat === targetSeat) return { ...s, discard: [...s.discard, cardId] };
            return s;
          }),
          prompts: newPrompts,
        };
      }

      if (kind === 'we050Choose') {
        const chosen = prompt.options[option];
        const amount = Number(prompt.payload?.amount ?? '10');
        const weaponId = String(prompt.payload?.weaponInstanceId ?? '');
        if (chosen !== 'Yes' || weaponId === '') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, turnGold: s.turnGold + amount, trashAtEndOfTurn: [...(s.trashAtEndOfTurn ?? []), weaponId] }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'ac043ChoosePlayer') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        const target = state.seats[targetSeat];
        const weapons = (target?.hand ?? []).filter(id => cardDef(state, id)?.type === 'weapon');
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:weapon`,
            seat,
            text: `Choose a Weapon from ${target?.name ?? 'that Player'}'s Hand to Discard.`,
            options: [...weapons, 'None'],
            payload: { kind: 'ac043ChooseWeapon', targetSeat: String(targetSeat) },
          }],
        };
      }

      if (kind === 'ac043ChooseWeapon') {
        const chosen = prompt.options[option];
        const targetSeat = Number(prompt.payload?.targetSeat ?? '');
        if (chosen === undefined || chosen === 'None') return { ...state, ...nextBase, prompts: newPrompts };
        if (!(state.seats[targetSeat]?.hand ?? []).includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const def = cardDef(state, chosen);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => {
            if (s.seat === targetSeat) return { ...s, hand: s.hand.filter(id => id !== chosen), discard: [...s.discard, chosen] };
            if (s.seat === seat) return { ...s, weaponDamageBonusThisTurn: s.weaponDamageBonusThisTurn + (def?.damage ?? 0) };
            return s;
          }),
          prompts: newPrompts,
        };
      }

      // --- Nightmare: WE-036 Single Shot Rifle w/Scope ---
      // The exploring player chose a target; that player now discards a card.
      if (kind === 'we036ChoosePlayer') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        const target = state.seats[targetSeat];
        if (target === undefined || target.hand.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:discard`,
            seat: targetSeat,
            text: 'Single Shot Rifle w/Scope: discard a card from your hand.',
            options: [...target.hand],
            payload: { kind: 'we036Discard' },
          }],
        };
      }

      if (kind === 'we036Discard' || kind === 'we037Discard') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        if (!player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: s.hand.filter(id => id !== chosen), discard: [...s.discard, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }

      // --- Nightmare: MA-057 Jack Krauser — gain the top card from a pile. ---
      if (kind === 'ma057ChoosePile') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const pile = state.marketPiles[chosen];
        const top = pile?.cards[0];
        if (pile === undefined || top === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const topDef = cardDef(state, top);
        const s: GameState = {
          ...state,
          ...nextBase,
          marketPiles: { ...state.marketPiles, [chosen]: { ...pile, cards: pile.cards.slice(1) } },
        };
        return gainCard({ ...s, prompts: newPrompts }, {
          seat,
          cardId: topDef?.id ?? (top.split('#')[0] as string),
          instanceId: top,
          destination: 'discard',
          reason: 'explore',
        });
      }

      // --- Nightmare: CH-040 Mysterious Mask L1 / CH-042 Leon L1 ---
      if (kind === 'maskTrashDiscard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, discard: s.discard.filter(id => id !== chosen) } : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'leonTrashForGain') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const def = cardDef(state, chosen);
        const maxCost = (def?.cost ?? 0) + 20;
        const s: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(x => (x.seat === seat ? { ...x, discard: x.discard.filter(id => id !== chosen) } : x)),
          removed: [...state.removed, chosen],
        };
        const candidates = Object.values(s.marketPiles)
          .map(p => p.cards[0])
          .filter((id): id is string => id !== undefined)
          .filter(id => (cardDef(s, id)?.cost ?? 0) <= maxCost);
        if (candidates.length === 0) return { ...s, prompts: newPrompts };
        return {
          ...s,
          prompts: [...newPrompts, {
            id: `${prompt.id}:gain`,
            seat,
            text: `Leon: gain a card costing up to ${maxCost}.`,
            options: [...candidates, 'Decline'],
            payload: { kind: 'leonGainCard' },
          }],
        };
      }

      if (kind === 'leonGainCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const pileEntry = Object.entries(state.marketPiles).find(([, p]) => p.cards[0] === chosen);
        if (pileEntry === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const [pileId, pile] = pileEntry;
        const s: GameState = {
          ...state,
          marketPiles: { ...state.marketPiles, [pileId]: { ...pile, cards: pile.cards.slice(1) } },
        };
        return gainCard({ ...s, ...nextBase, prompts: newPrompts }, {
          seat,
          cardId: cardDef(state, chosen)?.id ?? (chosen.split('#')[0] as string),
          instanceId: chosen,
          destination: 'discard',
          reason: 'ability',
        });
      }

      if (kind === 'maskDiscardActionForCards') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const discarded: PlayerState = { ...player, hand: player.hand.filter(id => id !== chosen), discard: [...player.discard, chosen] };
        const d = drawWithReshuffle({ deck: discarded.inventory, discard: discarded.discard, count: 2, rngState: state.rngState });
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...discarded, hand: [...discarded.hand, ...d.hand], inventory: d.deck, discard: d.discard }
            : s)),
          prompts: newPrompts,
        };
      }

      // --- Nightmare: CH-036 Luis Sera L1 / CH-041 Wesker L1 / CH-035 Sergei L1 ---
      if (kind === 'luisPlusOneCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'No') return { ...state, ...nextBase, prompts: newPrompts };
        const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 1, rngState: state.rngState });
        const drawn: PlayerState = { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard };
        // "discard one card if you have 10 or fewer cards in your discard pile"
        if (drawn.discard.length <= 10 && drawn.hand.length > 0) {
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat ? drawn : s)),
            prompts: [...newPrompts, {
              id: `${prompt.id}:discard`,
              seat,
              text: 'Luis Sera: discard one card.',
              options: [...drawn.hand],
              payload: { kind: 'luisDiscardOne' },
            }],
          };
        }
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat ? drawn : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'luisDiscardOne') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        if (!player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: s.hand.filter(id => id !== chosen), discard: [...s.discard, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'weskerPlusOneCard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'No') return { ...state, ...nextBase, prompts: newPrompts };
        const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 1, rngState: state.rngState });
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: d.discard }
            : s)),
          prompts: newPrompts,
        };
      }
      
      // RC-001 Rebecca Chambers L1: at turn start, may draw 1 card then discard 1.
      if (kind === 'rebeccaTurnStartDrawAndDiscard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Pass') return { ...state, ...nextBase, prompts: newPrompts };
        // Draw +1 card from inventory to hand
        const d = drawWithReshuffle({ deck: player.inventory, discard: player.discard, count: 1, rngState: state.rngState });
        const drawnPlayer: PlayerState = { ...player, hand: [...player.hand, ...d.hand], inventory: d.deck, discard: d.discard };
        // Now prompt to discard 1 card
        if (drawnPlayer.hand.length === 0) {
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat ? drawnPlayer : s)),
            prompts: newPrompts,
          };
        }
        const handCards = drawnPlayer.hand;
        const discardOptions = handCards.map(id => {
          const cd = state.cardDefs[state.cards[id]?.cardId ?? ''];
          return `${cd?.name ?? 'Unknown'} (${id})`;
        });
        discardOptions.push('No Discard');
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat ? drawnPlayer : s)),
          prompts: [...newPrompts, {
            id: `${prompt.id}:discard`,
            seat,
            text: 'Rebecca Chambers L1: choose a card to discard.',
            options: discardOptions,
            payload: { kind: 'rebeccaDiscard' },
          }],
        };
      }
      
      if (kind === 'sergeiSelfDamage') {
        const chosen = prompt.options[option];
        if (chosen === undefined || chosen === 'Decline') return { ...state, ...nextBase, prompts: newPrompts };
        const ab = seatAbilities(state, seat).find(a => a.kind === 'optionalSelfDamageForDamageThisTurn') as
          | { damage: number; amount: number }
          | undefined;
        if (ab === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const promptCountBefore = state.prompts.length;
        const ric = applyRicardoDamage(state, seat, player.hp, ab.damage);
        state = ric.state;
        const newHp = ric.hp;
        const ricPrompts = state.prompts.slice(promptCountBefore);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hp: newHp, weaponDamageBonusThisTurn: (s.weaponDamageBonusThisTurn ?? 0) + ab.amount }
            : s)),
          prompts: [...newPrompts, ...ricPrompts],
        };
      }

      // --- Nightmare: AC-035 PDA — trash one of the looked-at cards, then
      // return the rest to the top or bottom of the inventory. ---
      if (kind === 'pdaLook') {
        const chosen = prompt.options[option];
        const looked = String(prompt.payload?.looked ?? '').split(',').filter(Boolean);
        const trashed = chosen !== undefined && chosen !== 'None' ? chosen : undefined;
        const remaining = looked.filter(id => id !== trashed);
        let s = state;
        if (trashed !== undefined) {
          s = {
            ...s,
            seats: s.seats.map(x => (x.seat === seat ? { ...x, inventory: x.inventory.filter(id => id !== trashed) } : x)),
            removed: [...s.removed, trashed],
          };
        }
        if (remaining.length === 0) return { ...s, ...nextBase, prompts: newPrompts };
        return {
          ...s,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:return`,
            seat,
            text: 'PDA: return the other looked-at cards to the top or bottom of your inventory.',
            options: ['Top', 'Bottom'],
            payload: { kind: 'pdaReturn', remaining: remaining.join(','), first: remaining[0] ?? '' },
          }],
        };
      }

      if (kind === 'pdaReturn') {
        const chosen = prompt.options[option];
        const first = String(prompt.payload?.first ?? '');
        const rest = String(prompt.payload?.remaining ?? '').split(',').filter(Boolean).filter(id => id !== first);
        if (first === '') return { ...state, ...nextBase, prompts: newPrompts };
        const s = {
          ...state,
          seats: state.seats.map(x => (x.seat === seat
            ? (chosen === 'Top'
              ? { ...x, inventory: [first, ...x.inventory.filter(id => id !== first)] }
              : { ...x, inventory: [...x.inventory.filter(id => id !== first), first] })
            : x)),
        };
        if (rest.length === 0) return { ...s, ...nextBase, prompts: newPrompts };
        return {
          ...s,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:return`,
            seat,
            text: 'PDA: return the other looked-at cards to the top or bottom of your inventory.',
            options: ['Top', 'Bottom'],
            payload: { kind: 'pdaReturn', remaining: rest.join(','), first: rest[0] ?? '' },
          }],
        };
      }

      // --- Nightmare: AC-038 Mind Control — choose a player, then an Action
      // card from their hand; they discard it and you copy its bonuses and
      // effects twice. ---
      if (kind === 'chooseOtherPlayerRevealHand') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const targetSeat = Number(chosen);
        const target = state.seats[targetSeat];
        const maxCost = Number(prompt.payload?.maxCost ?? '70');
        const candidates = (target?.hand ?? []).filter(id => {
          const c = cardDef(state, id);
          return c?.type === 'action' && (c.cost ?? 0) <= maxCost;
        });
        if (candidates.length === 0) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:card`,
            seat,
            text: `Mind Control: choose an Action card with a cost of ${maxCost} or less from ${target?.name ?? 'that Player'}'s hand.`,
            options: [...candidates],
            payload: { kind: 'chooseActionCardCostAtMost', targetSeat: String(targetSeat) },
          }],
        };
      }

      if (kind === 'chooseActionCardCostAtMost') {
        const chosen = prompt.options[option];
        const targetSeat = Number(prompt.payload?.targetSeat ?? '');
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        if (!(state.seats[targetSeat]?.hand ?? []).includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const def = cardDef(state, chosen);
        const s = {
          ...state,
          ...nextBase,
          seats: state.seats.map(x => (x.seat === targetSeat
            ? { ...x, hand: x.hand.filter(id => id !== chosen), discard: [...x.discard, chosen] }
            : x)),
        };
        return { ...applyMindControlCopy(s, seat, def), prompts: newPrompts };
      }

      if (kind === 'ac044Discard') {
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        const count = Number(prompt.payload?.count ?? '1');
        const cards = String(prompt.payload?.cards ?? '');
        const newCards = cards === '' ? chosen : `${cards},${chosen}`;
        const newPlayer: PlayerState = {
          ...player,
          hand: player.hand.filter(id => id !== chosen),
          discard: [...player.discard, chosen],
        };
        if (count >= 2) {
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            prompts: [...newPrompts, {
              id: `${prompt.id}:trash`,
              seat,
              text: 'Trash 1 card from your Hand.',
              options: newPlayer.hand,
              payload: { kind: 'ac044Trash' },
            }],
          };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          prompts: [...newPrompts, {
            id: `${prompt.id}:d${count + 1}`,
            seat,
            text: prompt.text,
            options: newPlayer.hand,
            payload: { kind: 'ac044Discard', count: String(count + 1), cards: newCards },
          }],
        };
      }

      if (kind === 'ac044Trash') {
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, hand: s.hand.filter(id => id !== chosen) } : s)),
          removed: [...state.removed, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'ac045ChooseWeapon') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const eff = (cardDef(state, instanceId)?.actionEffects ?? [])
          .find(e => e.kind === 'choosePlayerForCoupDeGrace');
        const perXp = eff !== undefined && eff.kind === 'choosePlayerForCoupDeGrace' ? eff.perXp : 10;
        const maxAmount = eff !== undefined && eff.kind === 'choosePlayerForCoupDeGrace' ? eff.maxAmount : 20;
        const xp = player.xp ?? 0;
        const amount = Math.min(Math.floor(xp / 5) * perXp, maxAmount);
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, pendingCoupDeGrace: { weaponInstanceId: chosen, amount } } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'ac047ChooseFirst') {
        const chosen = prompt.options[option];
        if (chosen === undefined || !player.hand.includes(chosen)) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:second`,
            seat,
            text: prompt.text,
            options: player.hand.filter(id => id !== chosen),
            payload: { kind: 'ac047ChooseSecond', firstId: chosen },
          }],
        };
      }

      if (kind === 'ac047ChooseSecond') {
        const chosen = prompt.options[option];
        const firstId = String(prompt.payload?.firstId ?? '');
        if (chosen === undefined || firstId === '' || chosen === firstId || !player.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const firstDef = cardDef(state, firstId);
        const secondDef = cardDef(state, chosen);
        const eff = (cardDef(state, instanceId)?.actionEffects ?? [])
          .find(e => e.kind === 'trashTwoFromHandForGoldIfSameType');
        const amount = eff !== undefined && eff.kind === 'trashTwoFromHandForGoldIfSameType' ? eff.amount : 20;
        const sameType = firstDef?.type !== undefined && firstDef?.type === secondDef?.type;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? {
                ...s,
                hand: s.hand.filter(id => id !== firstId && id !== chosen),
                turnGold: s.turnGold + (sameType ? amount : 0),
              }
            : s)),
          removed: [...state.removed, firstId, chosen],
          prompts: newPrompts,
        };
      }

      if (kind === 'ac048ChoosePlayer') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, pendingBackstab: { targetSeat: Number(chosen) } } : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'ac049Move') {
        const chosen = prompt.options[option];
        if (chosen === undefined) return { ...state, ...nextBase, prompts: newPrompts };
        const cards = String(prompt.payload?.cards ?? '');
        if (chosen === 'DONE') {
          const moved = cards.split(',').filter(Boolean);
          let newPlayer: PlayerState = {
            ...player,
            hand: player.hand.filter(id => !moved.includes(id)),
            inventory: [...player.inventory, ...moved],
          };
          const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: moved.length, rngState: state.rngState });
          newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
          let prompts = newPrompts;
          if ((newPlayer.xp ?? 0) >= 1) {
            prompts = [...prompts, {
              id: `${prompt.id}:xp`,
              seat,
              text: 'Remove 1 XP on your Character from the Game to get +1 card?',
              options: ['Yes', 'No'],
              payload: { kind: 'ac049RemoveXp' },
            }];
          }
          return {
            ...state,
            ...nextBase,
            rngState: d.rngState,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            prompts,
          };
        }
        const newCards = cards === '' ? chosen : `${cards},${chosen}`;
        return {
          ...state,
          ...nextBase,
          prompts: [...newPrompts, {
            id: `${prompt.id}:m${newCards.split(',').filter(Boolean).length}`,
            seat,
            text: prompt.text,
            options: [...player.hand.filter(id => !newCards.split(',').includes(id)), 'DONE'],
            payload: { kind: 'ac049Move', cards: newCards },
          }],
        };
      }

      if (kind === 'ac049RemoveXp') {
        const chosen = prompt.options[option];
        if (chosen !== 'Yes') return { ...state, ...nextBase, prompts: newPrompts };
        const newPlayer: PlayerState = { ...player, xp: Math.max((player.xp ?? 0) - 1, 0) };
        const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 1, rngState: state.rngState });
        const p: PlayerState = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
        return {
          ...state,
          ...nextBase,
          rngState: d.rngState,
          seats: state.seats.map(s => (s.seat === seat ? p : s)),
          prompts: newPrompts,
        };
      }

      if (kind === 'backstabChooseSkill') {
        const chosen = prompt.options[option];
        const fromSeat = Number(prompt.payload?.fromSeat ?? '');
        const toSeat = Number(prompt.payload?.toSeat ?? '');
        const inst = chosen === undefined ? undefined : state.cards[chosen];
        if (chosen === undefined || inst === undefined || (inst.xp ?? 0) < 1) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        let prompts = newPrompts;
        const target = state.seats[fromSeat];
        if (target !== undefined && target.hand.length > 0) {
          prompts = [...prompts, {
            id: `${prompt.id}:discard`,
            seat: fromSeat,
            text: 'Backstab: Discard 1 card.',
            options: [...target.hand],
            payload: { kind: 'backstabDiscard', fromSeat: String(fromSeat) },
          }];
        }
        return {
          ...state,
          ...nextBase,
          cards: { ...state.cards, [chosen]: { ...inst, xp: (inst.xp ?? 0) - 1 } },
          seats: state.seats.map(s => (s.seat === toSeat ? { ...s, xp: (s.xp ?? 0) + 1 } : s)),
          prompts,
        };
      }

      if (kind === 'backstabDiscard') {
        const chosen = prompt.options[option];
        const fromSeat = Number(prompt.payload?.fromSeat ?? '');
        if (chosen === undefined || !state.seats[fromSeat]?.hand.includes(chosen)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === fromSeat
            ? { ...s, hand: s.hand.filter(id => id !== chosen), discard: [...s.discard, chosen] }
            : s)),
          prompts: newPrompts,
        };
      }

      // CV-001 Cover-up: trash this card from hand -> peek the top Mansion
      // card, then you may move it to the bottom. Two-step chain: the trash
      // resolves here, and the peek+move is a follow-up prompt.
      if (kind === 'coverUpTrash') {
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        // Trash the held card (verify it is still in hand — the explore may
        // have consumed it while the prompt was open).
        if (instanceId === '' || !player.hand.includes(instanceId)) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const topId = state.mansionDeck[0];
        const topDef = topId === undefined ? undefined : cardDef(state, topId);
        const afterTrash: GameState = {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, hand: s.hand.filter(id => id !== instanceId) }
            : s)),
          removed: [...state.removed, instanceId],
        };
        if (topId === undefined) {
          return { ...afterTrash, mansionDeck: state.mansionDeck, prompts: newPrompts };
        }
        return {
          ...afterTrash,
          prompts: [...newPrompts, {
            id: `coverup-peek-${seat}-v${nextBase.version}`,
            seat,
            text: `You look at the top of the Mansion: ${topDef?.name ?? 'an unknown card'} (${topDef?.hp ?? '?'} HP). Move it to the bottom of the Mansion?`,
            options: ['Move to bottom', 'Leave it'],
            payload: { kind: 'coverUpPeek', topId },
          }],
        };
      }
      // CV-001 Cover-up peek: optionally move the peeked top card to the
            // bottom of the deck. sendToBottom only APPENDS to the deck — the
            // caller must remove the card from the deck itself (the explore paths
            // rely on revealTop having popped it; here we filter explicitly).
            if (kind === 'coverUpPeek') {
              if (chosenId === 'Move to bottom') {
                const topId = String(prompt.payload?.topId ?? '');
                if (topId !== '' && state.mansionDeck[0] === topId) {
                  const deckWithout = state.mansionDeck.filter(id => id !== topId);
                  const bottomed = sendToBottom({ deck: deckWithout }, topId);
                  return {
                    ...state,
                    ...nextBase,
                    mansionDeck: bottomed.deck,
                    prompts: newPrompts,
                  };
                }
              }
            }

      // RC-001 Rebecca Chambers L2: when discarding due to a card effect during your turn, gain +20 gold.
      if (kind === 'rebeccaDiscard') {
        const chosenOpt = prompt.options[option];
        if (chosenOpt === undefined || chosenOpt === 'No Discard') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        // Find which hand card was chosen (strip name part)
        const handCards = player.hand;
        const discardedCardId = handCards.find(id => {
          const cd = state.cardDefs[state.cards[id]?.cardId ?? ''];
          return `${cd?.name ?? 'Unknown'} (${id})` === chosenOpt;
        });
        if (!discardedCardId) {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        // Apply L2 bonus if present
        let nextSeat: PlayerState = { ...player };
        const abL2 = seatAbilities(state, seat).find(a => a.kind === 'goldWhenDiscardingAtTurnStart');
        if (abL2 && abL2.kind === 'goldWhenDiscardingAtTurnStart' && abL2.amount > 0) {
          nextSeat = { ...nextSeat, turnGold: nextSeat.turnGold + abL2.amount };
        }
        // Move discarded card from hand to discard
        const updatedHand = nextSeat.hand.filter(id => id !== discardedCardId);

        const updatedSeats = state.seats.map(s => (s.seat === seat ? nextSeat : s));
        const discardedInst = state.cards[discardedCardId];
        if (!discardedInst) { return { ...state, ...nextBase, prompts: newPrompts }; }
        return {
          ...state,
          ...nextBase,
          seats: updatedSeats,
          cards: { ...state.cards, [discardedCardId]: { instanceId: discardedInst.instanceId, cardId: discardedInst.cardId, xp: discardedInst.xp, location: { zone: 'discard', index: nextSeat.discard.length - 1 } } },
          prompts: newPrompts,
        };
      }
      
      // lookAtMansionTop + unknown payload: informational, no state change

      return {
        ...state,
        ...nextBase,
        prompts: newPrompts,
      };
    }

    default:
      throw new Error('applyAction: unknown action type');
  }
}
