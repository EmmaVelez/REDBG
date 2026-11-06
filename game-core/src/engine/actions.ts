import type { GameState, Action, PlayerState, CardDef } from '../types';
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
import { makeRng, shuffle } from '../util/rng';

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
  return applyDamageTakenHooks(state, applyActionInternal(state, action));
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
            if ((def.id === 'ac-013' || def.id === 'ac-014' || def.id === 'ac-020') && player.partnerInstanceId && partnerAttached.length < 2) {
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
            }
            if (def.id === 'ac-019' && newPlayer.hand.length > 0) {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 1, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
              ac015Rng = d.rngState;
            }

      let prompts = state.prompts;
      let promptKind: string | undefined;
      let promptOptions: readonly string[] | undefined;
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
            payload: { kind: promptKind },
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

      const newPlayer: PlayerState = { ...played.player, hp, maxHp };
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
          const requiredAmmo = weapons.reduce((sum, weaponId) => {
            return sum + ammoReqForWeapon(abilities, cardDef(state, weaponId));
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
              ammoReq: isGatling ? 0 : isX ? assigned : ammoReqForWeapon(abilities, w),
              weaponEffects: w?.weaponEffects,
              tags: w?.weaponTags,
            };
          });

          // Passive damage abilities
          // Jill L1 explosives, Chris L2 per-Infected-fought (multi-explore
          // fights exploreCount Infected in one attack).
          const abilityDamage =
            passiveDamageBonus(abilities, weaponDefs, exploreCount, player.hand.length) +
            exploreBigHandBonus(abilities, state.seats) +
            exploreActionsBonus(abilities, playAreaAfter.map(id => cardDef(state, id)?.type ?? ''), t => t === 'action');
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
        const exploreDmg = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus, knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
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
        const evDamage = computeDamage({ weapons: exploreWeapons, ammo: ammoForEffects, bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus, knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat) });
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
          const charDef = cardDef(state, s.characterInstanceId);
          // Jill L2 (level 2) — check character id
          if (charDef?.id !== 'ch-016' || s.level < 2) return false;
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
              bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus + perActionBonus + selfHpBonus + costGateBonus + multiWeaponBonus,
              revealed: revealedDef,
              damageReduction: infectedDamageReduction(abilities),
              knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
            });

      if (outcome.kind === 'insufficientAmmo') {
        throw new Error('applyAction: explore: insufficient ammo');
      }

      // Defer explore resolution if Las Plagas revealed and eligible reactive players exist.
      const shouldDefer = revealedDef?.type === 'infected' && revealedDef?.plagas === true &&
        state.seats.some(s => {
          if (s.seat === seat || s.dead) return false;
          const charDef = cardDef(state, s.characterInstanceId);
          if (charDef?.id !== 'ch-016' || s.level < 2) return false;
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

      if (outcome.kind === 'defeated') {
        const decorations = player.decorations + (revealedDef.decorations ?? 0);
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
                  attached: [...player.attached, revealedInstanceId],
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
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
          removed: removedAfter,
          mansionDeck,
          mansionBottom,
          rngState: currentRng,
          prompts: luisPrompts,
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
      const newLeadingHp = damageOnAda
        ? applyHpLoss(characterAbilities(state, seat), baseLeadingHp, outcome.damageTaken, player.downed || player.dead)
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

      if (outcome.shuffleBack) {
        const shuffled = shuffleBack({ deck: mansionDeck, bottom: mansionBottom }, revealedInstanceId, rngShuffle);
        mansionDeck = shuffled.deck;
        mansionBottom = shuffled.bottom;
      } else {
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
              ...(leadingIsPartner ? { partnerHp: newLeadingHp } : {}),
              downed,
            };

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
        removed: removedAfter,
        mansionDeck,
        mansionBottom,
        rngState: currentRng,
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
      // Centralized gain: bought card moves to discard (or hand under Gathering Forces).
      s = gainCard(s, { seat, cardId: (boughtDef?.id ?? boughtInstanceId.split('#')[0]) as string, destination: 'discard', reason: 'buy' });
      // ensure instance id matches the actual bought instance rather than a new one
      // (gainCard generated a new id; revert to use the popped market instance)
      // Simpler: keep original behavior by appending boughtInstanceId directly.
      // Roll back gainCard's added instance and use the popped one:
      const gainedIds = Object.keys(s.cards).filter(k => k.startsWith((boughtDef?.id ?? '') + '#g'));
      // Remove generated instances
      const cards2 = { ...s.cards };
      for (const gid of gainedIds) delete cards2[gid];
      const seatPlayer = s.seats[seat] as PlayerState;
      const cleanedPlayer = {
        ...seatPlayer,
        hand: seatPlayer.hand.filter(id => !gainedIds.includes(id)),
        discard: seatPlayer.discard.filter(id => !gainedIds.includes(id)),
      };
      // append original bought instance
      cleanedPlayer.discard = [...cleanedPlayer.discard, boughtInstanceId];
      cards2[boughtInstanceId] = state.cards[boughtInstanceId] ?? { instanceId: boughtInstanceId, cardId: boughtDef?.id ?? '', location: { zone: 'discard', index: 0, seat } };
      s = { ...s, cards: cards2, seats: s.seats.map(p => (p.seat === seat ? cleanedPlayer : p)) };

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
          if (attached.length >= 2 && (replaceIndex === 0 || replaceIndex === 1)) {
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

    case 'endTurn': {
          const { seat } = action;
          const player = state.seats[seat] as PlayerState;

          const dh = discardHand({ hand: player.hand, discard: player.discard });
          const dh2 = discardHand({ hand: player.playArea, discard: dh.discard });

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
            };
            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? downedPlayer : s)),
              activeSeat: ctx.activeSeat,
              turnNumber: ctx.turnNumber,
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
          };

          return {
            ...state,
            ...nextBase,
            seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
            activeSeat: ctx.activeSeat,
            turnNumber: ctx.turnNumber,
            rngState: d.rngState,
          };
        }

    case 'chooseOption': {
      const { seat, promptId, option } = action;
      const prompt = state.prompts.find(p => p.id === promptId) as NonNullable<GameState['prompts'][number]>;
      const newPrompts = state.prompts.filter(p => p.id !== promptId);
      const player = state.seats[seat] as PlayerState;
      const kind = prompt.payload?.kind;
      const chosenId = prompt.options[option];

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
        const gainedId = `${target.id}#g${nextBase.version}-${seat}`;
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hand: player.hand.filter(id => id !== chosenId), discard: [...player.discard, gainedId] } : s,
          ),
          cards: {
            ...state.cards,
            [gainedId]: { instanceId: gainedId, cardId: target.id, location: { zone: 'discard', index: 0, seat } },
          },
          removed: [...state.removed, chosenId],
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
                  const grantedId = `${grantEffect.weaponCardId}#g${nextBase.version}-${seat}`;
                  return {
                    ...state,
                    ...nextBase,
                    seats: state.seats.map(s =>
                      s.seat === seat ? { ...player, discard: [...player.discard, grantedId] } : s,
                    ),
                    cards: {
                      ...state.cards,
                      [grantedId]: {
                        instanceId: grantedId,
                        cardId: grantEffect.weaponCardId,
                        location: { zone: 'discard' as const, index: 0, seat },
                      },
                    },
                    removed: [...state.removed, instanceId],
                    prompts: newPrompts,
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
              return {
                ...state,
                ...nextBase,
                seats: state.seats.map(s =>
                  s.seat === seat ? { ...player, discard: [...player.discard, gainedId] } : s,
                ),
                marketPiles: {
                  ...state.marketPiles,
                  [pileId]: { pileId, cards: pile.cards.slice(1) },
                },
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