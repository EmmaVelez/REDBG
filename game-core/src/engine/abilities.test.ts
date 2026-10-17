import { describe, expect, it } from 'vitest';
import {
  characterAbilities,
  ammoReqForWeapon,
  requiredAmmoForWeapons,
  passiveDamageBonus,
  exploreGoldBonus,
  ammunitionCardBonus,
  explosivesGoToDiscard,
} from './abilities';
import { exploreDamage } from './explore';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { setup } from './game';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { GameState, CardDef, PlayerState, CharacterAbility } from '../types';

/**
 * Batch-1 passive abilities (engine enforcement):
 * - Leon L1 pistols -10 ammoReq; Sheva L2 rifles -20 ammoReq (ammoReqForWeapon)
 * - Barry L2 magnums +20 dmg; Krauser L2 knives +5 dmg (passiveDamageBonus)
 * - Jill L1 explosives +5 dmg; Jill L2 explosives to discard not trash
 * - Chris L2 +5 dmg per Infected fought (exploreCount)
 * - Wesker L1 +20 Gold on explore
 * - Claire L1/L2 ammo cards give +10 Ammo/+10 Gold
 * Level gating: every helper reads abilitiesForLevel, so locked tiers do nothing.
 */

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const pistol = def('wp', { ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'] });
const rifle = def('wr', { ammoReq: 50, damage: 20, weaponTags: ['gun', 'rifle'] });
const magnum = def('wm', { ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'] });
const knife = def('wk', { ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'] });
const grenade = def('wg', { ammoReq: 0, damage: 15, weaponTags: ['explosive'] });
const ammoCard = def('am', { type: 'ammunition', bonuses: { ammo: 10, gold: 10 } });

const leonL1: CharacterAbility[] = [{ kind: 'ammoReqReduction', tag: 'pistol', amount: 10, level: 1 }];
const shevaL2: CharacterAbility[] = [{ kind: 'ammoReqReduction', tag: 'rifle', amount: 20, level: 2 }];
const barryL2: CharacterAbility[] = [{ kind: 'weaponTagPlusDamage', tag: 'magnum', amount: 20, level: 2 }];
const krauserL2: CharacterAbility[] = [{ kind: 'weaponTagPlusDamage', tag: 'knife', amount: 5, level: 2 }];
const jillL1: CharacterAbility[] = [{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }];
const jillL2: CharacterAbility[] = [{ kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }];
const chrisL2: CharacterAbility[] = [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 2 }];
const weskerL1: CharacterAbility[] = [{ kind: 'exploreGoldBonus', amount: 20, level: 1 }];
const claireL1: CharacterAbility[] = [{ kind: 'ammunitionBonus', ammoAmount: 10, goldAmount: 0, level: 1 }];
const claireL2: CharacterAbility[] = [{ kind: 'ammunitionBonus', ammoAmount: 0, goldAmount: 10, level: 2 }];

describe('ammoReqForWeapon', () => {
  it('Leon L1: pistols cost 10 less ammo (20 -> 10)', () => {
    expect(ammoReqForWeapon(leonL1, pistol)).toBe(10);
  });
  it('reductions never go below 0', () => {
    const cheapPistol = def('wc', { ammoReq: 5, weaponTags: ['pistol'] });
    expect(ammoReqForWeapon(leonL1, cheapPistol)).toBe(0);
  });
  it('non-matching tags unaffected (Leon vs rifle)', () => {
    expect(ammoReqForWeapon(leonL1, rifle)).toBe(50);
  });
  it('Sheva L2: rifles cost 20 less (50 -> 30)', () => {
    expect(ammoReqForWeapon(shevaL2, rifle)).toBe(30);
  });
  it('no abilities: base cost', () => {
    expect(ammoReqForWeapon([], pistol)).toBe(20);
  });
});

describe('passiveDamageBonus', () => {
  it('Barry L2: each magnum +20', () => {
    expect(passiveDamageBonus(barryL2, [magnum], 0)).toBe(20);
    expect(passiveDamageBonus(barryL2, [magnum, magnum], 0)).toBe(40);
  });
  it('Krauser L2: each knife +5', () => {
    expect(passiveDamageBonus(krauserL2, [knife], 0)).toBe(5);
  });
  it('Jill L1: each explosive +5 (FAQ: applies to Grenade)', () => {
    expect(passiveDamageBonus(jillL1, [grenade], 0)).toBe(5);
    expect(passiveDamageBonus(jillL1, [grenade, grenade], 0)).toBe(10);
  });
  it('Chris L2: +5 per Infected fought', () => {
    expect(passiveDamageBonus(chrisL2, [knife], 1)).toBe(5);
    expect(passiveDamageBonus(chrisL2, [knife], 2)).toBe(10);
  });
  it('non-matching weapons get nothing', () => {
    expect(passiveDamageBonus(barryL2, [pistol], 0)).toBe(0);
  });
});

describe('exploreGoldBonus / ammunitionCardBonus / explosivesGoToDiscard', () => {
  it('Wesker L1: +20 Gold per explore', () => {
    expect(exploreGoldBonus(weskerL1)).toBe(20);
    expect(exploreGoldBonus([])).toBe(0);
  });
  it('Claire L1: ammo cards +10 Ammo; L2: +10 Gold', () => {
    expect(ammunitionCardBonus(claireL1, ammoCard)).toEqual({ ammo: 10, gold: 0 });
    expect(ammunitionCardBonus(claireL2, ammoCard)).toEqual({ ammo: 0, gold: 10 });
    expect(ammunitionCardBonus([...claireL1, ...claireL2], ammoCard)).toEqual({ ammo: 10, gold: 10 });
  });
  it('Claire bonus does not apply to non-ammo cards', () => {
    expect(ammunitionCardBonus(claireL1, pistol)).toEqual({ ammo: 0, gold: 0 });
  });
  it('Jill L2: explosives go to discard', () => {
    expect(explosivesGoToDiscard(jillL2)).toBe(true);
    expect(explosivesGoToDiscard(jillL1)).toBe(false);
    expect(explosivesGoToDiscard([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: real setup() states driven through applyAction
// ---------------------------------------------------------------------------

function gameWith(characterCardId: string, seed = 5): GameState {
  return setup(
    {
      seed,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
        { name: 'Foe', controller: 'human' },
      ],
    },
    PREMIER_CARDS,
    FIRST_TIMER_PILES
  );
}

/** Force level + hand + pools for deterministic ability tests. */
function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return {
    ...s,
    seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)),
  };
}

function findHand(s: GameState, type: CardDef['type'], tag?: string): string | undefined {
  const p = s.seats[0];
  if (p === undefined) return undefined;
  return p.hand.find(id => {
    const inst = s.cards[id];
    if (inst === undefined) return false;
    const d = s.cardDefs[inst.cardId];
    if (d?.type !== type) return false;
    return tag === undefined || (d.weaponTags ?? []).includes(tag as never);
  });
}

describe('passive abilities through applyAction (level-gated)', () => {
  it('Claire L1: playing an ammo card grants +10 extra Ammo (L1 only)', () => {
    const s = gameWith('ch-003');
    const ammo = findHand(s, 'ammunition');
    expect(ammo).toBeDefined();
    if (ammo === undefined) return;
    // level 0: no bonus — ammo x10 gives just its +10
    const l0 = applyAction(tune(s, { level: 0 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l0.seats[0]?.turnAmmo).toBe(10);
    // level 1: +10 extra ammo
    const l1 = applyAction(tune(s, { level: 1 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l1.seats[0]?.turnAmmo).toBe(20);
    // level 2: also +10 gold from the ammo card's own +10 => 20 gold
    const l2 = applyAction(tune(s, { level: 2 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l2.seats[0]?.turnAmmo).toBe(20);
    expect(l2.seats[0]?.turnGold).toBe(20);
  });

  it('Wesker L1: exploring grants +20 Gold that turn (level-gated)', () => {
    const s = gameWith('ch-001');
    const weapon = findHand(s, 'weapon');
    expect(weapon).toBeDefined();
    if (weapon === undefined) return;
    // level 0: no bonus
    const l0 = applyAction(tune(s, { level: 0 as const, turnAmmo: 90, turnGold: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(l0.seats[0]?.turnGold).toBe(0);
    // level 1: +20 gold on explore
    const l1 = applyAction(tune(s, { level: 1 as const, turnAmmo: 90, turnGold: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(l1.seats[0]?.turnGold).toBe(20);
  });

  it('explosive weapons are trashed after use; Jill L2 sends them to discard instead', () => {
    // Use a non-Jill character first: grenade used in explore goes to removed.
    const s = gameWith('ch-008'); // Chris (level 0, no interference)
    const grenaded = tune(s, {
      level: 0 as const,
      turnAmmo: 90,
      hand: ['we-001#1', ...(s.seats[0]?.hand.filter(id => id !== 'we-001#1') ?? [])],
    });
    // Ensure a grenade instance is registered in hand zone for the fixture
    const withGrenade: GameState = {
      ...grenaded,
      cards: {
        ...grenaded.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const after = applyAction(withGrenade, { type: 'explore', seat: 0, weapons: ['we-001#1'], exploreCount: 1 });
    expect(after.removed).toContain('we-001#1');
    expect(after.seats[0]?.playArea).not.toContain('we-001#1');

    // Jill at L2: the same grenade goes to her discard, not removed.
    const jill = gameWith('ch-009');
    const jillTuned: GameState = {
      ...tune(jill, {
        level: 2 as const,
        decorations: 8,
        turnAmmo: 90,
        hand: ['we-001#1', ...(jill.seats[0]?.hand.filter(id => id !== 'we-001#1') ?? [])],
      }),
      cards: {
        ...jill.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const afterJill = applyAction(jillTuned, { type: 'explore', seat: 0, weapons: ['we-001#1'], exploreCount: 1 });
    expect(afterJill.removed).not.toContain('we-001#1');
    expect(afterJill.seats[0]?.discard).toContain('we-001#1');
  });

  it('Jill L1 explosive +5 damage flows through exploreDamage', () => {
    const jill = gameWith('ch-009');
    const withGrenade: GameState = {
      ...tune(jill, { level: 0 as const, turnAmmo: 0 }),
      cards: {
        ...jill.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    // level 0: grenade base damage 15
    expect(exploreDamage(withGrenade, 0, ['we-001#1'])).toBe(15);
    // level 1: +5 per explosive
    const l1 = { ...withGrenade, seats: withGrenade.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(exploreDamage(l1, 0, ['we-001#1'])).toBe(20);
  });

  it('Leon L1 pistol ammo reduction flows through requiredAmmoForWeapons', () => {
    const leon0 = gameWith('ch-002');
    // Force a Handgun (we-009, pistol, ammoReq 20) into Leon's hand.
    const leon: GameState = {
      ...tune(leon0, { hand: ['we-009#1', ...(leon0.seats[0]?.hand ?? [])], turnAmmo: 90 }),
      cards: {
        ...leon0.cards,
        'we-009#1': { instanceId: 'we-009#1', cardId: 'we-009', location: { zone: 'hand', index: 0 } },
      },
    };
    const defs = (s: GameState) => (id: string): CardDef | undefined => {
      const inst = s.cards[id];
      return inst === undefined ? undefined : s.cardDefs[inst.cardId];
    };
    // level 0: full 20 ammo required
    expect(requiredAmmoForWeapons(leon, 0, ['we-009#1'], defs(leon))).toBe(20);
    // level 1: pistols -10 => 10
    const l1 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(requiredAmmoForWeapons(l1, 0, ['we-009#1'], defs(l1))).toBe(10);
    // And validate honors it: explore with exactly 10 ammo is legal at L1, not at L0.
    const tenAmmoL0 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 10 } : p)) };
    const tenAmmoL1 = { ...l1, seats: l1.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 10 } : p)) };
    expect(validateAction(tenAmmoL0, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(false);
    expect(validateAction(tenAmmoL1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(true);
  });

  it('characterAbilities is level-gated', () => {
    const leon = gameWith('ch-002');
    expect(characterAbilities(leon, 0)).toEqual([]); // fresh = level 0
    const l1 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(characterAbilities(l1, 0).map(a => a.kind)).toEqual(['ammoReqReduction']);
    const l2 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 2 as const } : p)) };
    // L2 keeps L1: ammoReqReduction + generic (double-use not encoded yet).
    expect(characterAbilities(l2, 0).map(a => a.kind).sort()).toEqual(['ammoReqReduction', 'generic']);
  });
});