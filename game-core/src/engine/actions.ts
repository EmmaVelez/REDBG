import type { GameState, Action, PlayerState, CardDef } from '../types';
import { validateAction } from './validate';
import { draw, drawWithReshuffle, discardHand } from './deck';
import { revealTop, sendToBottom, shuffleBack } from './mansion';
import { resolveExplore } from './explore';
import { flipDown, levelForDecorations } from './characters';
import {
  characterAbilities,
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

export function applyAction(state: GameState, action: Action): GameState {
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
            // AC-013 Partners / AC-014 Star-Crossed Duo: attach this card to the partner (if any) on play.
            let partnerAttached = played.player.partnerAttached ?? [];
            if ((def.id === 'ac-013' || def.id === 'ac-014') && player.partnerInstanceId && partnerAttached.length < 2) {
              partnerAttached = [...partnerAttached, instanceId];
            }
            let newPlayer: PlayerState = { ...played.player, partnerAttached, weaponDamageBonusThisTurn, turnGold: played.player.turnGold + actionBonus(characterAbilities(state, seat), def) + trashEffectBonus(characterAbilities(state, seat), def) };
            let ac015Rng = played.rngState;
            if (def.id === 'ac-015' && !player.partnerInstanceId) {
              const d = drawWithReshuffle({ deck: newPlayer.inventory, discard: newPlayer.discard, count: 2, rngState: ac015Rng });
              newPlayer = { ...newPlayer, hand: [...newPlayer.hand, ...d.hand], inventory: d.deck, discard: d.discard };
              ac015Rng = d.rngState;
            }
            if (def.id === 'ac-019' && newPlayer.hand.length > 0) {
              // draw 1 immediately; trash choice handled via trashHandCard prompt
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
      // AC-019 Quirck of Fate: trash a card from hand (then draw 1 already done).
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

      return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => applyArchrival(s.seat === seat ? newPlayer : s)),
              prompts: finalPrompts,
              rngState: ac015Rng,
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
                for (const e of def.itemEffects ?? []) {
                        if (e.kind === 'healToFull') {
                          hp = played.player.maxHp;
                        } else if (e.kind === 'plusMaxHp') {
                          maxHp = played.player.maxHp + e.amount;
                        } else if (e.kind === 'healFixed20OrTrashWithSecondFor60') {
                          promptKind = 'healGreenHerb';
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

            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
              removed: newRemoved,
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
          const { seat, weapons, exploreCount } = action;
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
          const removedAfter = toDiscardExplosives
            ? state.removed
            : [...state.removed, ...explosiveIds];
          const discardAfterExplosives = toDiscardExplosives
            ? [...player.discard, ...explosiveIds]
            : player.discard;
          const exploresLeft = player.exploresLeft - exploreCount;

          const weaponDefs = weapons.map(id => cardDef(state, id));
          const exploreWeapons = weaponDefs.map(w => ({
            damage: w?.damage ?? 0,
            ammoReq: ammoReqForWeapon(abilities, w),
            weaponEffects: w?.weaponEffects,
            tags: w?.weaponTags,
          }));
          // Passive damage abilities: Barry L2 magnums, Krauser L2 knives,
          // Jill L1 explosives, Chris L2 per-Infected-fought (multi-explore
          // fights exploreCount Infected in one attack).
          const abilityDamage =
            passiveDamageBonus(abilities, weaponDefs, exploreCount) +
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

      let mansionDeck = rev.mansion.deck;
      let mansionBottom = rev.mansion.bottom;
      let currentRng = state.rngState;
      const rngShuffle = (items: readonly string[]): string[] => {
        const r = shuffle(makeRng(currentRng), items);
        currentRng = r.rng.s;
        return r.value;
      };

      if (revealedDef?.type !== 'infected') {
        const prompts = [
          ...state.prompts,
          {
            id: 'p' + (state.prompts.length + 1),
            seat,
            text: revealedDef?.text ?? '',
            options: ['Take', 'Send to bottom of Mansion'],
            payload: { kind: 'takeOrBottom', instanceId: revealedInstanceId },
          },
        ];
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: handAfter, playArea: playAreaAfter, discard: discardAfterExplosives, exploresLeft, turnAmmo: turnAmmoAfter, turnGold: turnGoldAfter, mustExplore: false } : s)),
          removed: removedAfter,
          mansionDeck,
          mansionBottom,
          prompts,
        };
      }

      const outcome = resolveExplore({
              weapons: exploreWeapons,
              ammo: ammoForEffects,
              bonusDamage: player.weaponDamageBonusThisTurn + abilityDamage + starCrossedBonus,
              revealed: revealedDef,
              damageReduction: infectedDamageReduction(abilities),
              knifeUsesEarlierThisTurn: knifeWeaponsUsedThisTurn(state, seat),
            });

      if (outcome.kind === 'insufficientAmmo') {
        throw new Error('applyAction: explore: insufficient ammo');
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

      // outcome.kind === 'notDefeated' here (nonInfected can't reach this
      // branch: the reveal was infected; guard for the type system anyway)
      if (outcome.kind !== 'notDefeated') {
        throw new Error('applyAction: explore: unexpected non-infected reveal');
      }
      // Hunk L1: damageRedirectToPartner — when Hunk would take damage and has
      // a partner, redirect the damage to his partner instead (partner absorbs
      // it; Hunk takes none). Automatic redirect when a partner is present.
      const hasDamageRedirect = characterAbilities(state, seat).some(a => a.kind === 'damageRedirectToPartner');
      const newHp = (hasDamageRedirect && player.partnerInstanceId)
        ? player.hp
        : Math.max(player.hp - outcome.damageTaken, 0);
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
      const cost = cardDef(state, boughtInstanceId)?.cost ?? 0;

      const newPlayer: PlayerState = {
        ...player,
        turnGold: player.turnGold - cost,
        buysLeft: player.buysLeft - 1,
        discard: [...player.discard, boughtInstanceId],
      };
      const marketPiles = { ...state.marketPiles, [pileId]: { pileId, cards: pile.cards.slice(1) } };

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
        marketPiles,
      };
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

      if (kind === 'recoverWeaponFromDiscardToHand' && chosenId !== undefined) {
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
            s.seat === seat ? { ...player, hand: [...player.hand.filter(id => id !== chosenId), gainedId] } : s,
          ),
          cards: {
            ...state.cards,
            [gainedId]: { instanceId: gainedId, cardId: target.id, location: { zone: 'hand', index: 0, seat } },
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