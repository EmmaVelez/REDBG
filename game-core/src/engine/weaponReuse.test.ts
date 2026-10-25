import { describe, expect, it } from 'vitest';
import {
  canReuseWeapon,
  explorableWeapons,
  maxWeaponUses,
  remainingWeaponUses,
  weaponUsesThisTurn,
} from './weaponReuse';
import { enumerateLegalActions } from '../ai/enumerate';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { setup, startTurn } from './game';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { GameState } from '../types';

/**
 * Weapon-reuse rules ("use this weapon more than once per turn").
 *
 * Leon L2 `pistolsTwicePerTurn` is the engine's one such ability: a Pistol
 * that has already been used this turn sits in the play area and may be used
 * in a second explore. The rule must hold in all three places that read it —
 * validation, action enumeration, and the UI — so a legal second use can
 * never go missing from the offered actions.
 */

const PISTOL = 'we-009#77';
const KNIFE = 'we-004#78';

function weaponState(over: {
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
      [KNIFE]: { instanceId: KNIFE, cardId: 'we-004', location: { zone: 'hand', index: 1, seat: 0 } },
    },
    seats: s.seats.map((p, i) =>
      i === 0
        ? {
            ...p,
            hand: over.hand ?? [PISTOL, KNIFE],
            playArea: over.playArea ?? [],
            turnAmmo: over.turnAmmo ?? 60,
            exploresLeft: over.exploresLeft ?? 1,
            level: over.level,
            decorations: 6,
          }
        : p,
    ),
  };
  return s;
}

describe('weapon reuse rules', () => {
  it('a hand weapon is not reusable — it is simply in hand', () => {
    const s = weaponState({ level: 2 });
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(false);
    expect(maxWeaponUses(s, 0, PISTOL)).toBe(2); // Leon L2 doubles pistols
    expect(remainingWeaponUses(s, 0, PISTOL)).toBe(2);
  });

  it('a play-area pistol is reusable while it still has a use left', () => {
    let s = weaponState({ level: 2, hand: [PISTOL, KNIFE], turnAmmo: 60, exploresLeft: 2 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(true);
    expect(remainingWeaponUses(s, 0, PISTOL)).toBe(1);
    expect(explorableWeapons(s, 0)).toEqual([KNIFE, PISTOL]);
  });

  it('a play-area weapon without the reuse ability is not reusable', () => {
    // Level 1: no pistolsTwicePerTurn, so the pistol in the play area is dead.
    const s = weaponState({ level: 1, hand: [KNIFE], playArea: [PISTOL], exploresLeft: 2 });
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(false);
    expect(maxWeaponUses(s, 0, PISTOL)).toBe(1);
    expect(explorableWeapons(s, 0)).toEqual([KNIFE]);
  });

  it('a non-pistol play-area weapon is never reusable, even for Leon L2', () => {
    const s = weaponState({ level: 2, hand: [PISTOL], playArea: [KNIFE], exploresLeft: 2 });
    expect(canReuseWeapon(s, 0, KNIFE)).toBe(false);
    expect(explorableWeapons(s, 0)).toEqual([PISTOL]);
  });

  it('the reuse is exhausted after two explores and the weapon drops out', () => {
    let s = weaponState({ level: 2, hand: [], playArea: [PISTOL], turnAmmo: 60, exploresLeft: 3 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(1);
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(true);

    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(2);
    expect(remainingWeaponUses(s, 0, PISTOL)).toBe(0);
    expect(canReuseWeapon(s, 0, PISTOL)).toBe(false);
    expect(explorableWeapons(s, 0)).toEqual([]);
  });

  it('enumeration offers the play-area pistol reuse that validation allows', () => {
    // Regression: validateAction always allowed the second pistol use, but
    // enumerateLegalActions only built combos from hand weapons — so the
    // ability was unreachable in the client and for the bot.
    let s = weaponState({ level: 2, hand: [PISTOL, KNIFE], turnAmmo: 60, exploresLeft: 2 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });

    const combos = enumerateLegalActions(s, 0)
      .filter(a => a.type === 'explore')
      .map(a => [...(a as { weapons: readonly string[] }).weapons].sort().join('+'));
    expect(combos).toContain(KNIFE);
    expect(combos).toContain(PISTOL); // reused from the play area
    expect(combos).toContain([KNIFE, PISTOL].sort().join('+'));
  });

  it('validation and enumeration agree on every generated combo', () => {
    let s = weaponState({ level: 2, hand: [PISTOL, KNIFE], turnAmmo: 60, exploresLeft: 2 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    const combos = enumerateLegalActions(s, 0).filter(a => a.type === 'explore');
    expect(combos.length).toBeGreaterThan(0);
    for (const a of combos) {
      expect(validateAction(s, a)).toEqual({ ok: true });
    }
  });

  it('reuse does not carry across the turn boundary', () => {
    let s = weaponState({ level: 2, hand: [PISTOL], turnAmmo: 60, exploresLeft: 2 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [PISTOL], exploreCount: 1 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(1);
    // End the turn: the play area is cleared and the log scan stops there.
    s = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(weaponUsesThisTurn(s, 0, PISTOL)).toBe(0);
  });
});
