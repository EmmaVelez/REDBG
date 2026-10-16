
import type { Action, GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { validateAction } from '../engine/validate';

export function enumerateLegalActions(state: GameState, seat: number): readonly Action[] {
  // 0. Guard
  const player = state.seats[seat];
  if (!player) {
    return [];
  }

  const generatedActions: Action[] = [];

  // --- 1. playActionCard ---
  for (const instanceId of player.hand) {
    const cardData = state.cards[instanceId];
    if (cardData) {
      const cardDef = state.cardDefs[cardData.cardId];
      if (cardDef?.type === 'action') {
        generatedActions.push({ type: 'playActionCard', seat, instanceId });
      }
    }
  }

  // --- 2. playItem ---
  for (const instanceId of player.hand) {
    const cardData = state.cards[instanceId];
    if (cardData) {
      const cardDef = state.cardDefs[cardData.cardId];
      if (cardDef?.type === 'item') {
        generatedActions.push({ type: 'playItem', seat, instanceId });
      }
    }
  }

  // --- 3. playAmmo ---
  for (const instanceId of player.hand) {
    const cardData = state.cards[instanceId];
    if (cardData) {
      const cardDef = state.cardDefs[cardData.cardId];
      if (cardDef?.type === 'ammunition') {
        generatedActions.push({ type: 'playAmmo', seat, instanceId });
      }
    }
  }

  // --- 4. explore ---
  // 4a. Build weaponsInHand
  const weaponsInHand: readonly string[] = player.hand.filter((instanceId) => {
    const cardData = state.cards[instanceId];
    if (cardData) {
      const cardDef = state.cardDefs[cardData.cardId];
      return cardDef?.type === 'weapon';
    }
    return false;
  });

  // 4b. Ammo coverage helper (deterministic greedy)
  // Note: We must pass the state object to the helper function scope if it relies on state.cardDefs
  // Since the helper is defined outside, we must pass state explicitly or redefine it inside.
  // Redefining inside to capture state scope cleanly.
  const getAmmoCards = (weaponIds: readonly string[]): readonly string[] => {
    let totalAmmoReq = 0;
    for (const instanceId of weaponIds) {
      const cardData = state.cards[instanceId];
      if (cardData) {
        const cardDef = state.cardDefs[cardData.cardId];
        if (cardDef?.ammoReq !== undefined) {
          totalAmmoReq += cardDef.ammoReq;
        }
      }
    }

    if (totalAmmoReq === 0) {
      return [];
    }

    // Identify and sort ammo cards in hand
    const ammoCards = player.hand
      .map(instanceId => {
        const cardData = state.cards[instanceId];
        if (cardData) {
          const cardDef = state.cardDefs[cardData.cardId];
          return {
            instanceId,
            ammoBonus: cardDef?.bonuses?.ammo ?? 0,
          };
        }
        return null;
      })
      .filter((card): card is { instanceId: string, ammoBonus: number } => card !== null)
      .sort((a, b) => {
        if (b.ammoBonus !== a.ammoBonus) {
          return b.ammoBonus - a.ammoBonus; // DESC
        }
        return a.instanceId.localeCompare(b.instanceId); // ASC
      });

    // Greedily pick cards
    let currentAmmo = 0;
    const pickedAmmoCards: string[] = [];

    for (const card of ammoCards) {
      if (currentAmmo < totalAmmoReq) {
        pickedAmmoCards.push(card.instanceId);
        currentAmmo += card.ammoBonus;
      } else {
        break;
      }
    }

    // Return picked cards in original hand order
    const pickedSet = new Set(pickedAmmoCards);
    return player.hand.filter(instanceId => pickedSet.has(instanceId));
  };

  // 4c. Generate candidates: Singles
  for (const weaponInstanceId of weaponsInHand) {
    const ammoCards = getAmmoCards([weaponInstanceId]);
    generatedActions.push({
      type: 'explore',
      seat,
      weapons: [weaponInstanceId],
      ammoCards,
      exploreCount: 1,
    });
  }

  // 4c. Generate candidates: Pairs (i < j)
    for (let i = 0; i < weaponsInHand.length; i++) {
      const weapon1 = weaponsInHand[i];
      if (weapon1 === undefined) continue;
      for (let j = i + 1; j < weaponsInHand.length; j++) {
        const weapon2 = weaponsInHand[j];
        if (weapon2 === undefined) continue;
        const ammoCards = getAmmoCards([weapon1, weapon2]);
        generatedActions.push({
          type: 'explore',
          seat,
          weapons: [weapon1, weapon2],
          ammoCards,
          exploreCount: 1,
        });
      }
    }

  // --- 5. buy ---
  // Object.keys preserves insertion order in modern JS environments
  const pileIds = Object.keys(state.marketPiles);
  for (const pileId of pileIds) {
    generatedActions.push({ type: 'buy', seat, pileId });
  }

  // --- 6. useCharacterAbility ---
  const charInstData = state.cards[player.characterInstanceId];
  if (charInstData) {
    const charDef = state.cardDefs[charInstData.cardId];
    if (charDef?.abilities) {
      for (let i = 0; i < charDef.abilities.length; i++) {
        generatedActions.push({
          type: 'useCharacterAbility',
          seat,
          abilityIndex: i,
        });
      }
    }
  }

  // --- 7. endTurn ---
  generatedActions.push({ type: 'endTurn', seat });

  // --- 8. chooseOption ---
  const prompts = state.prompts.filter(prompt => prompt.seat === seat);
  for (const prompt of prompts) {
    for (let oi = 0; oi < prompt.options.length; oi++) {
      generatedActions.push({
        type: 'chooseOption',
        seat,
        promptId: prompt.id,
        option: oi,
      });
    }
  }

  // --- 9. Filter ---
  const results: Action[] = [];
  for (const action of generatedActions) {
    // validateAction returns { ok: boolean, reason: string }
    const validationResult = validateAction(state, action);
    if (validationResult.ok) {
      results.push(action);
    }
  }

  return results;
}
