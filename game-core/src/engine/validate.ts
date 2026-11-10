import type { GameState, Action, CardDef, ValidationResult, CharacterAbility } from '../types';
import { seatAbilities, weaponCostCap, partnerAttachCap, leaderAbilities, characterSource } from './abilities';
import { requiredAmmoForExplore } from './ammo';
import { canReuseWeapon, isPartnerWeapon, remainingWeaponUses, canUseWeaponTimes } from './weaponReuse';
import { isSkillActive } from './skill';
import { deckCount } from './mansion';
import { grantedExploresFor } from './explore';

/** True when the seat has the given ability kind (level-gated, Main or Partner). */
function hasAbilityKind(state: GameState, seat: number, kind: CharacterAbility['kind']): boolean {
  return seatAbilities(state, seat).some(a => a.kind === kind);
}

/** Chris L1 restriction flag. */
function hasNoHealingAbility(state: GameState, seat: number): boolean {
  return hasAbilityKind(state, seat, 'noHealingNoNonInfectedAttach');
}

/**
 * True when the NAMED character has Chris's "cannot be healed" restriction at
 * its current level. Healing an item at a Partner is legal even when the Main
 * character is Chris — the restriction belongs to one character, not the seat.
 */
function characterCannotBeHealed(state: GameState, seat: number, character: 'main' | 'partner'): boolean {
  const source = characterSource(state, seat, character);
  if (source === undefined) return false;
  return (source.def.abilities ?? []).some(
    a => a.kind === 'noHealingNoNonInfectedAttach' && a.level <= source.level,
  );
}

/**
 * True when at least one LEGAL explore exists for this player right now.
 * A player may always Explore unarmed: the rulebook lets them declare zero
 * Weapons ("plays all of their Weapons they will be using"), so lacking a
 * weapon or Ammo never makes an explore impossible. The only things that do
 * are having no Explores left, an empty Mansion, or a leader who cannot use
 * Weapons at all (FCH-008 Sherry). Used so Wesker's forced-Explore obligation
 * can never deadlock the target: endTurn stays blocked until they explore.
 */
