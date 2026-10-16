import type { GameState, Action, PlayerState, CardDef } from '../types';
import { validateAction } from './validate';
import { draw, drawWithReshuffle, discardHand } from './deck';
import { revealTop, sendToBottom, shuffleBack } from './mansion';
import { resolveExplore } from './explore';
import { flipDown, levelForDecorations } from './characters';
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
            const newPlayer: PlayerState = { ...played.player, weaponDamageBonusThisTurn };

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

      return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
              prompts,
              rngState: played.rngState,
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
                        } else if (e.kind === 'plusMaxHp20') {
                          maxHp = played.player.maxHp + 20;
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

            return {
              ...state,
              ...nextBase,
              seats: state.seats.map(s => (s.seat === seat ? played.player : s)),
              rngState: played.rngState,
            };
          }

    case 'explore': {
          const { seat, weapons, exploreCount } = action;
          const player = state.seats[seat] as PlayerState;

          // Ammo comes from the cumulative ammo resource, not from cards in hand.
          const requiredAmmo = weapons.reduce((sum, weaponId) => {
            const w = cardDef(state, weaponId);
            return sum + (w?.ammoReq ?? 0);
          }, 0);
          const turnAmmoAfter = Math.max(player.turnAmmo - requiredAmmo, 0);

          const handAfter = player.hand.filter(id => !weapons.includes(id));
          const playAreaAfter = [...player.playArea, ...weapons];
          const exploresLeft = player.exploresLeft - exploreCount;

          const exploreWeapons = weapons.map(id => {
            const w = cardDef(state, id);
            return { damage: w?.damage ?? 0, ammoReq: w?.ammoReq ?? 0, weaponEffects: w?.weaponEffects };
          });
          // Weapon effects like "plusDamageIfAmmoAbove" read the ammo the player
          // has available for this attack — the pool before it is spent.
          const ammoForEffects = player.turnAmmo;

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
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: handAfter, playArea: playAreaAfter, exploresLeft, turnAmmo: turnAmmoAfter } : s)),
          mansionDeck,
          mansionBottom,
          prompts,
        };
      }

      const outcome = resolveExplore({
              weapons: exploreWeapons,
              ammo: ammoForEffects,
              bonusDamage: player.weaponDamageBonusThisTurn,
              revealed: revealedDef,
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
                  exploresLeft,
                  turnAmmo: turnAmmoAfter,
                  decorations,
                  level,
                  attached: [...player.attached, revealedInstanceId],
                };
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
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
      const newHp = Math.max(player.hp - outcome.damageTaken, 0);
      let downed = false;
      let hand: readonly string[] = handAfter;
      let discard: readonly string[] = player.discard;
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
            discard: player.discard,
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
              hp: newHp,
              downed,
            };

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
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
      const { seat } = action;
      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? { ...s } : s)),
      };
    }

    case 'endTurn': {
          const { seat } = action;
          const player = state.seats[seat] as PlayerState;

          const dh = discardHand({ hand: player.hand, discard: player.discard });
          const dh2 = discardHand({ hand: player.playArea, discard: dh.discard });
          // "End of turn: discard Play Area (non-attached) + hand, draw 5
          // (reshuffle discard into inventory if needed)" — rulebook.
          const d = drawWithReshuffle({ deck: player.inventory, discard: dh2.discard, count: 5, rngState: state.rngState });

          const ctx = advanceTurn({
            seatCount: state.seats.length,
            activeSeat: seat,
            turnNumber: state.turnNumber,
            aliveSeats: state.seats.filter(s => !s.dead).map(s => s.seat),
          });

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
                prompts,
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