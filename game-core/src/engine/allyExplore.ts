import type { CardDef, GameState, PlayerState } from '../types';
import { revealTop, sendToBottom } from './mansion';
import { drawWithReshuffle } from './deck';
import { characterAbilities, passiveDamageBonus, infectedDamageReduction, applyRicardoDamage } from './abilities';
import { exploreAmmoReq } from './ammo';
import { resolveExplore, type ExploreOutcome, type ExploreWeapon } from './explore';

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
 * The forced explore happens during Sherry's turn, so Sherry pays the Ammo.
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

export function resolveAllyExplore(
  state: GameState,
  sherrySeat: number,
  targetSeat: number,
): GameState {
  const sherry = state.seats[sherrySeat];
  const target = state.seats[targetSeat];
  if (sherry === undefined || target === undefined) return state;

  const weaponIds = allyExploreWeaponIds(state, sherrySeat, targetSeat);
  if (weaponIds.length === 0) return state;

  const rev = revealTop({ deck: state.mansionDeck, bottom: state.mansionBottom });
  const revealedId = rev.revealedInstanceId;
  const revealedDef = cardDef(state, revealedId);
  let mansionDeck = rev.mansion.deck;
  let mansionBottom = rev.mansion.bottom;

  const targetAbilities = characterAbilities(state, targetSeat);
  const weaponDefs = weaponIds.map(id => cardDef(state, id));
  const weapons: ExploreWeapon[] = weaponIds.map((id, i) => ({
    damage: weaponDefs[i]?.damage ?? 0,
    ammoReq: exploreAmmoReq(state, targetSeat, id, weaponIds.length),
    weaponEffects: weaponDefs[i]?.weaponEffects,
    tags: weaponDefs[i]?.weaponTags,
  }));
  const abilityDamage = passiveDamageBonus(targetAbilities, weaponDefs, 1, target.hand.length);
  const bonusDamage = target.weaponDamageBonusThisTurn + abilityDamage;

  const outcome: ExploreOutcome = resolveExplore({
    weapons,
    ammo: sherry.turnAmmo,
    bonusDamage,
    revealed: revealedDef ?? ({} as CardDef),
    damageReduction: infectedDamageReduction(targetAbilities),
    attachedInfectedCount: target.attached.length,
    inventoryCount: target.inventory.length,
    characterDamage: Math.max(target.maxHp - target.hp, 0),
    characterAbilities: targetAbilities,
    characterXp: target.xp ?? 0,
  });

  if (outcome.kind === 'insufficientAmmo') return state;

  // Weapons leave their owner's hand and join that owner's play area.
  const targetWeapons = weaponIds.filter(id => target.hand.includes(id));
  const sherryWeapons = weaponIds.filter(id => sherry.hand.includes(id));
  const stripWeapons = (p: PlayerState): PlayerState =>
    ({ ...p, hand: p.hand.filter(id => !weaponIds.includes(id)) });

  const ammoSpent = weapons.reduce((sum, w) => sum + w.ammoReq, 0);
  let next: GameState = {
    ...state,
    seats: state.seats.map(s => {
      if (s.seat === targetSeat) return stripWeapons({ ...s, playArea: [...s.playArea, ...targetWeapons] });
      if (s.seat === sherrySeat) return stripWeapons({ ...s, playArea: [...s.playArea, ...sherryWeapons] });
      return s;
    }),
  };
  next = {
    ...next,
    seats: next.seats.map(s => (s.seat === sherrySeat ? { ...s, turnAmmo: Math.max(s.turnAmmo - ammoSpent, 0) } : s)),
  };

  if (outcome.kind === 'nonInfected') {
    // The exploring player decides, exactly as in a normal explore.
    return {
      ...next,
      mansionDeck,
      mansionBottom,
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
    const bottomed = sendToBottom({ deck: next.mansionDeck, bottom: next.mansionBottom }, revealedId);
    next = { ...next, mansionDeck: bottomed.deck, mansionBottom: bottomed.bottom };
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
