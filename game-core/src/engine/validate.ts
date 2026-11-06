import type { GameState, Action, CardDef, ValidationResult, CharacterAbility } from '../types';
import { requiredAmmoForWeapons, characterAbilities } from './abilities';
import { canReuseWeapon, explorableWeapons } from './weaponReuse';

/** True when the seat's character has the given ability kind (level-gated). */
function hasAbilityKind(state: GameState, seat: number, kind: CharacterAbility['kind']): boolean {
  return characterAbilities(state, seat).some(a => a.kind === kind);
}

/** Chris L1 restriction flag. */
function hasNoHealingAbility(state: GameState, seat: number): boolean {
  return hasAbilityKind(state, seat, 'noHealingNoNonInfectedAttach');
}

/**
 * True when at least one LEGAL explore exists for this player right now:
 * explores remain, and some usable weapon (hand OR reusable play-area) is
 * affordable from the turn ammo pool. Used so Wesker's forced-Explore
 * obligation can never deadlock the target (weaponless OR weapon-but-no-ammo
 * players may endTurn, which clears the flag). A weapon that cannot be paid
 * for is not an explore option.
 */
function canExploreLegally(
  state: GameState,
  seat: number,
  player: { readonly hand: readonly string[]; readonly exploresLeft: number; readonly turnAmmo: number },
): boolean {
  if (player.exploresLeft < 1) return false;
  return explorableWeapons(state, seat).some(id => {
    const def = cardDef(state, id);
    if (def === undefined || def.type !== 'weapon') return false;
    const req = requiredAmmoForWeapons(state, seat, [id], wid => cardDef(state, wid));
    return req <= player.turnAmmo;
  });
}

function cardDef(state: GameState, instanceId: string): CardDef | undefined {
  const inst = state.cards[instanceId];
  if (inst === undefined || inst.cardId === undefined) {
    return undefined;
  }
  return state.cardDefs[inst.cardId];
}

