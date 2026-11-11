import type { CardDef, GameState, PlayerState } from '../types';
import { revealTop, sendToBottom } from './mansion';
import { drawWithReshuffle } from './deck';
import { characterAbilities, passiveDamageBonus, infectedDamageReduction, applyRicardoDamage } from './abilities';
import { exploreAmmoReq } from './ammo';
import { resolveExplore, type ExploreOutcome, type ExploreWeapon } from './explore';
import { isNemesisPursuit, applyNemesisPursuit, nemesisPursuitBuff } from './nemesisPursuit';
import { ammoX10CountInDiscard } from './rachaelFoley';

function cardDef(state: GameState, instanceId: string | undefined): CardDef | undefined {
  const inst = instanceId === undefined ? undefined : state.cards[instanceId];
  return inst === undefined ? undefined : state.cardDefs[inst.cardId];
}

/**
 * FCH-008 Sherry Birkin — "Once per turn Sherry can force another Player to
 * Explore with her. Sherry's hand and Sherry's Items this turn can assist that
 * Player. Defeated Infected are awarded to Sherry. Any Damage is split evenly
 * between both Characters. The Exploring Player draws a new Hand after."
 *
 * The forced explore happens during Sherry's turn; BOTH the exploring player's and
 * Sherry's Ammo may pay for it (Sherry's is spent first, then the target's).
 * Every weapon from the target's hand and Sherry's hand may take part; each
 * weapon ends up in its OWNER's play area. Defeated Infected (and their
 * Decorations) are awarded to Sherry, the damage the Infected deals is split
 * evenly, and the exploring player redraws a fresh hand afterwards.
 */
/** The weapon pool a forced explore draws from: the exploring player's hand
 *  weapons plus Sherry's hand weapons. */
export function allyExploreWeaponIds(state: GameState, sherrySeat: number, targetSeat: number): readonly string[] {
  const sherry = state.seats[sherrySeat];
  const target = state.seats[targetSeat];
  if (sherry === undefined || target === undefined) return [];
  return [
    ...target.hand.filter(id => cardDef(state, id)?.type === 'weapon'),
    ...sherry.hand.filter(id => cardDef(state, id)?.type === 'weapon'),
  ];
}

/** Ammo the forced explore would cost (Sherry pays it). */
export function allyExploreAmmoCost(state: GameState, sherrySeat: number, targetSeat: number): number {
  const weaponIds = allyExploreWeaponIds(state, sherrySeat, targetSeat);
  return weaponIds.reduce((sum, id) => sum + exploreAmmoReq(state, targetSeat, id, weaponIds.length), 0);
}

/**
 * The weapon ids a forced explore would ACTUALLY use: the whole combined
 * arsenal when the combined Ammo covers it, otherwise the weapons that fit
 * (cheapest first). An empty arsenal is a valid result — the explore still
 * happens unarmed.
 */
export function allyExploreUsedWeaponIds(state: GameState, sherrySeat: number, targetSeat: number): readonly string[] {
  const weaponIds = allyExploreWeaponIds(state, sherrySeat, targetSeat);
  const combinedAmmo = (state.seats[targetSeat]?.turnAmmo ?? 0) + (state.seats[sherrySeat]?.turnAmmo ?? 0);
  const fullReq = weaponIds.reduce(
    (sum, id) => sum + exploreAmmoReq(state, targetSeat, id, weaponIds.length),
    0,
  );
  if (fullReq <= combinedAmmo) return weaponIds;
  const budget = { remaining: combinedAmmo };
  return weaponIds
    .map(id => ({ id, cost: exploreAmmoReq(state, targetSeat, id, weaponIds.length) }))
    .sort((a, b) => a.cost - b.cost)
    .filter(e => {
      if (e.cost > budget.remaining) return false;
      budget.remaining -= e.cost;
      return true;
    })
    .map(e => e.id);
}

