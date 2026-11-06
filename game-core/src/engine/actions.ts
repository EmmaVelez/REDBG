import type { GameState, Action, PlayerState, CardDef, WeaponEffect } from '../types';
import { validateAction } from './validate';
import { draw, drawWithReshuffle, discardHand } from './deck';
import { revealTop, sendToBottom, shuffleBack } from './mansion';
import { resolveExplore, computeDamage, resolveMultiExplore } from './explore';
import { flipDown, levelForDecorations, abilitiesForLevel } from './characters';
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
  isExplosive,
  infectedDamageReduction,
  exploreBigHandBonus,
  exploreActionsBonus,
  knifeWeaponsUsedThisTurn,
} from './abilities';
import { sumBonuses, applyBonusPools } from './cards';
import { advanceTurn } from './turn';
import { gainCard } from './gainCard';
import { dropEmptyPrompts } from './prompts';
import { makeRng, shuffle } from '../util/rng';

import { advanceDraft, moveXp, applyUseSkill, resolveSkillXpAmount, activeSkillEffects, exploreSkillDamageBonus, skillDamageReduction, skillGiantKillingThreshold, skillLethalReplacementAmount } from './skill';

function cardDef(state: GameState, instanceId: string | undefined): CardDef | undefined {
  if (instanceId === undefined) return undefined;
  const inst = state.cards[instanceId];
  if (!inst) return undefined;
  return state.cardDefs[inst.cardId];
}

