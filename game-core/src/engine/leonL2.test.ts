import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { setup, startTurn } from './game';
import { exploreDamage } from './explore';
import { requiredAmmoForWeapons } from './abilities';
import { weaponUsesThisTurn, remainingWeaponUses, canReuseWeapon, maxWeaponUses } from './weaponReuse';
import { enumerateLegalActions } from '../ai/enumerate';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { CardDef, GameState } from '../types';

/**
 * CH-002 Leon S. Kennedy L2 — `pistolsTwicePerTurn`, per the official Master FAQ:
 *
 *   "When he uses a pistol weapon, you can pay its ammo requirement twice for
 *    that weapon to apply its effect and damage twice."
 *
 * One entry in `action.weapons` is one USE. The same Pistol instance may appear
 * twice in one explore (double ammo, double damage, double effect), and the two
 * uses may instead be split across two explores. The cap is two uses per turn.
 */

const PISTOL = 'we-009#77'; // Handgun: 10 dmg, 20 ammo, pistol
const BURST = 'we-010#79';  // Burst-Fire Handgun: 20 dmg, 30 ammo, +20 when alongside another weapon
const KNIFE = 'we-004#78';  // Combat Knife: 5 dmg, 0 ammo, not a pistol

function leonState(over: {
  readonly level: 0 | 1 | 2;
  readonly hand?: readonly string[];
  readonly playArea?: readonly string[];
  readonly turnAmmo?: number;
  readonly exploresLeft?: number;
}): GameState {
  let s = startTurn(
    setup(
      { seed: 11, players: [{ name: 'Leon', controller: 'human', characterCardId: 'ch-002' }, { name: 'Bot', controller: 'bot' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ),
  );
  s = {
    ...s,
    cards: {
      ...s.cards,
      [PISTOL]: { instanceId: PISTOL, cardId: 'we-009', location: { zone: 'hand', index: 0, seat: 0 } },
      [BURST]: { instanceId: BURST, cardId: 'we-010', location: { zone: 'hand', index: 1, seat: 0 } },
      [KNIFE]: { instanceId: KNIFE, cardId: 'we-004', location: { zone: 'hand', index: 2, seat: 0 } },
    },
    seats: s.seats.map((p, i) =>
      i === 0
        ? {
            ...p,
            hand: over.hand ?? [PISTOL, KNIFE],
            playArea: over.playArea ?? [],
            turnAmmo: over.turnAmmo ?? 60,
            exploresLeft: over.exploresLeft ?? 3,
            level: over.level,
            decorations: 6,
          }
        : p,
    ),
  };
  return s;
}

describe('Leon L2 pistolsTwicePerTurn — official FAQ ruling', () => {
  it('a pistol can be used twice in ONE explore by paying its ammo requirement twice', () => {
    const s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL, PISTOL], exploreCount: 1 })).toEqual({ ok: true });

    const after = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL, PISTOL], exploreCount: 1 });
    // Leon L1: each use costs 20 - 10 = 10 ammo. Two uses = 20.
    expect(after.seats[0]?.turnAmmo).toBe(40);
    // The weapon is ONE card in the play area, not two.
    expect(after.seats[0]?.playArea.filter(id => id === PISTOL)).toEqual([PISTOL]);
    // Both uses are spent.
    expect(weaponUsesThisTurn(after, 0, PISTOL)).toBe(2);
    expect(remainingWeaponUses(after, 0, PISTOL)).toBe(0);
  });

  it('the double use deals double damage', () => {
    const s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    expect(exploreDamage(s, 0, [PISTOL])).toBe(10);
    expect(exploreDamage(s, 0, [PISTOL, PISTOL])).toBe(20);
  });

  it("the weapon's effect applies twice when it is used twice", () => {
    // we-010 Burst-Fire Handgun: "+20 damage when used alongside another Weapon
    // in the same Explore." Used twice, the effect fires once per use.
    const s = leonState({ level: 2, hand: [BURST], turnAmmo: 60, exploresLeft: 2 });
    expect(exploreDamage(s, 0, [BURST])).toBe(20);
    // 20 + 20 base, plus the +20 effect on each of the two uses.
    expect(exploreDamage(s, 0, [BURST, BURST])).toBe(80);
  });

  it('the ammo requirement is paid twice', () => {
    const s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    const defs = (id: string): CardDef | undefined => {
      const inst = s.cards[id];
      return inst === undefined ? undefined : s.cardDefs[inst.cardId];
    };
    expect(requiredAmmoForWeapons(s, 0, [PISTOL], defs)).toBe(10);
    expect(requiredAmmoForWeapons(s, 0, [PISTOL, PISTOL], defs)).toBe(20);
  });

  it('a player who used the pistol once can use it once more in a second explore', () => {
    let s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 3 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(1);
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(true);

    // The unused second use is still available in a later, separate explore.
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 })).toEqual({ ok: true });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(2);

    // ... and a third use is over the cap.
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 }).ok).toBe(false);
  });

  it('a double use spends both uses — no third use in a later explore', () => {
    let s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 3 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL, PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(2);
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 }).ok).toBe(false);
  });

  it('a non-pistol weapon cannot be used twice', () => {
    const s = leonState({ level: 2, hand: [KNIFE], turnAmmo: 60, exploresLeft: 2 });
    expect(maxWeaponUses(s, 0, KNIFE)).toBe(1);
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [KNIFE, KNIFE], exploreCount: 1 }).ok).toBe(false);
  });

  it('without the level 2 ability a pistol cannot be used twice', () => {
    const s = leonState({ level: 1, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    expect(maxWeaponUses(s, 0, PISTOL)).toBe(1);
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL, PISTOL], exploreCount: 1 }).ok).toBe(false);
  });

  it('a double use cannot exceed the remaining uses', () => {
    // One use already spent: only one use remains, so a double is illegal.
    let s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 3 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [PISTOL, PISTOL], exploreCount: 1 }).ok).toBe(false);
  });

  it('enumeration offers the double use that validation allows', () => {
    const s = leonState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    const combos = enumerateLegalActions(s, 0)
      .filter(a => a.type === 'explore')
      .map(a => [...(a as { weapons: readonly string[] }).weapons].sort().join('+'));
    expect(combos).toContain([PISTOL, PISTOL].sort().join('+'));
  });

  it('validation and enumeration agree on every generated combo', () => {
    const s = leonState({ level: 2, hand: [PISTOL, KNIFE], turnAmmo: 60, exploresLeft: 2 });
    const combos = enumerateLegalActions(s, 0).filter(a => a.type === 'explore');
    expect(combos.length).toBeGreaterThan(0);
    for (const a of combos) {
      expect(validateAction(s, a)).toEqual({ ok: true });
    }
  });
});
