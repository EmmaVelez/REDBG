
import type { Action, GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { validateAction } from '../engine/validate';
import { explorableWeapons } from '../engine/weaponReuse';

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
    // 4a. Build the usable weapon pool: hand weapons PLUS any play-area weapon
    // an ability lets this seat use again (Leon L2 pistolsTwicePerTurn). The
    // pool must match explore validation exactly, or legal explores go missing.
    const weaponsAvailable = explorableWeapons(state, seat);

    // 4b. Generate candidates: every non-empty subset of the pool.
    // The rules place no cap on weapons per explore (each weapon used once,
    // ammo from the cumulative pool), so a 3-knife hand must offer the
    // 3-weapon explore. Subsets are bitmask-enumerated; hands are small
    // (<=10 cards typical), and validate filters ammo-illegal combos.
    const maxSubsetWeapons = Math.min(weaponsAvailable.length, 10);
    for (let mask = 1; mask < (1 << maxSubsetWeapons); mask++) {
      const combo: string[] = [];
      for (let bit = 0; bit < maxSubsetWeapons; bit++) {
        if ((mask & (1 << bit)) !== 0) {
          const weapon = weaponsAvailable[bit];
          if (weapon !== undefined) combo.push(weapon);
        }
      }
      generatedActions.push({
        type: 'explore',
        seat,
        weapons: combo,
        exploreCount: 1,
      });
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
