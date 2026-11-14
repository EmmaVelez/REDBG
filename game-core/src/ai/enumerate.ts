
import type { Action, GameState, PlayerState, CardDef, CharacterAbility } from '../types';
import { validateAction } from '../engine/validate';
import { explorableWeapons, remainingWeaponUses } from '../engine/weaponReuse';
import { characterAbilities, weaponCostCap, attachEligibleHandCards } from '../engine/abilities';

import { skillXpRequired, skillXpOn, activeSkillIds } from '../engine/skill';
import { grantedExploresFor } from '../engine/explore';
import { exploreAmmoReq } from '../engine/ammo';

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
        // Alliance Partner Modification: a healing item (other than the Red
        // Herb) heals exactly ONE character. The bot considers both targets
        // so it can look after a hurt Partner; naming the target also applies
        // the heal immediately rather than waiting on a target prompt.
        const targetedHeal = (cardDef.itemEffects ?? []).some(
          e => e.kind === 'healToFull' || e.kind === 'healFixed20OrTrashWithSecondFor60',
        );
        if (targetedHeal && player.partnerInstanceId !== undefined) {
          generatedActions.push({ type: 'playItem', seat, instanceId, healTarget: 'main' });
          generatedActions.push({ type: 'playItem', seat, instanceId, healTarget: 'partner' });
        } else {
          generatedActions.push({ type: 'playItem', seat, instanceId });
        }
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
    // FCH-008 Sherry Birkin cannot use Weapons, so she has no explore.
    const cannotUseWeapons = characterAbilities(state, seat).some(a => a.kind === 'cannotUseWeapons');
    const weaponsAvailable = explorableWeapons(state, seat).filter(id => {
      if (cannotUseWeapons) return false;
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
    // mask 0 is the unarmed explore (zero Weapons) — always legal, and
    // the only way a weaponless player can meet a forced-Explore obligation.
    for (let mask = 0; mask < (1 << maxSubsetWeapons); mask++) {
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
      // Leon L2 double use (official FAQ): a weapon with uses left may be
      // declared TWICE in one explore — pay its ammo requirement twice and its
      // effect and damage apply twice. Offer one doubled variant per combo so
      // the bot (and the client's legality check) can reach it.
      const combos: string[][] = [combo];
      const firstReusable = combo.find(id => remainingWeaponUses(state, seat, id) >= 2);
      if (firstReusable !== undefined) combos.push([...combo, firstReusable]);
      for (const comboOf of combos) {
        // Multi-explore (rulebook "Extra Explore"): the bot considers spending
        // 1 Explore and spending its whole pool (all-in). Intermediate counts are
        // legal for humans via the picker; the bot's 1-ply evaluation only needs
        // the two extremes to weigh single vs combined battles. The pool
        // includes the Explores the combo itself grants (a Pump-Action Shotgun's
        // "+1 Explore" can be spent in the same action).
        const granted = grantedExploresFor(
          comboOf.map(id => {
            const ci = state.cards[id];
            return ci === undefined ? undefined : state.cardDefs[ci.cardId];
          }),
        );
        const exploreCounts: readonly number[] = player.exploresLeft + granted > 1
          ? [1, player.exploresLeft + granted]
          : [1];
        // Alliance Partner Modification: the player chooses who leads before the
        // reveal ("your Leading Character takes the full Damage ... After your
        // Leading Character has taken Damage, the Infected is passed to your
        // Partner"). Both leaders are legal, so the bot must be able to consider
        // each — leading with a high-Health Partner to protect a low-Health Main
        // is often the better play, and the leader's own abilities apply.
        const leaders: readonly ('main' | 'partner')[] =
          player.partnerInstanceId !== undefined ? ['main', 'partner'] : ['main'];
        // X-ammo weapons (Gatling Gun, Russian Assault Rifle, Signature
        // Special): the player allocates how much Ammo to spend and that amount
        // IS the damage. Offer a bounded set of allocations — none at all, plus
        // "as much as affordable" for each X weapon in turn — so the bot can
        // weigh them without an allocation-count explosion.
        const xIds = [...new Set(comboOf)].filter(id => {
          const ci = state.cards[id];
          return ci !== undefined && state.cardDefs[ci.cardId]?.xAmmo === true;
        });
        const fixedCost = comboOf.reduce((sum, id) => {
          const ci = state.cards[id];
          const def = ci === undefined ? undefined : state.cardDefs[ci.cardId];
          if (def?.xAmmo === true) return sum;
          return sum + exploreAmmoReq(state, seat, id, comboOf.length);
        }, 0);
        const allocations: Record<string, number>[] = [{}];
        for (const xid of xIds) {
          const ci = state.cards[xid];
          const cap = (ci === undefined ? undefined : state.cardDefs[ci.cardId]?.ammoCap) ?? Infinity;
          const amount = Math.max(0, Math.min(player.turnAmmo - fixedCost, cap));
          if (amount > 0) allocations.push({ [xid]: amount });
        }
        for (const leader of leaders) {
          for (const exploreCount of exploreCounts) {
            for (const allocation of allocations) {
              generatedActions.push({
                type: 'explore',
                seat,
                weapons: comboOf,
                exploreCount,
                ...(leader === 'partner' ? { leader: 'partner' as const } : {}),
                ...(Object.keys(allocation).length > 0 ? { ammoByWeapon: allocation } : {}),
              });
            }
          }
        }
      }
    }

  // --- 4c. attack (Outbreak) ---
  // Attacking spends 1 Explore. Non-Infected attackers must name a weapon
  // they can pay the ammo for; Infected attackers deal their base Damage.
  if (state.infectionDeck !== undefined && player.exploresLeft >= 1) {
    const infectedAttacker = player.isInfectedCharacter === true;
    for (let t = 0; t < state.seats.length; t++) {
      const target = state.seats[t];
      if (target === undefined || t === seat || target.dead || target.downed) continue;
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
  // Both characters' abilities are the player's: the Main's always, and the
  // Partner's too (Alliance Partner Modification). `character` names which
  // character's list `abilityIndex` indexes into.
  const abilityTargets: ReadonlyArray<readonly ['main' | 'partner', CardDef | undefined]> = [
    ['main', (() => {
      const d = state.cards[player.characterInstanceId];
      return d === undefined ? undefined : state.cardDefs[d.cardId];
    })()],
    ['partner', (() => {
      const d = player.partnerInstanceId !== undefined ? state.cards[player.partnerInstanceId] : undefined;
      return d === undefined ? undefined : state.cardDefs[d.cardId];
    })()],
  ];
  for (const [character, charDef] of abilityTargets) {
    if (!charDef?.abilities) continue;
    for (let i = 0; i < charDef.abilities.length; i++) {
      const ability = charDef.abilities[i];
      // PR-002 Jill's skip-turn ability is turn-start only (prompt); no manual button.
      if (ability?.kind === 'skipTurnForSuperNextTurn') continue;
      if (ability?.kind === 'gainKnifeAtTurnStart') continue;
      generatedActions.push({
        type: 'useCharacterAbility',
        seat,
        abilityIndex: i,
        ...(character === 'partner' ? { character: 'partner' as const } : {}),
      });
    }
  }

  // --- attachToPartner ---
  // Humans get ONE guided action (`attachToPartnerStart`) that raises a card
  // prompt, then a slot prompt when the Partner is full. Bots keep the direct
  // per-card actions so the greedy policy never has to resolve a prompt chain.
  if (player.partnerInstanceId && attachEligibleHandCards(state, seat).length > 0) {
    if (player.controller === 'human') {
      generatedActions.push({ type: 'attachToPartnerStart', seat });
    } else {
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
    }
  // partner mode leader selection: bots do not call chooseExploreLeader; they
  // express the choice on the explore action itself (leader: 'partner', see the
  // explore enumeration above). chooseExploreLeader stays a human-only action.

  }

  // --- 6a. useWeaponAbility (Mercenaries manual weapon effects) ---
  for (const instanceId of [...player.hand, ...player.playArea]) {
    const cardData = state.cards[instanceId];
    if (!cardData) continue;
    const def = state.cardDefs[cardData.cardId];
    const hasManual = (def?.weaponEffects ?? []).some(e =>
      e.kind === 'payAmmoForDamage' || e.kind === 'removeXpForDamage' || e.kind === 'selfPlusDamageTrashAtTurnEnd'
      || e.kind === 'armLauncherForAllRevealed' || e.kind === 'trashAmmoFromPlayForDamage');
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
