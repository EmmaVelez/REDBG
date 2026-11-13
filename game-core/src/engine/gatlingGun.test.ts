import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import { exploreDamage } from './explore';
import { exploreAmmoReq } from './ammo';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { ALLIANCE_CARDS } from '../data/alliance';

/**
 * WE-007 Gatling Gun — an `xAmmo` weapon. The player chooses how much of the
 * turn's Ammo to allocate to it, and that amount IS its damage and its cost.
 * Same mechanism as the Alliance machine guns (we-022/we-023).
 */

let counter = 0;
function addWeapon(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function game(over: Partial<PlayerState> = {}): GameState {
  const s = startTurn(setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    PREMIER_CARDS,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  ));
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

describe('WE-007 Gatling Gun data', () => {
  it('is an X-ammo weapon with no static damage effect', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'we-007');
    expect(def).toEqual(expect.objectContaining({
      id: 'we-007',
      type: 'weapon',
      ammoReq: 0,
      damage: 0,
      xAmmo: true,
    }));
    expect(def?.weaponEffects).toBeUndefined();
  });

  it('prints the allocation rule', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'we-007');
    expect(def?.text).toContain('allocate');
  });
});

describe('WE-007 allocation', () => {
  it('costs and deals exactly the allocated amount', () => {
    const { state, id } = addWeapon(game({ turnAmmo: 100 }), 0, 'we-007');
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(0); // the printed req is 0
    expect(exploreDamage(state, 0, [id], 'main', { [id]: 50 })).toBe(50);
    expect(exploreDamage(state, 0, [id], 'main', { [id]: 0 })).toBe(0);

    const action = { type: 'explore' as const, seat: 0, weapons: [id], exploreCount: 1, ammoByWeapon: { [id]: 50 } };
    expect(validateAction(state, action).ok).toBe(true);
    const next = applyAction(state, action);
    expect(next.seats[0]?.turnAmmo).toBe(50);
  });

  it('charges the allocation ON TOP of the other weapons’ costs', () => {
    const g = game({ turnAmmo: 130 });
    const a = addWeapon(g, 0, 'we-007');
    const b = addWeapon(a.state, 0, 'we-009'); // 20 ammo
    const action = {
      type: 'explore' as const,
      seat: 0,
      weapons: [b.id, a.id],
      exploreCount: 1,
      ammoByWeapon: { [a.id]: 50 },
    };
    expect(validateAction(b.state, action).ok).toBe(true);
    const next = applyAction(b.state, action);
    expect(next.seats[0]?.turnAmmo).toBe(60); // 130 - 20 - 50
  });

  it('rejects allocating more Ammo than the seat has', () => {
    const { state, id } = addWeapon(game({ turnAmmo: 100 }), 0, 'we-007');
    const action = { type: 'explore' as const, seat: 0, weapons: [id], exploreCount: 1, ammoByWeapon: { [id]: 200 } };
    expect(validateAction(state, action).ok).toBe(false);
  });

  it('rejects allocating to a weapon that is not in use, or not an X weapon', () => {
    const { state, id } = addWeapon(game({ turnAmmo: 100 }), 0, 'we-007');
    const other = addWeapon(state, 0, 'we-009');
    // Not an X-ammo weapon.
    expect(validateAction(other.state, {
      type: 'explore', seat: 0, weapons: [id, other.id], exploreCount: 1, ammoByWeapon: { [other.id]: 10 },
    }).ok).toBe(false);
    // X-ammo weapon, but not part of the selection.
    expect(validateAction(other.state, {
      type: 'explore', seat: 0, weapons: [other.id], exploreCount: 1, ammoByWeapon: { [id]: 10 },
    }).ok).toBe(false);
  });

  it('rejects a negative or fractional allocation', () => {
    const { state, id } = addWeapon(game({ turnAmmo: 100 }), 0, 'we-007');
    for (const amount of [-10, 1.5, Number.NaN]) {
      expect(validateAction(state, {
        type: 'explore', seat: 0, weapons: [id], exploreCount: 1, ammoByWeapon: { [id]: amount },
      }).ok).toBe(false);
    }
  });

  it('enumerates allocations so the bot can use the weapon', () => {
    const { state, id } = addWeapon(game({ turnAmmo: 100 }), 0, 'we-007');
    const allocations = enumerateLegalActions(state, 0)
      .filter(a => a.type === 'explore' && a.weapons.includes(id))
      .map(a => (a.type === 'explore' ? a.ammoByWeapon?.[id] : undefined));
    // The "spend nothing" variant and the "spend it all" variant.
    expect(allocations).toContain(undefined);
    expect(allocations).toContain(100);
  });

  it('respects a printed cap on the allocation (we-022 caps at 20)', () => {
    const capped = ALLIANCE_CARDS.find(c => c.id === 'we-022');
    expect(capped).toBeDefined();
    const s = startTurn(setup(
      {
        seed: 11,
        players: [
          { name: 'P', controller: 'human', characterCardId: 'ch-002' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      [...PREMIER_CARDS, ...ALLIANCE_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    ));
    const armed = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 100 } : p)) };
    const { state, id } = addWeapon(armed, 0, 'we-022');
    const base = { type: 'explore' as const, seat: 0, weapons: [id], exploreCount: 1 };
    expect(validateAction(state, { ...base, ammoByWeapon: { [id]: 20 } }).ok).toBe(true);
    expect(validateAction(state, { ...base, ammoByWeapon: { [id]: 21 } }).ok).toBe(false);
    expect(exploreDamage(state, 0, [id], 'main', { [id]: 20 })).toBe(20);
  });
});
