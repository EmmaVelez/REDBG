
import type { Action, GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { validateAction } from '../engine/validate';
import { explorableWeapons } from '../engine/weaponReuse';
import { characterAbilities, weaponCostCap } from '../engine/abilities';

import { skillXpRequired, skillXpOn, activeSkillIds } from '../engine/skill';

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
    // weaponCostCap (Josh L1): restricted weapons never enter the pool, so the
    // UI and the bots cannot offer an explore validate would reject.
    const costCap = weaponCostCap(characterAbilities(state, seat));
    const weaponsAvailable = explorableWeapons(state, seat).filter(id => {
      if (costCap === undefined) return true;
      const cd = state.cardDefs[state.cards[id]?.cardId ?? ''];
      return (cd?.cost ?? 0) < costCap;
    });
    const singleWeaponLimiter = characterAbilities(state, seat).some(a => a.kind === 'singleWeaponLimiter');

    // 4b. Generate candidates: every non-empty subset of the pool.
    // The rules place no cap on weapons per explore (each weapon used once,
    // ammo from the cumulative pool), so a 3-knife hand must offer the
    // 3-weapon explore. Subsets are bitmask-enumerated; hands are small
    // (<=10 cards typical), and validate filters ammo-illegal combos.
    const maxSubsetWeapons = Math.min(weaponsAvailable.length, 10);
    for (let mask = 1; mask < (1 << maxSubsetWeapons); mask++) {
      const combo: string[] = [];
      if (singleWeaponLimiter) {
        let pc = 0; let m = mask; while (m) { pc += m & 1; m >>= 1; }
        if (pc > 1) continue;
      }
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

  // --- 4c. attack (Outbreak) ---
  // Attacking spends 1 Explore. Non-Infected attackers must name a weapon
  // they can pay the ammo for; Infected attackers deal their base Damage.
  if (state.infectionDeck !== undefined && player.exploresLeft >= 1) {
    const infectedAttacker = player.isInfectedCharacter === true;
    for (let t = 0; t < state.seats.length; t++) {
      const target = state.seats[t];
      if (target === undefined || t === seat || target.dead) continue;
      if (infectedAttacker && target.isInfectedCharacter === true) continue;
      if (infectedAttacker) {
        generatedActions.push({ type: 'attack', seat, targetSeat: t });
        // Infected attackers may also play any infection cards from hand.
        const handInfections = player.hand.filter(id => state.cards[id]?.cardId.startsWith('in-'));
        for (const iid of handInfections) {
          generatedActions.push({ type: 'attack', seat, targetSeat: t, infectionCardIds: [iid] });
        }
      } else {
        for (const wId of weaponsAvailable) {
          const cd = state.cardDefs[state.cards[wId]?.cardId ?? ''];
          if ((cd?.ammoReq ?? 0) <= player.turnAmmo) {
            generatedActions.push({ type: 'attack', seat, targetSeat: t, weaponInstanceId: wId });
          }
        }
      }
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
        const ability = charDef.abilities[i];
        // PR-002 Jill's skip-turn ability is turn-start only (prompt); no manual button.
        if (ability?.kind === 'skipTurnForSuperNextTurn') continue;
        if (ability?.kind === 'gainKnifeAtTurnStart') continue;
        generatedActions.push({
          type: 'useCharacterAbility',
          seat,
          abilityIndex: i,
        });
      }
    }
  }

  // --- attachToPartner (weapons in hand) ---
  if (player.partnerInstanceId) {
    for (const instanceId of player.hand) {
      const cardData = state.cards[instanceId];
      if (cardData) {
        const cd = state.cardDefs[cardData.cardId];
        if (cd?.type === 'weapon' || cd?.type === 'action') {
          const attached = player.partnerAttached ?? [];
          if (attached.length < 2) {
            generatedActions.push({ type: 'attachToPartner', seat, instanceId });
          } else {
            generatedActions.push({ type: 'attachToPartner', seat, instanceId, replaceIndex: 0 });
            generatedActions.push({ type: 'attachToPartner', seat, instanceId, replaceIndex: 1 });
          }
        }
      }
    }
  // partner mode leader selection is handled automatically; bots should not pick manually

  }

  // --- 6a. useWeaponAbility (Mercenaries manual weapon effects) ---
  for (const instanceId of [...player.hand, ...player.playArea]) {
    const cardData = state.cards[instanceId];
    if (!cardData) continue;
    const def = state.cardDefs[cardData.cardId];
    const hasManual = (def?.weaponEffects ?? []).some(e =>
      e.kind === 'payAmmoForDamage' || e.kind === 'removeXpForDamage' || e.kind === 'selfPlusDamageTrashAtTurnEnd');
    if (hasManual) {
      generatedActions.push({ type: 'useWeaponAbility', seat, instanceId });
    }
  }

  // --- 6b. moveXp (Mercenaries Skill System) ---
  // Moving XP is a free action; offer the amount that fills each Skill to its
  // requirement, plus dumping the whole pool onto it.
  if (state.skillSystem === true && (player.xp ?? 0) > 0) {
    for (const skillId of player.skills ?? []) {
      const need = Math.max(skillXpRequired(state, skillId) - skillXpOn(state, skillId), 0);
      if (need > 0 && need <= (player.xp ?? 0)) {
        generatedActions.push({ type: 'moveXp', seat, skillInstanceId: skillId, amount: need });
      }
      if ((player.xp ?? 0) > need) {
        generatedActions.push({ type: 'moveXp', seat, skillInstanceId: skillId, amount: player.xp ?? 0 });
      }
    }
  }

  // --- 6c. useSkill (Mercenaries manual "can" Skills) ---
  if (state.skillSystem === true) {
    const manualKinds = new Set([
      'selfDamageForCardsAndAction', 'selfDamageForTrashDiscard', 'trashAmmoForAmmo',
      'movePlayAreaWeaponToInventoryTop', 'nameWeaponTypeAmmoDiscount', 'removeXpForTrashHand',
      'exploreBonusDamagePerCharacterDamage', 'giantKillingPlusDamage',
      'giantKillingAllWeaponsPlusDamage', 'exploreDuplicateWeaponEffect', 'removeXpForWeaponDamage',
    ]);
    for (const skillId of activeSkillIds(state, seat)) {
      const def = state.cardDefs[state.cards[skillId]?.cardId ?? ''];
      if ((def?.skillEffects ?? []).some(e => manualKinds.has(e.kind))) {
        generatedActions.push({ type: 'useSkill', seat, skillInstanceId: skillId });
      }
    }
  }

  // --- 6d. removeAttachedItem (Nightmare MA-070 Treasure Map) ---
  for (const instanceId of player.attached) {
    const cardData = state.cards[instanceId];
    if (!cardData) continue;
    const def = state.cardDefs[cardData.cardId];
    if ((def?.itemEffects ?? []).some(e => e.kind === 'attachThenRemoveForCardsAndGold')) {
      generatedActions.push({ type: 'removeAttachedItem', seat, instanceId });
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
