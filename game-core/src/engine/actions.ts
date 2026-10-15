import type { GameState, Action, PlayerState, CardDef } from '../types';
import { validateAction } from './validate';
import { draw, discardHand } from './deck';
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

function withBonusesAndDraws(player: PlayerState, def: CardDef): PlayerState {
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

  if (pools.draws > 0 && player.inventory.length > 0) {
    const d = draw({ deck: player.inventory, discard: player.discard, reshuffledDiscard: [], count: pools.draws });
    hand = [...hand, ...d.hand];
    inventory = d.deck;
    discard = d.discard;
  }

  return {
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
      );

      let weaponDamageBonusThisTurn = played.weaponDamageBonusThisTurn;
      for (const e of def.actionEffects ?? []) {
        if (e.kind === 'allWeaponsPlusDamageThisTurn') {
          weaponDamageBonusThisTurn += e.amount;
        }
      }
      const newPlayer: PlayerState = { ...played, weaponDamageBonusThisTurn };

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
          if (played.hand.length > 0) {
            promptKind = 'moveHandCardToTopOfInventory';
            promptOptions = played.hand;
          }
          break;
        }
        if (e.kind === 'trashHandCard') {
          if (played.hand.length > 0) {
            promptKind = 'trashHandCard';
            promptOptions = played.hand;
          }
          break;
        }
        if (e.kind === 'lookAtMansionTop') {
          promptKind = 'lookAtMansionTop';
          promptOptions = ['OK'];
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
      };
    }

    case 'playItem': {
      const { seat, instanceId } = action;
      const player = state.seats[seat] as PlayerState;
      const def = cardDef(state, instanceId) as CardDef;

      const played = withBonusesAndDraws(
        { ...player, hand: player.hand.filter(id => id !== instanceId) },
        def,
      );
      const newRemoved = [...state.removed, instanceId];

      let prompts = state.prompts;
      let hp = played.hp;
      let maxHp = played.maxHp;
      let promptKind: string | undefined;
      for (const e of def.itemEffects ?? []) {
        if (e.kind === 'healToFull') {
          hp = played.maxHp;
        } else if (e.kind === 'plusMaxHp20') {
          maxHp = played.maxHp + 20;
        } else if (e.kind === 'healFixed20OrTrashWithSecondFor60') {
          promptKind = 'healGreenHerb';
        }
      }
      if (promptKind !== undefined) {
        prompts = [
          ...prompts,
          {
            id: 'p' + (state.prompts.length + 1),
            seat,
            text: def.text,
            options: ['Heal 20', 'Heal 60'],
            payload: { kind: promptKind },
          },
        ];
      }

      const newPlayer: PlayerState = { ...played, hp, maxHp };

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
        removed: newRemoved,
        prompts,
      };
    }

    case 'playAmmo': {
      const { seat, instanceId } = action;
      const player = state.seats[seat] as PlayerState;
      const def = cardDef(state, instanceId) as CardDef;

      const newPlayer = withBonusesAndDraws(
        {
          ...player,
          hand: player.hand.filter(id => id !== instanceId),
          playArea: [...player.playArea, instanceId],
        },
        def,
      );

      return {
        ...state,
        ...nextBase,
        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),
      };
    }

    case 'explore': {
      const { seat, weapons, ammoCards, exploreCount } = action;
      const player = state.seats[seat] as PlayerState;

      const handAfter = player.hand.filter(id => !weapons.includes(id) && !ammoCards.includes(id));
      const playAreaAfter = [...player.playArea, ...weapons, ...ammoCards];
      const exploresLeft = player.exploresLeft - exploreCount;

      const exploreWeapons = weapons.map(id => {
        const w = cardDef(state, id);
        return { damage: w?.damage ?? 0, ammoReq: w?.ammoReq ?? 0, weaponEffects: w?.weaponEffects };
      });
      const ammo = ammoCards.reduce((acc, id) => acc + (cardDef(state, id)?.bonuses?.ammo ?? 0), 0);

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
          seats: state.seats.map(s => (s.seat === seat ? { ...player, hand: handAfter, playArea: playAreaAfter, exploresLeft } : s)),
          mansionDeck,
          mansionBottom,
          prompts,
        };
      }

      const outcome = resolveExplore({
        weapons: exploreWeapons,
        ammo,
        bonusDamage: player.weaponDamageBonusThisTurn,
        revealed: revealedDef,
      });

      if (outcome.kind === 'insufficientAmmo') {
        throw new Error('applyAction: explore: insufficient ammo');
      }

      if (outcome.kind === 'defeated') {
        const decorations = player.decorations + (revealedDef.decorations ?? 0);
        const charDef = cardDef(state, player.characterInstanceId);
        const level = charDef?.level2At !== undefined ? levelForDecorations(charDef.level2At, decorations) : player.level;
        const newPlayer: PlayerState = {
          ...player,
          hand: handAfter,
          playArea: playAreaAfter,
          exploresLeft,
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
      const d = draw({ deck: player.inventory, discard: dh2.discard, reshuffledDiscard: [], count: 5 });

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
        const otherHerb = player.hand.find(id => cardDef(state, id)?.type === 'item' && cardDef(state, id)?.id === 'it-1');
        let newHand = player.hand;
        let newRemoved = state.removed;
        if (otherHerb !== undefined) {
          newHand = player.hand.filter(id => id !== otherHerb);
          newRemoved = [...state.removed, otherHerb];
        }
        return {
          ...state,
          ...nextBase,
          seats: state.seats.map(s =>
            s.seat === seat ? { ...player, hp: Math.min(player.hp + 60, player.maxHp), hand: newHand } : s,
          ),
          removed: newRemoved,
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