export function resolveAllyExplore(
  state: GameState,
  sherrySeat: number,
  targetSeat: number,
): GameState {
  const sherry = state.seats[sherrySeat];
  const target = state.seats[targetSeat];
  if (sherry === undefined || target === undefined) return state;

  // An empty arsenal is NOT a no-op: the card says Sherry forces the explore,
  // so the target still reveals the Mansion (unarmed) and takes the hit. The
  // old `if (weaponIds.length === 0) return state` made the ability silently do
  // nothing whenever neither hand held a weapon.

  const rev = revealTop({ deck: state.mansionDeck });
  const revealedId = rev.revealedInstanceId;
  const revealedDef = cardDef(state, revealedId);
  let mansionDeck = rev.mansion.deck;

  const targetAbilities = characterAbilities(state, targetSeat);
  // Both the exploring player's and Sherry's Ammo may pay for the explore.
  const combinedAmmo = (target.turnAmmo ?? 0) + (sherry.turnAmmo ?? 0);
  // If the combined Ammo cannot pay for the whole arsenal, use the weapons that
  // fit (cheapest first) rather than doing nothing — the explore still happens.
  const usedWeaponIds = allyExploreUsedWeaponIds(state, sherrySeat, targetSeat);
  const weaponDefs = usedWeaponIds.map(id => cardDef(state, id));
  const weapons: ExploreWeapon[] = usedWeaponIds.map((id, i) => ({
    damage: weaponDefs[i]?.damage ?? 0,
    ammoReq: exploreAmmoReq(state, targetSeat, id, usedWeaponIds.length),
    weaponEffects: weaponDefs[i]?.weaponEffects,
    tags: weaponDefs[i]?.weaponTags,
  }));
  const abilityDamage = passiveDamageBonus(targetAbilities, weaponDefs, 1, target.hand.length);
  const bonusDamage = target.weaponDamageBonusThisTurn + abilityDamage;

  const outcome: ExploreOutcome = resolveExplore({
    weapons,
    ammo: combinedAmmo,
    bonusDamage,
    revealed: {
      ...(revealedDef ?? ({} as CardDef)),
      hp: (revealedDef?.hp ?? 0) + nemesisPursuitBuff(state).hp,
      attack: (revealedDef?.attack ?? 0) + nemesisPursuitBuff(state).attack,
    },
    damageReduction: infectedDamageReduction(targetAbilities),
    attachedInfectedCount: target.attached.length,
    inventoryCount: target.inventory.length,
    characterDamage: Math.max(target.maxHp - target.hp, 0),
    characterAbilities: targetAbilities,
    characterXp: target.xp ?? 0,
    ammoX10InDiscardCount: ammoX10CountInDiscard(state, targetSeat),
  });

  if (outcome.kind === 'insufficientAmmo') return state;

  // Weapons leave their owner's hand and join that owner's play area.
  const targetWeapons = usedWeaponIds.filter(id => target.hand.includes(id));
  const sherryWeapons = usedWeaponIds.filter(id => sherry.hand.includes(id));
  const stripWeapons = (p: PlayerState): PlayerState =>
    ({ ...p, hand: p.hand.filter(id => !usedWeaponIds.includes(id)) });

  const ammoSpent = weapons.reduce((sum, w) => sum + w.ammoReq, 0);
  let next: GameState = {
    ...state,
    seats: state.seats.map(s => {
      if (s.seat === targetSeat) return stripWeapons({ ...s, playArea: [...s.playArea, ...targetWeapons] });
      if (s.seat === sherrySeat) return stripWeapons({ ...s, playArea: [...s.playArea, ...sherryWeapons] });
      return s;
    }),
  };
  // Sherry pays first (she is forcing the explore), then the exploring player.
  const sherryPays = Math.min(sherry.turnAmmo, ammoSpent);
  const targetPays = ammoSpent - sherryPays;
  next = {
    ...next,
    seats: next.seats.map(s => {
      if (s.seat === sherrySeat) return { ...s, turnAmmo: s.turnAmmo - sherryPays };
      if (s.seat === targetSeat) return { ...s, turnAmmo: Math.max(s.turnAmmo - targetPays, 0) };
      return s;
    }),
  };

  if (outcome.kind === 'nonInfected') {
    if (isNemesisPursuit(revealedDef)) {
      // EV-002 Nemesis Pursuit: removed from the game; the exploring
      // character (Sherry's target) must explore again and every Infected
      // gets +10 Health / +20 Damage for the rest of the turn.
      return applyNemesisPursuit({
        ...next,
        removed: [...next.removed, revealedId],
      }, targetSeat);
    }
    // EV-001 Zombie Grab: its OWN reveal branch (same contract as a normal
    // explore) — trash a weapon from the target's POST-explore hand or
    // discard, or take 20 damage, then shuffle the card back into the Mansion.
    // The weapon options must not read the pre-strip hand: the explore has
    // already moved the used weapons to the play area.
    if (revealedDef?.type === 'event' && revealedDef.id === 'ev-001') {
      const grabWeapons = [
        ...(next.seats[targetSeat]?.hand ?? []),
        ...(next.seats[targetSeat]?.discard ?? []),
      ].filter(id => cardDef(state, id)?.type === 'weapon');
      return {
        ...next,
        mansionDeck,
        prompts: [...next.prompts, {
          id: `ally-zombie-grab-${sherrySeat}-${targetSeat}-${next.version}`,
          seat: targetSeat,
          text: revealedDef?.text ?? '',
          options: [...grabWeapons, 'Take 20 damage'],
          payload: { kind: 'zombieGrab', amount: '20', instanceId: revealedId },
        }],
      };
    }
    // The exploring player decides, exactly as in a normal explore.
    return {
      ...next,
      mansionDeck,
      prompts: [...next.prompts, {
        id: `ally-${sherrySeat}-${targetSeat}-${next.version}`,
        seat: targetSeat,
        text: revealedDef?.text ?? '',
        options: ['Take', 'Send to bottom of Mansion'],
        payload: { kind: 'takeOrBottom', instanceId: revealedId },
      }],
    };
  }

  const damageTaken = outcome.kind === 'notDefeated' ? outcome.damageTaken : 0;
  const targetDamage = Math.ceil(damageTaken / 2);
  const sherryDamage = Math.floor(damageTaken / 2);

  // applyRicardoDamage only computes the new Health; the caller writes it.
  let sherryHp = next.seats[sherrySeat]?.hp ?? 0;
  if (sherryDamage > 0) {
    const ric = applyRicardoDamage(next, sherrySeat, sherryHp, sherryDamage);
    next = ric.state;
    sherryHp = ric.hp;
  }
  let targetHp = next.seats[targetSeat]?.hp ?? 0;
  if (targetDamage > 0) {
    const ric = applyRicardoDamage(next, targetSeat, targetHp, targetDamage);
    next = ric.state;
    targetHp = ric.hp;
  }
  next = {
    ...next,
    seats: next.seats.map(s => {
      if (s.seat === sherrySeat) return { ...s, hp: sherryHp };
      if (s.seat === targetSeat) return { ...s, hp: targetHp };
      return s;
    }),
  };

  // Defeated Infected are awarded to Sherry.
  if (outcome.kind === 'defeated') {
    next = {
      ...next,
      seats: next.seats.map(s => (s.seat === sherrySeat
        ? { ...s, decorations: s.decorations + outcome.decorations, attached: [...s.attached, revealedId] }
        : s)),
      removed: [...next.removed, revealedId],
    };
  } else {
    const bottomed = sendToBottom({ deck: next.mansionDeck }, revealedId);
    next = { ...next, mansionDeck: bottomed.deck };
  }

  // The exploring player draws a new hand.
  const finalTarget = next.seats[targetSeat];
  if (finalTarget !== undefined) {
    const drawn = drawWithReshuffle({
      deck: finalTarget.inventory,
      discard: [...finalTarget.discard, ...finalTarget.hand],
      count: 5,
      rngState: next.rngState,
    });
    next = {
      ...next,
      rngState: drawn.rngState,
      seats: next.seats.map(s => (s.seat === targetSeat
        ? { ...s, hand: drawn.hand, inventory: drawn.deck, discard: drawn.discard }
        : s)),
    };
  }

  return next;
}
