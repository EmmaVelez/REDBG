import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { exploreAmmoReq } from './ammo';
import { canBePartner } from './characters';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * FCH-002 HUNK — "Level 1: All your 'Machine Gun' Weapons get -10 Ammo
 * Requirement. Level 2: If you have more than 100 Ammo, all your 'Machine Gun'
 * Weapons get +10 Damage." (gates 2 / 5, 100 Health).
 *
 * Both abilities are pure passives, so they are exercised through the shared
 * `exploreDamage` helper AND through a real explore in `applyAction` (the
 * reducer path) — the same split BC-001 Billy Coen uses.
 */

const HUNK = CUSTOM_CARDS.find(c => c.id === 'fch-002');

function hunkGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'fch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck', index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

describe('FCH-002 HUNK data', () => {
  it('matches the printed card (100 Health, gates 2 / 5)', () => {
    expect(HUNK).toEqual(expect.objectContaining({
      id: 'fch-002', name: 'HUNK', type: 'character', set: 'custom', copies: 1,
      maxHp: 100, level1At: 2, level2At: 5,
    }));
    expect(HUNK?.abilities).toEqual([
      { kind: 'ammoReqReduction', tag: 'machineGun', amount: 10, level: 1 },
      { kind: 'plusDamageForWeaponTagIfAmmoAbove', tag: 'machineGun', threshold: 100, amount: 10, level: 2 },
    ]);
  });

  it('joins the deal pool only when the room selected it', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'fch-002')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['fch-002'] });
    expect(on.some(c => c.id === 'fch-002')).toBe(true);
  });

  it('is a legal Partner (the card prints no restriction)', () => {
    expect(canBePartner(HUNK)).toBe(true);
  });
});

describe('FCH-002 L1: Machine Gun weapons get -10 Ammo Requirement', () => {
  it('cuts the Assault Machine Gun cost from 40 to 30 at level 1', () => {
    const { state, id } = addCard(hunkGame({ level: 1, decorations: 2 }), 0, 'we-011');
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(30);
  });

  it('does not cut it at level 0', () => {
    const { state, id } = addCard(hunkGame({ level: 0, decorations: 0 }), 0, 'we-011');
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(40);
  });

  it('leaves a non-Machine-Gun weapon alone', () => {
    const { state, id } = addCard(hunkGame({ level: 1, decorations: 2 }), 0, 'we-009'); // Handgun
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(20);
  });

  it('makes an explore affordable with exactly the reduced Ammo (applyAction)', () => {
    const { state, ids } = setMansionTop(hunkGame({ level: 1, decorations: 2, hp: 100, turnAmmo: 30 }), ['ma-001']);
    const { state: s1, id } = addCard(state, 0, 'we-011');
    const next = applyAction(s1, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.turnAmmo).toBe(0);
    expect(next.seats[0]?.attached).toContain(ids[0]); // 20 damage >= ma-001's 20 HP
  });
});

describe('FCH-002 L2: +10 Machine Gun damage while Ammo is above 100', () => {
  it('adds +10 to a Machine Gun weapon at 101 Ammo', () => {
    const { state, id } = addCard(hunkGame({ level: 2, decorations: 5, turnAmmo: 101 }), 0, 'we-011');
    expect(exploreDamage(state, 0, [id])).toBe(30);
  });

  it('adds nothing at exactly 100 Ammo', () => {
    const { state, id } = addCard(hunkGame({ level: 2, decorations: 5, turnAmmo: 100 }), 0, 'we-011');
    expect(exploreDamage(state, 0, [id])).toBe(20);
  });

  it('does not touch a non-Machine-Gun weapon', () => {
    const { state, id } = addCard(hunkGame({ level: 2, decorations: 5, turnAmmo: 101 }), 0, 'we-009');
    expect(exploreDamage(state, 0, [id])).toBe(10);
  });

  it('stacks per Machine Gun weapon used', () => {
    let s = hunkGame({ level: 2, decorations: 5, turnAmmo: 101 });
    const ids: string[] = [];
    for (const c of ['we-011', 'we-011']) {
      const r = addCard(s, 0, c);
      s = r.state;
      ids.push(r.id);
    }
    expect(exploreDamage(s, 0, ids)).toBe(60); // 2 x (20 + 10)
  });

  it('is level-gated: level 1 gets no bonus', () => {
    const { state, id } = addCard(hunkGame({ level: 1, decorations: 2, turnAmmo: 101 }), 0, 'we-011');
    expect(exploreDamage(state, 0, [id])).toBe(20);
  });

  it('defeats an Infected it could not at base damage (applyAction)', () => {
    // we-011 deals 20; ma-004 (Zombie Butcher) has 25 HP.
    const { state, ids } = setMansionTop(hunkGame({ level: 2, decorations: 5, hp: 100, turnAmmo: 101 }), ['ma-004']);
    const { state: s1, id } = addCard(state, 0, 'we-011');
    const next = applyAction(s1, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).toContain(ids[0]);
  });

  it('does NOT defeat it at 100 Ammo (applyAction)', () => {
    const { state, ids } = setMansionTop(hunkGame({ level: 2, decorations: 5, hp: 100, turnAmmo: 100 }), ['ma-004']);
    const { state: s1, id } = addCard(state, 0, 'we-011');
    const next = applyAction(s1, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.attached).not.toContain(ids[0]);
  });
});