function canExploreLegally(state: GameState, seat: number): boolean {
  const player = state.seats[seat];
  if (player === undefined) return false;
  if (player.downed || player.dead) return false;
  if (player.exploresLeft < 1) return false;
  if (deckCount({ deck: state.mansionDeck, bottom: state.mansionBottom }) < 1) return false;
  const leaders: readonly ('main' | 'partner')[] =
    player.partnerInstanceId !== undefined ? ['main', 'partner'] : ['main'];
  return leaders.some(
    leader => !leaderAbilities(state, seat, leader).some(a => a.kind === 'cannotUseWeapons'),
  );
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

  // Outbreak: "A face down Character is considered to be out of the game."
  // A downed Character cannot start actions; its turn is consumed by the
  // revive in startTurn, and this guard also covers a Character downed
  // mid-turn by its own action (the hand is gone, so there is nothing to do
  // but end the turn). chooseOption stays legal so pending prompts resolve.
  if (
    action.type !== 'startGame' &&
    action.type !== 'chooseOption' &&
    action.type !== 'endTurn' &&
    player !== undefined &&
    player.downed
  ) {
    return { ok: false, reason: `${action.type}: player is downed` };
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
      // WE-048 Hunting Bow: while it is in the Play Area, the player cannot
      // play Actions.
      const bowInPlayArea = player.playArea.some(id => {
        const d = cardDef(state, id);
        return d?.type === 'weapon' && (d.weaponEffects ?? []).some(e => e.kind === 'cannotPlayActionsWhileInPlayArea');
      });
      if (bowInPlayArea) {
        return { ok: false, reason: 'playActionCard: Hunting Bow prevents playing Actions' };
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
      // Chris L1: a character that cannot be healed cannot be the TARGET of a
      // healing item. Healing your Partner is still legal when the Main
      // character is Chris (and vice versa).
      {
        const itemDef = cardDef(state, action.instanceId);
        const heals = (itemDef?.itemEffects ?? []).some(
          e => e.kind === 'healToFull' || e.kind === 'healFixed20OrTrashWithSecondFor60'
        );
        if (heals) {
          const target = action.healTarget ?? 'main';
          if (target === 'partner' && !player.partnerInstanceId) {
            return { ok: false, reason: 'playItem: no partner to heal' };
          }
          if (characterCannotBeHealed(state, action.seat, target)) {
            return { ok: false, reason: 'playItem: that character cannot be healed' };
          }
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
      // Multi-explore (rulebook "Extra Explore"): the player chooses how many
      // Explores this action spends. exploreCount is the number of Mansion cards
      // revealed and battled as ONE combined engagement, so it is bounded by the
      // Mansion size and by the Explores the player can put into it: the ones
      // they still hold PLUS the ones the selected weapons grant this turn
      // (a Pump-Action Shotgun's "+1 Explore" can be spent in the same action,
      // revealing two cards at once, or saved for a later explore).
      if (!Number.isInteger(action.exploreCount) || action.exploreCount < 1) {
        return { ok: false, reason: 'explore: bad explore count' };
      }
      const grantedExplores = grantedExploresFor(action.weapons.map(id => cardDef(state, id)));
      if (action.exploreCount > player.exploresLeft + grantedExplores) {
        return { ok: false, reason: 'explore: not enough explores' };
      }
      if (action.exploreCount > deckCount({ deck: state.mansionDeck, bottom: state.mansionBottom })) {
        return { ok: false, reason: 'explore: mansion too small' };
      }
      if (action.leader === 'partner' && player.partnerInstanceId === undefined) {
        return { ok: false, reason: 'explore: no partner' };
      }
      // The leading character is the one fighting, so its abilities gate the
      // explore — a partner-led explore uses the Partner's abilities (level
      // derived from the Main character's Decorations), not the Main's.
      const leader: 'main' | 'partner' = action.leader === 'partner' ? 'partner' : 'main';
      const leaderAbils = leaderAbilities(state, action.seat, leader);
      // An unarmed explore is legal: the player simply declares zero Weapons.
      // FCH-008 Sherry Birkin: she cannot use Weapons at all.
      if (leaderAbils.some(a => a.kind === 'cannotUseWeapons')) {
        return { ok: false, reason: 'explore: cannot use weapons' };
      }
      // singleWeaponLimiter: cannot use >1 weapon in one explore.
      if (action.weapons.length > 1 && leaderAbils.some(a => a.kind === 'singleWeaponLimiter')) {
        return { ok: false, reason: 'explore: single weapon limiter' };
      }
      // weaponCostCap (Josh L1): cannot use weapons costing maxCost or more.
      const costCap = weaponCostCap(leaderAbils);
      if (costCap !== undefined && action.weapons.some(id => (cardDef(state, id)?.cost ?? 0) >= costCap)) {
        return { ok: false, reason: 'explore: weapon cost cap' };
      }
      // One entry in `weapons` is one USE. A weapon may appear more than once
      // only while a reuse ability leaves uses available (Leon L2 pistols:
      // "pay its ammo requirement twice for that weapon to apply its effect
      // and damage twice"). Anything beyond the per-turn cap is rejected.
      for (const weaponId of action.weapons) {
        const uses = action.weapons.filter(id => id === weaponId).length;
        if (!canUseWeaponTimes(state, action.seat, weaponId, uses)) {
          return { ok: false, reason: `explore: weapon already used: ${weaponId}` };
        }
      }
      for (const weaponId of action.weapons) {
              // Weapon-reuse abilities (Leon L2 pistolsTwicePerTurn): a weapon
              // already in the play area may be used again this turn. Shared
              // rule — see engine/weaponReuse.ts. Alliance Partner
              // Modification: a weapon attached to the Partner may also be
              // used (it stays attached; it is not moved or trashed).
              if (!player.hand.includes(weaponId) && !canReuseWeapon(state, action.seat, weaponId) && !isPartnerWeapon(state, action.seat, weaponId)) {
                return { ok: false, reason: `explore: weapon not in hand: ${weaponId}` };
              }
              // A Partner's attached weapon stays attached, so the normal
              // "left hand -> play area" once-per-turn limit would not apply;
              // enforce it explicitly (reuse abilities still extend it).
              if (isPartnerWeapon(state, action.seat, weaponId) && remainingWeaponUses(state, action.seat, weaponId) < 1) {
                return { ok: false, reason: `explore: weapon already used: ${weaponId}` };
              }
              const weaponCardDef = cardDef(state, weaponId);
              if (weaponCardDef === undefined) {
                return { ok: false, reason: `explore: unknown weapon: ${weaponId}` };
              }
              if (weaponCardDef.type !== 'weapon') {
                return { ok: false, reason: `explore: not a weapon: ${weaponId}` };
              }
            }
            // Ability-aware ammo cost (Leon L1 pistols -10, Sheva L2 rifles -20,
            // Skill discounts, Claire/Jill Mercenaries modifiers).
            const requiredAmmo = requiredAmmoForExplore(state, action.seat, action.weapons, leaderAbils);
            if (player.turnAmmo < requiredAmmo) {
              return { ok: false, reason: 'explore: insufficient ammo' };
            }
            // WE-025 Blowback Pistol: the discarded cards must be Pistol weapons
            // in hand, and at least one used weapon must carry the effect.
            const blowbackArmed = action.weapons.some(id =>
              cardDef(state, id)?.weaponEffects?.some(e => e.kind === 'discardPistolsForDamage') === true);
            for (const pid of action.discardedPistols ?? []) {
              if (!player.hand.includes(pid)) {
                return { ok: false, reason: `explore: discarded Pistol not in hand: ${pid}` };
              }
              const pdef = cardDef(state, pid);
              if (pdef?.type !== 'weapon' || !(pdef.weaponTags ?? []).includes('pistol')) {
                return { ok: false, reason: `explore: not a Pistol card: ${pid}` };
              }
              if (action.weapons.includes(pid)) {
                return { ok: false, reason: `explore: cannot discard a weapon being used: ${pid}` };
              }
            }
            if (!blowbackArmed && (action.discardedPistols ?? []).length > 0) {
              return { ok: false, reason: 'explore: no Blowback Pistol in use' };
            }
            return { ok: true };

    case 'attack':
      if (state.phase !== 'main') {
        return { ok: false, reason: 'attack: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `attack: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'attack: player is dead' };
      }
      // Outbreak: a face-down Character is out of the game and cannot act.
      if (player.downed) {
        return { ok: false, reason: 'attack: player is downed' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'attack: not your turn' };
      }
      const target = state.seats[action.targetSeat];
      if (target === undefined) {
        return { ok: false, reason: 'attack: unknown target' };
      }
      if (action.targetSeat === action.seat) {
        return { ok: false, reason: 'attack: cannot attack yourself' };
      }
      if (target.dead) {
        return { ok: false, reason: 'attack: target is dead' };
      }
      // Outbreak: a face-down Character cannot be targeted by effects.
      if (target.downed) {
        return { ok: false, reason: 'attack: target is downed' };
      }
      if (player.exploresLeft < 1) {
        return { ok: false, reason: 'attack: no explores left' };
      }
      // Infected Characters cannot attack other Infected Characters.
      if (player.isInfectedCharacter === true && target.isInfectedCharacter === true) {
        return { ok: false, reason: 'attack: infected cannot attack infected' };
      }      // IN-005 Drag: the attacked character cannot attack back next turn.
      if (player.cannotAttackSeatNextTurn === action.targetSeat) {
        return { ok: false, reason: 'attack: Drag prevents attacking back' };
      }
      if (player.isInfectedCharacter === true) {
        // Only Infected Characters may use Infection cards, and only from hand.
        for (const iid of action.infectionCardIds ?? []) {
          const idef = cardDef(state, iid);
          if (idef === undefined || !idef.id.startsWith('in-')) {
            return { ok: false, reason: 'attack: not an infection card' };
          }
          if (!player.hand.includes(iid)) {
            return { ok: false, reason: 'attack: infection card not in hand' };
          }
        }
        return { ok: true };
      }
      if ((action.infectionCardIds ?? []).length > 0) {
        return { ok: false, reason: 'attack: only infected characters use infections' };
      }
      const attackWeaponId = action.weaponInstanceId
        ?? player.hand.find(id => cardDef(state, id)?.type === 'weapon');
      if (attackWeaponId === undefined) {
        return { ok: false, reason: 'attack: no weapon' };
      }
      const attackWeaponDef = cardDef(state, attackWeaponId);
      if (attackWeaponDef === undefined || attackWeaponDef.type !== 'weapon') {
        return { ok: false, reason: 'attack: not a weapon' };
      }
      if (player.turnAmmo < (attackWeaponDef.ammoReq ?? 0)) {
        return { ok: false, reason: 'attack: insufficient ammo' };
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
      // Alliance Partner Modification: the ability may belong to the Main
      // character or to the Partner (whose level follows the Main's Decorations).
      const source = characterSource(state, action.seat, action.character ?? 'main');
      if (source === undefined) {
        return { ok: false, reason: `useCharacterAbility: unknown character: ${action.character ?? 'main'}` };
      }
      const charDef = source.def;
      const charLevel = source.level;
            if (charDef.abilities === undefined) {
              return { ok: false, reason: `useCharacterAbility: character has no abilities` };
            }
            if (action.abilityIndex < 0 || action.abilityIndex >= charDef.abilities.length) {
              return { ok: false, reason: `useCharacterAbility: bad ability index: ${action.abilityIndex}` };
            }
            const ability = charDef.abilities[action.abilityIndex];
            if (ability === undefined) {
              return { ok: false, reason: `useCharacterAbility: bad ability index: ${action.abilityIndex}` };
            }
            // Abilities must be unlocked at the character's current level.
                  if (ability.level > charLevel) {
                    return { ok: false, reason: 'useCharacterAbility: ability not unlocked' };
                  }
      switch (ability.kind) {
        case 'plusDamageThisTurn':
        case 'exchangeHandWithInventoryTop':
        case 'revealMansionTopNoEffect':
        case 'revealInventoryTopForAction':
        case 'trashFromHandAtWill':
        case 'forceExploreOtherPlayer':
        case 'giveOneCardToPlayerThenMaybeAnother':
        case 'revealHandForDamageIfTwoTypes':
        case 'choosePlayerToDiscardOneCardDuringTurn':
        case 'discardCardToInventoryBottom':
        case 'inventoryBottomToTop':
        case 'gainAmmoX10ForGold':
        case 'discardToHandIfTenPlus':
        case 'discardCardForHealAndDamage':
        case 'chosenWeaponTypeAmmoDiscount':
        case 'discardAnyForAmmo':
        case 'gainInfectionForGold':
        case 'moveHandCardToTopOfInventory':
        case 'discardForActionFromDiscard':
        case 'gainSpecificWeaponIntoInventory':
        case 'movePlayAreaWeaponToInventoryTop':
        case 'discardWeaponToCopyEffects':
        case 'choosePlayerIncreaseAmmoReqNextTurn':
        case 'discardActionCardFromHandForPlusTwoCards':
        case 'forceAllyExploreWithSupport': {
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
          if (ability.kind === 'forceAllyExploreWithSupport') {
            const others = state.seats.filter(s => s.seat !== action.seat && !s.dead && !s.downed);
            if (others.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: no other players' };
            }
            // NOTE: deliberately NO Ammo precondition. The forced explore always
            // happens (the card says Sherry forces it); the resolution spends
            // whichever weapons the combined Ammo can pay for, and an empty
            // arsenal still explores unarmed. A hand-dependent check here would
            // also DISAGREE between the server (full state) and the client
            // (other seats' hands are sanitized to hidden-*), offering an
            // ability button the server then rejects.
          }
          if (ability.kind === 'exchangeHandWithInventoryTop') {
            if (player.hand.length === 0 || player.inventory.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: needs a card in hand and Inventory' };
            }
          }
          if (ability.kind === 'revealMansionTopNoEffect' && state.mansionDeck.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: Mansion is empty' };
          }
          if (ability.kind === 'revealInventoryTopForAction' && player.inventory.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: Inventory is empty' };
          }
          if (ability.kind === 'trashFromHandAtWill' && player.hand.length === 0) {
            return { ok: false, reason: 'useCharacterAbility: hand is empty' };
          }
          if (ability.kind === 'forceExploreOtherPlayer') {
            const others = state.seats.filter(s => s.seat !== action.seat && !s.dead && !s.downed);
            if (others.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: no other players' };
            }
          }
          if (ability.kind === 'chosenWeaponTypeAmmoDiscount') {
            const hasTypedWeapon = [...player.hand, ...player.playArea].some(id => {
              const d = cardDef(state, id);
              return d?.type === 'weapon' && !!d.weaponType;
            });
            if (!hasTypedWeapon) {
              return { ok: false, reason: 'useCharacterAbility: no weapon type available' };
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
            const lowHpOthers = state.seats.filter(s => s.seat !== action.seat && !s.dead && !s.downed && (s.hp ?? 0) <= 30);
            const target = lowHpOthers.length === 1 ? lowHpOthers[0] : undefined;
            if (target === undefined || target.hand.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: needs exactly one other player with 30 or less HP and a card in hand' };
            }
          }
          if (ability.kind === 'choosePlayerIncreaseAmmoReqNextTurn') {
            const others = state.seats.filter(s => s.seat !== action.seat && !s.dead && !s.downed);
            if (others.length === 0) {
              return { ok: false, reason: 'useCharacterAbility: no other players' };
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

    case 'removeAttachedItem': {
      // Nightmare: MA-070 Treasure Map — remove an attached Item from the game.
      if (state.phase !== 'main') {
        return { ok: false, reason: 'removeAttachedItem: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `removeAttachedItem: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'removeAttachedItem: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'removeAttachedItem: not your turn' };
      }
      const itemDef = cardDef(state, action.instanceId);
      if (itemDef === undefined || itemDef.type !== 'item') {
        return { ok: false, reason: 'removeAttachedItem: unknown item' };
      }
      if (!player.attached.includes(action.instanceId)) {
        return { ok: false, reason: 'removeAttachedItem: not attached to your character' };
      }
      const removable = (itemDef.itemEffects ?? []).some(e => e.kind === 'attachThenRemoveForCardsAndGold');
      if (!removable) {
        return { ok: false, reason: 'removeAttachedItem: item is not removable' };
      }
      return { ok: true };
    }
    case 'useWeaponAbility': {
      // Mercenaries: manual weapon effects (WE-043/046/049).
      if (state.phase !== 'main') {
        return { ok: false, reason: 'useWeaponAbility: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `useWeaponAbility: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'useWeaponAbility: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'useWeaponAbility: not your turn' };
      }
      const weaponDef = cardDef(state, action.instanceId);
      if (weaponDef === undefined || weaponDef.type !== 'weapon') {
        return { ok: false, reason: 'useWeaponAbility: unknown weapon' };
      }
      if (!player.hand.includes(action.instanceId) && !player.playArea.includes(action.instanceId)) {
        return { ok: false, reason: 'useWeaponAbility: weapon not in hand or play area' };
      }
      const manual = (weaponDef.weaponEffects ?? []).filter(e =>
        e.kind === 'payAmmoForDamage' || e.kind === 'removeXpForDamage' || e.kind === 'selfPlusDamageTrashAtTurnEnd');
      if (manual.length === 0) {
        return { ok: false, reason: 'useWeaponAbility: no manual effect' };
      }
      if ((player.usedWeaponEffectsThisTurn ?? []).includes(action.instanceId)) {
        return { ok: false, reason: 'useWeaponAbility: already used this turn' };
      }
      for (const e of manual) {
        if (e.kind === 'payAmmoForDamage' && player.turnAmmo < e.ammoCost) {
          return { ok: false, reason: 'useWeaponAbility: not enough ammo' };
        }
        if (e.kind === 'removeXpForDamage' && (player.xp ?? 0) < 1) {
          return { ok: false, reason: 'useWeaponAbility: no XP on the Character' };
        }
      }
      return { ok: true };
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
      const attachCap = partnerAttachCap(seatAbilities(state, action.seat));
      if (attached.length >= attachCap) {
        if (action.replaceIndex === undefined || action.replaceIndex < 0 || action.replaceIndex >= attachCap) {
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
      if (player.mustExplore === true && canExploreLegally(state, action.seat)) {
        return { ok: false, reason: 'endTurn: must Explore first (Wesker ability)' };
      }
      return { ok: true };

    case 'moveXp': {
      if (state.phase !== 'main') {
        return { ok: false, reason: 'moveXp: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `moveXp: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'moveXp: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'moveXp: not your turn' };
      }
      const skillInst = state.cards[action.skillInstanceId];
      if (skillInst === undefined) {
        return { ok: false, reason: 'moveXp: unknown skill' };
      }
      if (!(player.skills ?? []).includes(action.skillInstanceId)) {
        return { ok: false, reason: 'moveXp: not your skill' };
      }
      if (!Number.isInteger(action.amount) || action.amount < 1) {
        return { ok: false, reason: 'moveXp: bad amount' };
      }
      if (action.amount > (player.xp ?? 0)) {
        return { ok: false, reason: 'moveXp: not enough XP' };
      }
      return { ok: true };
    }

    case 'useSkill': {
      if (state.phase !== 'main') {
        return { ok: false, reason: 'useSkill: not in main phase' };
      }
      if (player === undefined) {
        return { ok: false, reason: `useSkill: unknown seat: ${action.seat}` };
      }
      if (player.dead) {
        return { ok: false, reason: 'useSkill: player is dead' };
      }
      if (action.seat !== state.activeSeat) {
        return { ok: false, reason: 'useSkill: not your turn' };
      }
      const skillInst = state.cards[action.skillInstanceId];
      if (skillInst === undefined) {
        return { ok: false, reason: 'useSkill: unknown skill' };
      }
      if (!(player.skills ?? []).includes(action.skillInstanceId)) {
        return { ok: false, reason: 'useSkill: not your skill' };
      }
      if (!isSkillActive(state, action.skillInstanceId)) {
        return { ok: false, reason: 'useSkill: skill not active' };
      }
      for (let i = state.log.length - 1; i >= 0; i--) {
        const logged = state.log[i]?.action;
        if (logged === undefined) continue;
        if (logged.type === 'endTurn' && logged.seat === action.seat) break;
        if (logged.type === 'useSkill' && logged.seat === action.seat && logged.skillInstanceId === action.skillInstanceId) {
          return { ok: false, reason: 'useSkill: already used this turn' };
        }
      }
      return { ok: true };
    }

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
