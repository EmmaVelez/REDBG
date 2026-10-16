import type { GameState, Action, CardDef, ValidationResult } from '../types';

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
      const weaponSet = new Set(action.weapons);
      if (weaponSet.size !== action.weapons.length) {
        return { ok: false, reason: `explore: duplicate weapon: ${action.weapons.find((id, index) => action.weapons.indexOf(id) !== index)}` };
      }
      for (const weaponId of action.weapons) {
              if (!player.hand.includes(weaponId)) {
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
            const requiredAmmo = action.weapons.reduce((sum, weaponId) => {
              const weaponCardDef = cardDef(state, weaponId);
              return sum + (weaponCardDef?.ammoReq ?? 0);
            }, 0);
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