/** True when the instance is a Green Herb (the only card with this effect). */
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
  if (!characterAbilities(state, seat).some(a => a.kind === 'trashRedirectToPlayerDiscard')) {
    return prompts;
  }
  const others = state.seats.filter(s => s.seat !== seat && !s.dead);
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
  const next = applyDamageTakenHooks(state, applyActionInternal(state, action));
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
            // AC-013 Partners / AC-014 Star-Crossed Duo: attach this card to the partner (if any) on play.
            let partnerAttached = played.player.partnerAttached ?? [];
            if ((def.id === 'ac-013' || def.id === 'ac-014' || def.id === 'ac-020') && player.partnerInstanceId && partnerAttached.length < partnerAttachCap(characterAbilities(state, seat))) {
              partnerAttached = [...partnerAttached, instanceId];
            }
            let newPlayer: PlayerState = { ...played.player, partnerAttached, weaponDamageBonusThisTurn, turnGold: played.player.turnGold + actionBonus(characterAbilities(state, seat), def) + trashEffectBonus(characterAbilities(state, seat), def) };
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
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead);
                                if (others.length > 0) {
                                  promptKind = 'chooseOtherPlayerRevealHand';
                                  promptOptions = [...others.map(s => String(s.seat))];
                                }
                                break;
                              }
                              if (e.kind === 'chooseActionCardCostAtMost') {
                                const maxCost = e.maxCost;
                                const candidates = played.player.hand.filter(id => {
                                  const c = cardDef(state, id);
                                  return c?.type === 'action' && (c.cost ?? 0) <= maxCost;
                                });
                                if (candidates.length > 0) {
                                  promptKind = 'chooseActionCardCostAtMost';
                                  promptOptions = [...candidates];
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
                                const others = state.seats.filter(s => s.seat !== seat && !s.dead);
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
                              }
                      if (promptKind !== undefined && promptOptions !== undefined) {
        prompts = [
          ...prompts,
          {
            id: 'p' + (state.prompts.length + 1),
            seat,
            text: def.text,
            options: promptOptions,
            payload: { kind: promptKind, instanceId },
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
        const others = state.seats.filter(s => s.seat !== seat && !s.dead);
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
                newPlayer = { ...newPlayer, hp: applyHpLoss(characterAbilities(state, seat), newPlayer.hp, e.amount, newPlayer.downed || newPlayer.dead) };
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
              if (e.kind === 'attachToCharacter') {
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
                  newPlayer = { ...newPlayer, hp: applyHpLoss(characterAbilities(state, seat), newPlayer.hp, e.damage, newPlayer.downed || newPlayer.dead) };
                  const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: e.cards, rngState: rngAfterEffects });
                  newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
                  rngAfterEffects = d.rngState;
                  seatsAfterEffects = seatsAfterEffects.map(s => (s.seat === seat ? newPlayer : s));
                }
              }
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
                      let partnerHp = played.player.partnerInstanceId ? (state.seats[seat] as PlayerState).hp : played.player.hp;
                      let trashGreenHerbId: string | undefined;
                      let healPartner = false;
                for (const e of def.itemEffects ?? []) {
                        if (e.kind === 'healToFull') {
                          hp = played.player.maxHp;
                        } else if (e.kind === 'plusMaxHp') {
                          maxHp = played.player.maxHp + e.amount;
                        } else if (e.kind === 'healFixed20OrTrashWithSecondFor60') {
                          promptKind = 'healGreenHerb';
                        } else if (e.kind === 'healSelfAndPartnerToFull') {
                          const green = played.player.hand.find(id => isGreenHerb(state, id));
                          if (green) {
                            trashGreenHerbId = green;
                            hp = played.player.maxHp;
                            healPartner = true;
                          }
                        }
                      }
                // Claire Redfield (Alliance): L1 +amount damage when a Green or
                // Red Herb is trashed from hand; L2 double damage when both are.
                const claireAbilities = characterAbilities(state, seat);
                const claireBonus = herbTrashDamageBonus(claireAbilities);
                const claireDoubleDamage = hasDoubleDamageOnBothHerbs(claireAbilities);
                const trashedHerbKinds = new Set(def.itemEffects?.map(e => e.kind) ?? []);
                const trashedGreen = trashedHerbKinds.has('healFixed20OrTrashWithSecondFor60');
                const trashedRed = trashedHerbKinds.has('healSelfAndPartnerToFull');
                if (promptKind !== undefined) {
                  // Heal 60 is only legal when the player still holds another Green
                  // Herb in hand (the played one is already gone). Both are trashed.
                  const hasSecondHerb = played.player.hand.some(id => isGreenHerb(state, id));
                  prompts = [
                    ...prompts,
                    {
                      id: 'p' + (state.prompts.length + 1),
                      seat,
                      text: def.text,
                      options: hasSecondHerb ? ['Heal 20', 'Heal 60'] : ['Heal 20'],
                      payload: { kind: promptKind },
                    },
                  ];
                }

      const newPlayer: PlayerState = {
        ...played.player,
        hp,
        maxHp,
        weaponDamageBonusThisTurn:
          (played.player.weaponDamageBonusThisTurn ?? 0) + ((trashedGreen || trashedRed) ? claireBonus : 0),
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
      return {
        ...state,
        ...nextBase,
        seats: finalSeats,
        removed: finalRemoved,
        prompts,
        rngState: played.rngState,
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
            const extra = ammunitionCardBonus(characterAbilities(state, seat), def);
            const playerAfterBonus: PlayerState =
              extra.ammo === 0 && extra.gold === 0
                ? played.player
                : {
                    ...played.player,
                    turnAmmo: played.player.turnAmmo + extra.ammo,
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
          const player = state.seats[seat] as PlayerState;

          // Ammo comes from the cumulative ammo resource, not from cards in hand.
          // Passive abilities can reduce the cost (Leon L1 pistols, Sheva L2 rifles).
          const abilities = characterAbilities(state, seat);
          // Chris Redfield (Alliance): L1 -20 ammo when using exactly one
          // weapon; L2 -20 ammo for the weapon types he chose this turn.
          const chrisSingleDiscount = weapons.length === 1 ? singleWeaponAmmoDiscount(abilities) : 0;
          const chrisTypeDiscount = chosenWeaponTypeAmmoDiscount(abilities);
          const chrisTypeDiscountTypes = player.chrisAmmoDiscountTypes ?? [];
          const requiredAmmo = weapons.reduce((sum, weaponId) => {
            const w = cardDef(state, weaponId);
            return sum + Math.max(ammoReqForWeapon(abilities, w) - chrisSingleDiscount - (w?.weaponType !== undefined && chrisTypeDiscountTypes.includes(w.weaponType) ? chrisTypeDiscount : 0), 0);
          }, 0);
          const turnAmmoAfter = Math.max(player.turnAmmo - requiredAmmo, 0);

          const handAfter = player.hand.filter(id => !weapons.includes(id));
          // Leon L2 pistol reuse: a pistol already in the play area stays there
          // (it was not just moved from hand); only fresh weapons get added below.
          const freshWeapons = weapons.filter(id => !player.playArea.includes(id));
          // Explosive weapons are trashed after use (all-explosives rule);
          // Jill L2 sends them to her discard pile instead. Non-explosives
          // stay in the play area until end-of-turn cleanup.
          const toDiscardExplosives = explosivesGoToDiscard(abilities);
          const explosiveIds: string[] = [];
          const playedWeaponIds: string[] = [];
          for (const id of freshWeapons) {
            if (isExplosive(cardDef(state, id))) {
              explosiveIds.push(id);
            } else {
              playedWeaponIds.push(id);
            }
          }
          const playAreaAfter = [...player.playArea, ...playedWeaponIds];
          const toTrashAfterUse = weapons.filter(id => {
            const def = cardDef(state, id);
            return def?.weaponEffects?.some(e => e.kind === 'trashAfterUse');
          });
          const removedAfter = toDiscardExplosives
            ? state.removed
            : [...state.removed, ...explosiveIds, ...toTrashAfterUse];
          const discardAfterExplosives = toDiscardExplosives
            ? [...player.discard, ...explosiveIds]
            : player.discard;
          const exploresLeft = player.exploresLeft - exploreCount;
          // grantExplores weapon effect: +explores when this weapon is used.
          const grantedExplores = weapons.reduce((sum, id) => {
            const def = cardDef(state, id);
            const eff = def?.weaponEffects?.find(e => e.kind === 'grantExplores');
            return sum + (eff && eff.kind === 'grantExplores' ? eff.amount : 0);
          }, 0);

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

          const exploreWeapons = weaponDefs.map((w, i) => {
            const instId = weapons[i];
            const isGatling = w?.weaponEffects?.some(e => e.kind === 'damageEqualsCurrentAmmo');
            const isX = w?.xAmmo === true;
            const assigned = isX ? Math.min(ammoByWeapon?.[instId ?? ''] ?? 0, w?.ammoCap ?? 999) : 0;
            return {
              damage: isGatling ? player.turnAmmo : isX ? assigned : ((w?.damage ?? 0) + (player.desperateForcesTypes?.includes(w?.weaponType ?? '') ? 10 : 0) + (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerNonItemGainedThisTurn')?.amount ?? 0) * (player.gainedThisTurn ?? []).filter(id => { const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.type !== 'item'; }).length + (w?.weaponEffects?.find(e => e.kind === 'plusDamagePerCardGainedThisTurn')?.amount ?? 0) * (player.gainedThisTurn ?? []).length + ((w?.weaponEffects?.some(e => e.kind === 'plusDamageIfNightTime') && (new Date().getHours() >= 20 || new Date().getHours() <= 6)) ? (w?.weaponEffects?.find(e => e.kind === 'plusDamageIfNightTime') as {amount:number}).amount : 0)),
              ammoReq: isGatling ? 0 : isX ? assigned : Math.max(ammoReqForWeapon(abilities, w) - chrisSingleDiscount - (w?.weaponType !== undefined && chrisTypeDiscountTypes.includes(w.weaponType) ? chrisTypeDiscount : 0), 0),
              weaponEffects: (instId !== undefined && player.copiedWeaponEffects?.instanceId === instId)
                ? [...(w?.weaponEffects ?? []), ...player.copiedWeaponEffects.effects]
                : w?.weaponEffects,
              tags: w?.weaponTags,
            };
          });

          // David King (Outbreak) L2: when he uses a Knife weapon, he may also
          // use one from his discard pile.
          const davidAbilities = characterAbilities(state, seat);
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
            exploreBonusIfAmmoAbove(abilities, player.turnAmmo) +
            exploreSkillDamageBonus(activeSkillEffects(state, seat), weaponDefs);
          // AC-014 Star-Crossed Duo: if partner is leading with this attached, +10 damage.
          const starCrossedBonus = state.seats.some(s => s.seat !== seat && (s.partnerAttached ?? []).some(id => {
            const ci = state.cards[id]; const cd = ci ? state.cardDefs[ci.cardId] : undefined; return cd?.id === 'ac-014';
          })) ? 10 : 0;
          // Weapon effects like "plusDamageIfAmmoAbove" read the ammo the player
          // has available for this attack — the pool before it is spent.
          const ammoForEffects = player.turnAmmo;
          // Wesker L1: exploring grants +Gold for the turn.
          const turnGoldAfter = player.turnGold + exploreGoldBonus(abilities);

      const rev = revealTop({ deck: state.mansionDeck, bottom: state.mansionBottom });
      const revealedInstanceId = rev.revealedInstanceId;
      const revealedDef = cardDef(state, revealedInstanceId);

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
      let revealHpDelta: Record<number, number> = {};
      if (revealedDef?.id === 'ma-037') {
        state = { ...state, seats: state.seats.map(s => ({ ...s, hp: applyHpLoss(characterAbilities(state, s.seat), s.hp ?? 0, 10, s.downed || s.dead) })) };
      }
      if (revealedDef?.id === 'ma-031') {
        state = { ...state, seats: state.seats.map(s => (s.seat === seat || (s.hp ?? 0) < 50) ? s : { ...s, hp: applyHpLoss(characterAbilities(state, s.seat), s.hp ?? 0, 40, s.downed || s.dead) }) };
      }

      let mansionDeck = rev.mansion.deck;
      let mansionBottom = rev.mansion.bottom;
      let currentRng = state.rngState;
      const rngShuffle = (items: readonly string[]): string[] => {
        const r = shuffle(makeRng(currentRng), items);
        currentRng = r.rng.s;
        return r.value;
      };

      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-040') {
        // Laser Targeting Device: +1 Explore, remove card.
        const newPlayer: PlayerState = { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + 1, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          mansionBottom,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-039') {
        // Collapsing Floor Traps: reveal next 2 mansion cards; battle any infected among them; shuffle non-infected back.
        const rev2 = revealTop({ deck: mansionDeck, bottom: mansionBottom });
        const secondId = rev2.revealedInstanceId;
        const secondDef = cardDef(state, secondId);
        mansionDeck = rev2.mansion.deck;
        mansionBottom = rev2.mansion.bottom;
        // collect infected targets
        const targets = [];
        if (revealedDef && false) {}
        // Treat the two revealed cards; if either is infected, battle combined with current explore damage.
        const infectedTargets = [revealedDef, secondDef].filter(d => d?.type === 'infected');
        const exploreDmg = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + pendingSkillDamage, knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
        // resolve combined battle
        const multiResult = resolveMultiExplore({
          damage: exploreDmg,
          revealed: [revealedDef, secondDef].filter(d => d?.type === 'infected').map(d => ({
            cardId: d!.id, hp: d!.hp ?? 0, attack: d!.attack ?? 0, infectedEffects: d!.infectedEffects,
          })),
        });
        const defeatedDecorations = multiResult.defeated ? infectedTargets.reduce((s, d) => s + (d?.decorations ?? 0), 0) : 0;
        let newPlayer = { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false, decorations: player.decorations + defeatedDecorations };
        // remove event + any defeated infected from game (simplified: remove all revealed)
        const removedIds = [revealedInstanceId, secondId];
        // shuffle non-infected back to bottom
        const toShuffleBack = [revealedInstanceId, secondId].filter(id => {
          const d = cardDef(state, id);
          return d?.type !== 'infected';
        });
        if (toShuffleBack.length > 0) {
          mansionBottom = [...mansionBottom, ...toShuffleBack];
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, ...removedIds.filter(id => {
            const d = cardDef(state, id); return d?.type === 'infected' || d?.type === 'event';
          })],
          mansionDeck,
          mansionBottom,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }
      if (revealedDef?.type === 'event' && revealedDef.id === 'ma-038') {
        // Explosive Barrel: if total damage >= 80, each exploring char takes 30;
        // otherwise +30 damage collectively and +1 Explore. Then remove card.
        const evDamage = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + pendingSkillDamage, knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
        let newPlayer: PlayerState = { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + (evDamage < 80 ? 1 : 0), turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false, hp: evDamage >= 80 ? applyHpLoss(characterAbilities(state, seat), player.hp, 30, player.downed || player.dead) : player.hp };
        // +30 damage collectively handled by not removing; for simplicity add to weaponDamageBonus? skip; damage already resolved via threshold only.
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: [...removedAfter, revealedInstanceId],
          mansionDeck,
          mansionBottom,
          rngState: currentRng,
          prompts: state.prompts,
        };
      }

      // Reactive trash window: if a Las Plagas infected is revealed, eligible
      // players (Jill L2 with Flash Grenade in hand) may react.
      const isLasPlagas = revealedDef?.type === 'infected' && revealedDef?.plagas === true;
      let reactiveWindow = state.reactiveTrashWindow;
      let reactivePrompts = state.prompts;
      if (isLasPlagas) {
        const eligibleSeats = state.seats.filter(s => {
          if (s.seat === seat || s.dead) return false;
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
        if (s.seat === seat || s.dead) return false;
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
      if (revealedDef?.type !== 'infected') {
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
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft: exploresLeft + grantedExplores, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false } : s)),
          removed: removedAfter,
          mansionDeck,
          mansionBottom,
          prompts,
        };
      }

      const outcome = resolveExplore({
              weapons: exploreWeapons,
              ammo: ammoForEffects,
              bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + perActionBonus + selfHpBonus + costGateBonus + multiWeaponBonus + pendingSkillDamage,
              revealed: revealedDef,
              damageReduction: infectedDamageReduction(abilities),
              knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
              damageMultiplier: player.damageMultiplierThisTurn ?? 1,
            });

      if (outcome.kind === 'insufficientAmmo') {
        throw new Error('applyAction: explore: insufficient ammo');
      }

      // Defer explore resolution if Las Plagas revealed and eligible reactive players exist.
      const shouldDefer = revealedDef?.type === 'infected' && revealedDef?.plagas === true &&
        state.seats.some(s => {
          if (s.seat === seat || s.dead) return false;
          if (!characterAbilities(state, s.seat).some(a => a.kind === 'offTurnFlashGrenadeLasPlagas')) return false;
          return s.hand.some(id => {
            const ci = state.cards[id];
            const cd = ci ? state.cardDefs[ci.cardId] : undefined;
            return cd?.id === 'we-017';
          });
        });

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
          mansionBottom,
          rngState: currentRng,
          reactiveTrashWindow: { kind: 'jillFlashGrenade', triggeringSeat: seat, revealedInstanceId },
          pendingExplore: {
            seat,
            revealedInstanceId,
            outcome: pendingOutcome,
            decorations: pendingDecorations,
            damageTaken: pendingDamageTaken,
            newPlayer: pendingPlayer,
            mansionDeck,
            mansionBottom,
            rngState: currentRng,
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
      if (revealedDef?.type === 'infected') {
        for (const e of revealedDef.infectedEffects ?? []) {
          if (e.kind === 'onRevealInfectionIncrease') {
            const lvl = infectionBySeat.get(seat)?.length ?? 0;
            drawInfectionsFor(seat, lvl <= e.threshold ? e.lowAmount : e.highAmount);
          } else if (e.kind === 'onRevealAllInfectionIncrease') {
            for (const s of state.seats) {
              if (!s.dead) drawInfectionsFor(s.seat, e.amount);
            }
          }
        }
      }
      const withInfections = (p: PlayerState): PlayerState => ({
        ...p,
        infectionCards: infectionBySeat.get(p.seat) ?? p.infectionCards ?? [],
      });
      if (outcome.kind === 'defeated') {
        // Outbreak: on-defeat infection effects. MA-053 Lisa Trevor is not
        // attached - it goes to the bottom of the Mansion instead.
        let defeatedInfectionInc = 0;
        let defeatedToBottom = false;
        if (revealedDef?.type === 'infected') {
          for (const e of revealedDef.infectedEffects ?? []) {
            if (e.kind === 'onDefeatInfectionIncrease') {
              defeatedInfectionInc += e.amount;
              defeatedToBottom = e.toMansionBottom;
            }
          }
        }
        drawInfectionsFor(seat, defeatedInfectionInc);
        const decorations = player.decorations + (revealedDef.decorations ?? 0);
        const maximizerXp = (revealedDef.decorations ?? 0) >= 2 &&
          activeSkillEffects(state, seat).some(e => e.kind === 'xpOnDefeatHighDecoration') ? 1 : 0;
        const charDef = cardDef(state, player.characterInstanceId);
        const level = charDef !== undefined ? levelForDecorations(charDef.level1At, charDef.level2At, decorations) : player.level;
        const newPlayer: PlayerState = {
                  ...player,
                  hand: handAfter,
                  playArea: playAreaAfter,
                  discard: discardAfterExplosives,
                  exploresLeft,
                  turnAmmo: turnAmmoAfter,
                  turnGold: turnGoldAfter,
                  mustExplore: false,
                  decorations,
                  level,
                  xp: (player.xp ?? 0) + 1 + maximizerXp,
                  pendingSkillEffects: undefined,
                  attached: defeatedToBottom ? player.attached : [...player.attached, revealedInstanceId],
                  infectionCards: infectionBySeat.get(seat) ?? player.infectionCards ?? [],
                };
        const hasSkip = revealedDef?.infectedEffects?.some(e => e.kind === 'skipNextTurnOfAPlayerOnDefeat') ?? false;
        const hasNoActions = revealedDef?.infectedEffects?.some(e => e.kind === 'noActionsNextTurnOfAPlayerOnDefeat') ?? false;
        const defeatPrompts = (hasSkip || hasNoActions)
          ? [...state.prompts, {
              id: 'p' + (state.prompts.length + 1),
              seat,
              text: 'Choose a player.',
              options: state.seats.filter(s => !s.dead).map(s => String(s.seat)),
              payload: { kind: hasSkip ? 'skipNextTurn' : 'noActionsNextTurn' },
            }]
          : state.prompts;
        if (defeatedToBottom) {
          const bottomed = sendToBottom({ deck: mansionDeck, bottom: mansionBottom }, revealedInstanceId);
          mansionDeck = bottomed.deck;
          mansionBottom = bottomed.bottom;
        }
        // Luis Sera (Nightmare) L2: on defeating an Infected, may move any
        // number of cards from the discard pile to the bottom of the Inventory.
        const luisPrompts = movesDiscardToInventoryOnDefeat(characterAbilities(state, seat)) && newPlayer.discard.length > 0
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
        const carlosPrompts = hasPerfectExploreReward(characterAbilities(state, seat)) &&
          outcome.damage === outcome.hp && newPlayer.discard.length > 0
          ? [...luisPrompts, {
              id: 'p' + (luisPrompts.length + 1),
              seat,
              text: 'Take one card from your Discard Pile into your hand.',
              options: [...newPlayer.discard],
              payload: { kind: 'perfectExploreReward' },
            }]
          : luisPrompts;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (
            s.seat === seat
              ? newPlayer
              : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }
          )),
          removed: removedAfter,
          mansionDeck,
          mansionBottom,
          rngState: currentRng,
          prompts: carlosPrompts,
          ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),
        };
      }

      // outcome.kind === 'notDefeated' here (nonInfected can't reach this
      // branch: the reveal was infected; guard for the type system anyway)
      if (outcome.kind !== 'notDefeated') {
        throw new Error('applyAction: explore: unexpected non-infected reveal');
      }
      // Hunk L1: damageRedirectToPartner — when Hunk would take damage and has
      // a partner, redirect the damage to his partner instead (partner absorbs
      // it; Hunk takes none). Automatic redirect when a partner is present.
      const hasDamageRedirect = characterAbilities(state, seat).some(a => a.kind === 'damageRedirectToPartner');
      const leadingIsPartner = !!player.partnerInstanceId && player.partnerLeading === true;
      const baseLeadingHp = leadingIsPartner ? (player.partnerHp ?? player.hp) : player.hp;
      // Ada (Nightmare) L2: lethal damage sets her HP to 10 instead of 0 -
      // only when she is the one taking the damage (never a leading partner).
      const damageOnAda = !leadingIsPartner && !(hasDamageRedirect && player.partnerInstanceId);
      // Mercenaries: Toughness LV.2 (-10 all damage), Luck LV.1 (lethal hit
      // becomes 10 while at 20+ HP), Giant Killing LV.1 (40+ HP Infected deals 0).
      const damageSkillEffects = activeSkillEffects(state, seat);
      const skillReduction = skillDamageReduction(damageSkillEffects);
      const giantThreshold = skillGiantKillingThreshold(damageSkillEffects);
      const skillSuppressed = giantThreshold !== undefined && (revealedDef?.hp ?? 0) >= giantThreshold;
      const skillLethal = skillLethalReplacementAmount(damageSkillEffects);
      const rawSkillDamage = skillSuppressed ? 0 : Math.max((outcome.damageTaken ?? 0) - skillReduction, 0);
      const effectiveSkillDamage = rawSkillDamage >= baseLeadingHp && baseLeadingHp >= 20 && skillLethal !== undefined
        ? skillLethal
        : rawSkillDamage;
      const newLeadingHp = damageOnAda
        ? applyHpLoss(characterAbilities(state, seat), baseLeadingHp, effectiveSkillDamage, player.downed || player.dead)
        : baseLeadingHp;
      const newHp = leadingIsPartner ? player.hp : newLeadingHp;
      let downed = false;
      let hand: readonly string[] = handAfter;
      let discard: readonly string[] = discardAfterExplosives;
      let inventory: readonly string[] = player.inventory;

      if (newHp === 0) {
        const flipResult = flipDown(
          {
            hp: newHp,
            maxHp: player.maxHp,
            decorations: player.decorations,
            level: player.level,
            downed: false,
            dead: false,
            hand: handAfter,
            discard: discardAfterExplosives,
            inventory: player.inventory,
          },
          rngShuffle,
        );
        downed = flipResult.downed;
        hand = flipResult.hand;
        discard = flipResult.discard;
        inventory = flipResult.inventory;
      }

      // Outbreak: not-defeated effects (MA-041 Tyrant T-002, MA-046 Web Spinner).
      let outbreakShuffledBack = false;
      if (revealedDef?.type === 'infected') {
        for (const e of revealedDef.infectedEffects ?? []) {
          if (e.kind === 'onNotDefeatedInfectionIncrease') {
            drawInfectionsFor(seat, e.amount + e.perLevel * player.level);
          } else if (e.kind === 'onNotDefeatedShuffleBack') {
            const shuffled = shuffleBack({ deck: mansionDeck, bottom: mansionBottom }, revealedInstanceId, rngShuffle);
            mansionDeck = shuffled.deck;
            mansionBottom = shuffled.bottom;
            outbreakShuffledBack = true;
          }
        }
      }

      if (outcome.shuffleBack) {
        const shuffled = shuffleBack({ deck: mansionDeck, bottom: mansionBottom }, revealedInstanceId, rngShuffle);
        mansionDeck = shuffled.deck;
        mansionBottom = shuffled.bottom;
      } else if (!outbreakShuffledBack) {
        const bottomed = sendToBottom({ deck: mansionDeck, bottom: mansionBottom }, revealedInstanceId);
        mansionDeck = bottomed.deck;
        mansionBottom = bottomed.bottom;
      }

      const newPlayer: PlayerState = {
              ...player,
              hand,
              playArea: playAreaAfter,
              discard,
              inventory,
              exploresLeft,
              turnAmmo: turnAmmoAfter,
              turnGold: turnGoldAfter,
              mustExplore: false,
              hp: newHp,
              xp: (player.xp ?? 0) + 1,
              pendingSkillEffects: undefined,
              ...(leadingIsPartner ? { partnerHp: newLeadingHp } : {}),
              downed,
              infectionCards: infectionBySeat.get(seat) ?? player.infectionCards ?? [],
            };

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (
          s.seat === seat
            ? newPlayer
            : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }
        )),
        removed: removedAfter,
        mansionDeck,
        mansionBottom,
        rngState: currentRng,
        ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),
      };
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
      let cost = boughtDef?.cost ?? 0;

      // Mikhail Victor L1: weapons cost `amount` less to buy.
      const charInst = state.cards[player.characterInstanceId];
      const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
      const reductionAbility = charDef?.abilities !== undefined
        ? abilitiesForLevel(charDef.abilities, player.level).find(a => a.kind === 'weaponBuyCostReduction')
        : undefined;
      if (reductionAbility !== undefined && boughtDef?.type === 'weapon') {
        cost = Math.max(0, cost - (reductionAbility as { amount: number }).amount);
      }

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

      return s;
    }

    case 'useCharacterAbility': {
          const { seat, abilityIndex } = action;
          const player = state.seats[seat] as PlayerState;
          const charInst = state.cards[player.characterInstanceId];
          const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
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
              const amount = (characterAbilities(state, seat).find(a => a.kind === 'discardAnyForAmmo') as { amount: number } | undefined)?.amount ?? 0;
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
              const amount = (characterAbilities(state, seat).find(a => a.kind === 'gainInfectionForGold') as { amount: number } | undefined)?.amount ?? 0;
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
              const cardId = (characterAbilities(state, seat).find(a => a.kind === 'gainSpecificWeaponIntoInventory') as { cardId: string } | undefined)?.cardId ?? 'we-027';
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
              const tag = (characterAbilities(state, seat).find(a => a.kind === 'movePlayAreaWeaponToInventoryTop') as { tag: string } | undefined)?.tag ?? 'pistol';
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
              const others = state.seats.filter(s => s.seat !== seat && !s.dead);
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
            case 'forceExploreOtherPlayer': {
              // Wesker L2: choose another player; they get +1 Explore and must
              // Explore on their next turn (choice resolved via prompt).
              const others = state.seats.filter(s => s.seat !== seat && !s.dead);
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
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s => (s.seat === seat
                  ? {
                      ...player,
                      hand: player.hand.filter(id => id !== discarded),
                      discard: [...player.discard, discarded],
                      hp: Math.min(player.hp + ability.heal, player.maxHp),
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
              const lowHpOthers = state.seats.filter(s => s.seat !== seat && !s.dead && (s.hp ?? 0) <= 30);
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
          const attachCap = partnerAttachCap(characterAbilities(state, seat));
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
            if (player.hand.includes(wId)) {
              newHand = player.hand.filter(id => id !== wId);
              newDiscard = [...newDiscard, wId];
            } else if (player.playArea.includes(wId)) {
              newPlayArea = player.playArea.filter(id => id !== wId);
            }
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
          const newTarget: PlayerState = {
            ...target,
            hp: target.hp - damage,
            infectionCards: targetInfectionCards,
            ...targetFlags,
          };
          let finalPlayer: PlayerState = {
            ...player,
            hand: newHand,
            playArea: newPlayArea,
            discard: newDiscard,
            turnAmmo: turnAmmoAfter,
            exploresLeft: player.exploresLeft - 1,
            ...(healSelf > 0 ? { hp: Math.min(player.hp + healSelf, player.maxHp) } : {}),
          };
          // An Infected Character that survives deals its base Damage back.
          if (targetSurvives && target.isInfectedCharacter === true) {
            finalPlayer = { ...finalPlayer, hp: finalPlayer.hp - (targetDef?.baseDamage ?? 0) };
          }
          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => {
              if (s.seat === seat) return finalPlayer;
              if (s.seat === targetSeat) return newTarget;
              return s;
            }),
            ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckAfter } : {}),
          };
        }

    case 'endTurn': {
          const { seat } = action;
          const player = state.seats[seat] as PlayerState;

          const dh = discardHand({ hand: player.hand, discard: player.discard });
          const dh2 = discardHand({ hand: player.playArea, discard: dh.discard });

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
              hand: [],
              discard: dh2.discard,
              playArea: [],
              infectionCards: infectionCardsOut,
            };
            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? downedPlayer : s)),
              activeSeat: ctx.activeSeat,
              turnNumber: ctx.turnNumber,
              ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckOut } : {}),
            };
          }

          // "End of turn: discard Play Area (non-attached) + hand, draw 5
          // (reshuffle discard into inventory if needed)" — rulebook.
          const d = drawWithReshuffle({ deck: player.inventory, discard: dh2.discard, count: 5, rngState: state.rngState });

          const newPlayer: PlayerState = {
            ...player,
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
            activeSeat: ctx.activeSeat,
            turnNumber: ctx.turnNumber,
            rngState: d.rngState,
            ...(state.infectionDeck !== undefined ? { infectionDeck: infectionDeckOut } : {}),
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
          const newPlayer = defeated
            ? { ...pe.newPlayer, decorations: pe.decorations, attached: [...pe.newPlayer.attached, pe.revealedInstanceId] }
            : { ...pe.newPlayer, hp: applyHpLoss(characterAbilities(state, pe.seat), pe.newPlayer.hp, pe.damageTaken, pe.newPlayer.downed || pe.newPlayer.dead) };
          return {
            ...updatedState,
            ...nextBase,
            seats: updatedState.seats.map(s => (s.seat === pe.seat ? newPlayer : s)),
            removed: defeated ? [...updatedState.removed, pe.revealedInstanceId] : updatedState.removed,
            mansionDeck: pe.mansionDeck,
            mansionBottom: pe.mansionBottom,
            rngState: pe.rngState,
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
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...player, hp: player.hp - dmg, exploresLeft: player.exploresLeft + 1 }
            : s)),
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
              payload: { kind: 'injectionTrash' },
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
            payload: { kind: 'injectionDiscard', count: String(count + 1) },
          }],
        };
      }

      if (kind === 'injectionTrash') {
        if (chosenId === 'Decline') {
          return { ...state, ...nextBase, prompts: newPrompts };
        }
        const lvl = player.infectionCards?.length ?? 0;
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
              const owner = state.seats.find(s => s.seat !== seat && !s.dead && s.inventory[0] === chosenId);
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
        if (Number.isNaN(targetSeat)) {
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
        const others = gifted.seats.filter(s => s.seat !== seat && !s.dead);
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
              if (option === 0) {
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s =>
                    s.seat === seat ? { ...player, hp: Math.min(player.hp + 20, player.maxHp) } : s,
                  ),
                  prompts: newPrompts,
                };
              }
              // option === 1: Heal 60 requires a second Green Herb in hand; both
              // the played herb (already in removed) and the hand herb are trashed.
              const otherHerb = player.hand.find(id => isGreenHerb(state, id));
              if (otherHerb === undefined) {
                return {
                  ...state,
                  ...nextBase,
                  seats: state.seats.map(s =>
                    s.seat === seat ? { ...player, hp: Math.min(player.hp + 20, player.maxHp) } : s,
                  ),
                  prompts: newPrompts,
                };
              }
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s =>
                  s.seat === seat
                    ? {
                        ...player,
                        hp: Math.min(player.hp + 60, player.maxHp),
                        hand: player.hand.filter(id => id !== otherHerb),
                      }
                    : s,
                ),
                removed: [...state.removed, otherHerb],
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
                  mansionBottom: [...state.mansionBottom, instanceId],
                  prompts: newPrompts,
                };
              }
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