export function validateAction(state: GameState, action: Action): ValidationResult {
  const player = 'seat' in action ? state.seats[action.seat] : undefined;

  // Prompt-gating: while any prompt awaits this seat, only chooseOption (for
  // that prompt) is legal. Choice effects must resolve before further cards
  // can be played (user rule: "resolve before another card").
  if (action.type !== 'startGame' && action.type !== 'chooseOption') {
    if ('seat' in action && state.prompts.some(p => p.seat === action.seat)) {
      return { ok: false, reason: `${action.type}: resolve pending prompt first` };
    }
  }

  switch (action.type) {
    case 'startGame':
      if (state.phase !== 'setup') {
        return { ok: false, reason: 'startGame: not in setup phase' };
      }
      if (action.setup.players.length < 1 || action.setup.players.length > 5) {
        return { ok: false, reason: 'startGame: bad player count' };
      }
      return { ok: true };

    case 'playActionCard':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'playActionCard: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `playActionCard: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'playActionCard: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'playActionCard: not your turn' };
      }
      if (player.actionsLeft < 1) {
        return { ok: false, reason: 'playActionCard: no actions left' };
      }
      if (!player.hand.includes(action.instanceId)) {
        return { ok: false, reason: `playActionCard: card not in hand: ${action.instanceId}` };
      }
      const actionCardDef = cardDef(state, action.instanceId);
      if (actionCardDef === undefined) {
        return { ok: false, reason: `playActionCard: unknown card: ${action.instanceId}` };
      }
      if (actionCardDef.type !== 'action') {
        return { ok: false, reason: `playActionCard: not an action card: ${action.instanceId}` };
      }
      return { ok: true };

    case 'playItem':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'playItem: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `playItem: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'playItem: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'playItem: not your turn' };
      }
      if (!player.hand.includes(action.instanceId)) {
        return { ok: false, reason: `playItem: card not in hand: ${action.instanceId}` };
      }
      // Chris L1: cannot be healed — healing items are not playable by him.
      {
        const itemDef = cardDef(state, action.instanceId);
        const heals = (itemDef?.itemEffects ?? []).some(
          e => e.kind === 'healToFull' || e.kind === 'healFixed20OrTrashWithSecondFor60'
        );
        if (heals && hasNoHealingAbility(state, action.seat)) {
          return { ok: false, reason: 'playItem: Chris cannot be healed' };
        }
      }
      const itemCardDef = cardDef(state, action.instanceId);
      if (itemCardDef === undefined) {
        return { ok: false, reason: `playItem: unknown card: ${action.instanceId}` };
      }
      if (itemCardDef.type !== 'item') {
        return { ok: false, reason: `playItem: not an item card: ${action.instanceId}` };
      }
      return { ok: true };

    case 'playAmmo':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'playAmmo: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `playAmmo: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'playAmmo: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'playAmmo: not your turn' };
      }
      if (!player.hand.includes(action.instanceId)) {
        return { ok: false, reason: `playAmmo: card not in hand: ${action.instanceId}` };
      }
      const ammoCardDef = cardDef(state, action.instanceId);
      if (ammoCardDef === undefined) {
        return { ok: false, reason: `playAmmo: unknown card: ${action.instanceId}` };
      }
      if (ammoCardDef.type !== 'ammunition') {
        return { ok: false, reason: `playAmmo: not an ammo card: ${action.instanceId}` };
      }
      return { ok: true };

    case 'playWeapon':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'playWeapon: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `playWeapon: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'playWeapon: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'playWeapon: not your turn' };
      }
      if (!player.hand.includes(action.instanceId)) {
        return { ok: false, reason: `playWeapon: card not in hand: ${action.instanceId}` };
      }
      const weaponCardDef = cardDef(state, action.instanceId);
      if (weaponCardDef === undefined) {
        return { ok: false, reason: `playWeapon: unknown card: ${action.instanceId}` };
      }
      if (weaponCardDef.type !== 'weapon') {
        return { ok: false, reason: `playWeapon: not a weapon card: ${action.instanceId}` };
      }
      return { ok: true };

    case 'explore':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'explore: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `explore: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'explore: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'explore: not your turn' };
      }
      if (player.exploresLeft < 1) {
        return { ok: false, reason: 'explore: no explores left' };
      }
      if (action.weapons.length === 0) {
        return { ok: false, reason: 'explore: no weapons' };
      }
      // singleWeaponLimiter: cannot use >1 weapon in one explore.
      if (action.weapons.length > 1 && characterAbilities(state, action.seat).some(a => a.kind === 'singleWeaponLimiter')) {
        return { ok: false, reason: 'explore: single weapon limiter' };
      }
      const weaponSet = new Set(action.weapons);
      if (weaponSet.size !== action.weapons.length) {
        return { ok: false, reason: `explore: duplicate weapon: ${action.weapons.find((id, index) => action.weapons.indexOf(id) !== index)}` };
      }
      for (const weaponId of action.weapons) {
              // Weapon-reuse abilities (Leon L2 pistolsTwicePerTurn): a weapon
              // already in the play area may be used again this turn. Shared
              // rule — see engine/weaponReuse.ts.
              if (!player.hand.includes(weaponId) && !canReuseWeapon(state, action.seat, weaponId)) {
                return { ok: false, reason: `explore: weapon not in hand: ${weaponId}` };
              }
              const weaponCardDef = cardDef(state, weaponId);
              if (weaponCardDef === undefined) {
                return { ok: false, reason: `explore: unknown weapon: ${weaponId}` };
              }
              if (weaponCardDef.type !== 'weapon') {
                return { ok: false, reason: `explore: not a weapon: ${weaponId}` };
              }
            }
            // Ability-aware ammo cost (Leon L1 pistols -10, Sheva L2 rifles -20).
            const requiredAmmo = requiredAmmoForWeapons(state, action.seat, action.weapons, id => cardDef(state, id));
            if (player.turnAmmo < requiredAmmo) {
              return { ok: false, reason: 'explore: insufficient ammo' };
            }
            return { ok: true };

    case 'buy':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'buy: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `buy: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'buy: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'buy: not your turn' };
      }
      if (player.buysLeft < 1) {
        return { ok: false, reason: 'buy: no buys left' };
      }
      const pile = state.marketPiles[action.pileId];
      if (pile === undefined) {
        return { ok: false, reason: `buy: unknown pile: ${action.pileId}` };
      }
      if (pile.cards.length === 0) {
        return { ok: false, reason: `buy: empty pile: ${action.pileId}` };
      }
      const topCardId = pile.cards[0];
            if (topCardId === undefined) {
              return { ok: false, reason: `buy: empty pile: ${action.pileId}` };
            }
            const topCardDef = cardDef(state, topCardId);
      if (topCardDef === undefined) {
        return { ok: false, reason: `buy: unknown card: ${topCardId}` };
      }
      if (topCardDef.cost === undefined) {
        return { ok: false, reason: `buy: not for sale: ${topCardId}` };
      }
      if (player.turnGold < topCardDef.cost) {
        return { ok: false, reason: 'buy: insufficient gold' };
      }
      return { ok: true };

    case 'useCharacterAbility':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'useCharacterAbility: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `useCharacterAbility: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'useCharacterAbility: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'useCharacterAbility: not your turn' };
      }
      const charInst = state.cards[player.characterInstanceId];
            const charDef = charInst ? state.cardDefs[charInst.cardId] : undefined;
            if (charDef === undefined || charDef.abilities === undefined) {
              return { ok: false, reason: `useCharacterAbility: unknown character: ${player.characterInstanceId}` };
            }
            if (action.abilityIndex < 0 || action.abilityIndex >= charDef.abilities.length) {
              return { ok: false, reason: `useCharacterAbility: bad ability index: ${action.abilityIndex}` };
            }
            const ability = charDef.abilities[action.abilityIndex];
            if (ability === undefined) {
              return { ok: false, reason: `useCharacterAbility: bad ability index: ${action.abilityIndex}` };
            }
            // Abilities must be unlocked at the character's current level.
                  if (ability.level > player.level) {
                    return { ok: false, reason: 'useCharacterAbility: ability not unlocked' };
                  }
      switch (ability.kind) {
        case 'plusDamageThisTurn':
        case 'exchangeHandWithInventoryTop':
        case 'revealMansionTopNoEffect':
        case 'trashFromHandAtWill':
        case 'forceExploreOtherPlayer':
        case 'giveOneCardToPlayerThenMaybeAnother':
        case 'revealHandForDamageIfTwoTypes':
        case 'choosePlayerToDiscardOneCardDuringTurn':
        case 'discardCardToInventoryBottom':
        case 'inventoryBottomToTop':
        case 'gainAmmoX10ForGold':
        case 'discardToHandIfTenPlus':
        case 'discardCardForHealAndDamage': {
          // Manual triggers are once per turn. Barry's bonus stacks (unlimited
          // would break the game); Sheva's exchange could ping-pong the same
          // two cards and Ada's peek is repeatable-identical — both would
          // stall a greedy bot. Rebecca still trashes any number of cards via
          // the DONE chain within her one activation. Scan the log back to
          // this seat's last endTurn for a prior use of the same ability.
          for (let i = state.log.length - 1; i >= 0; i--) {
            const logged = state.log[i]?.action;
            if (logged === undefined) continue;
            if (logged.type === 'endTurn' && logged.seat === action.seat) break;
            if (
              logged.type === 'useCharacterAbility' &&
              logged.seat === action.seat &&
              logged.abilityIndex === action.abilityIndex
            ) {
              return { ok: false, reason: 'useCharacterAbility: already used this turn' };
            }
          }
          if (ability.kind === 'exchangeHandWithInventoryTop') {
            if (player.hand.length === 0 || player.inventory.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: needs a card in hand and Inventory' };
            }
          }
          if (ability.kind === 'revealMansionTopNoEffect' && state.mansionDeck.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: Mansion is empty' };
          }
          if (ability.kind === 'trashFromHandAtWill' && player.hand.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: hand is empty' };
          }
          if (ability.kind === 'forceExploreOtherPlayer') {
            const others = state.seats.filter(s => s.seat !== action.seat && !s.dead);
            if (others.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: no other players' };
            }
          }
          if (ability.kind === 'discardCardForHealAndDamage') {
            if (!player.hand.some(id => cardDef(state, id)?.id === ability.cardId)) {
              return { ok: false, reason: 'useCharacterAbility: the required card is not in hand' };
            }
          }
          if (ability.kind === 'gainAmmoX10ForGold') {
            const available = Object.values(state.marketPiles).some(pile => {
              const top = pile.cards[0];
              return top !== undefined && cardDef(state, top)?.id === 'am-001';
            });
            if (!available) {
              return { ok: false, reason: 'useCharacterAbility: no Ammo x10 in the market' };
            }
          }
          if (ability.kind === 'discardToHandIfTenPlus' && player.discard.length < ability.threshold) {
            return { ok: false, reason: 'useCharacterAbility: not enough cards in discard' };
          }
          if (ability.kind === 'discardCardToInventoryBottom' && player.discard.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: discard is empty' };
          }
          if (ability.kind === 'inventoryBottomToTop' && player.inventory.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: inventory is empty' };
          }
          if (ability.kind === 'choosePlayerToDiscardOneCardDuringTurn') {
            // Nightmare Wesker L2: needs EXACTLY one other living player at
            // 30 or less HP (the L1 condition), and that player must have a
            // card to discard.
            const lowHpOthers = state.seats.filter(s => s.seat !== action.seat && !s.dead && (s.hp ?? 0) <= 30);
            const target = lowHpOthers.length === 1 ? lowHpOthers[0] : undefined;
            if (target === undefined || target.hand.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: needs exactly one other player with 30 or less HP and a card in hand' };
            }
          }
          return { ok: true };
        }
        case 'exchangeBuyForAction':
          // Ada L2: repeatable — each exchange consumes one Buy.
          if (player.buysLeft < 1) {
            return { ok: false, reason: 'useCharacterAbility: no Buy left to exchange' };
          }
          return { ok: true };
        default:
          // Passive abilities are not manually triggerable — reject so the
          // client never renders a no-op button and bots never waste a slot.
          return { ok: false, reason: 'useCharacterAbility: passive ability' };
      }

    case 'attachToPartner':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'attachToPartner: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `attachToPartner: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'attachToPartner: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'attachToPartner: not your turn' };
      }
      if (player.actionsLeft < 1) {
        return { ok: false, reason: 'attachToPartner: no actions left' };
      }
      if (!player.hand.includes(action.instanceId)) {
        return { ok: false, reason: `attachToPartner: card not in hand: ${action.instanceId}` };
      }
      if (!player.partnerInstanceId) {
        return { ok: false, reason: 'attachToPartner: no partner' };
      }
      const attachDef = cardDef(state, action.instanceId);
      if (attachDef === undefined || (attachDef.type !== 'weapon' && attachDef.type !== 'action')) {
        return { ok: false, reason: 'attachToPartner: not eligible card' };
      }
      // Chris L1: cannot attach non-Infected cards. Attachable cards here are
      // weapons/actions, so Chris cannot attach any of them.
      if (hasNoHealingAbility(state, action.seat)) {
        return { ok: false, reason: 'attachToPartner: Chris cannot attach non-Infected cards' };
      }
      const attached = player.partnerAttached ?? [];
      if (attached.length >= 2) {
        if (action.replaceIndex !== 0 && action.replaceIndex !== 1) {
          return { ok: false, reason: 'attachToPartner: replaceIndex required when partner full' };
        }
      } else {
        if (action.replaceIndex !== undefined) {
          return { ok: false, reason: 'attachToPartner: replaceIndex not allowed when under limit' };
        }
      }
      return { ok: true };

    case 'chooseExploreLeader':
      if (state.phase !== 'main') {
      }
      if (player === undefined) {
        return { ok: false, reason: `chooseExploreLeader: unknown seat: ${action.seat}` };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'chooseExploreLeader: not your turn' };
      }
      if (!player.partnerInstanceId) {
        return { ok: false, reason: 'chooseExploreLeader: no partner' };
      }
      if (action.leader !== 'main' && action.leader !== 'partner') {
        return { ok: false, reason: 'chooseExploreLeader: bad leader' };
      }
      return { ok: true };

    case 'endTurn':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'endTurn: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `endTurn: unknown seat: ${action.seat}` };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'endTurn: not your turn' };
      }
      if (player.mustExplore === true && canExploreLegally(state, action.seat, player)) {
        return { ok: false, reason: 'endTurn: must Explore first (Wesker ability)' };
      }
      return { ok: true };

    case 'chooseOption':
      const prompt = state.prompts.find(p => p.id === action.promptId);
      if (prompt === undefined) {
        return { ok: false, reason: `chooseOption: unknown prompt: ${action.promptId}` };
      }
      if (prompt.seat !== action.seat) {
        return { ok: false, reason: 'chooseOption: not your prompt' };
      }
      if (action.option < 0 || action.option >= prompt.options.length) {
        return { ok: false, reason: `chooseOption: bad option: ${action.option}` };
      }
      return { ok: true };

    default:
      return { ok: false, reason: 'unknown action type' };
  }
}
