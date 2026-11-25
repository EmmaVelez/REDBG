import { describe, it, expect } from 'vitest';
import type { GameState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { CUSTOM_CARDS } from '../data/custom';
import { OUTBREAK_CARDS } from '../data/outbreak';

/**
 * Custom characters batch (2026-11-25):
 * - cc-002 Javier Hidalgo: 100 HP, gates 3/6. L1 reveal a "Machine Gun" Weapon
 *   from hand (it stays there) for +2 cards, once per turn. L2 +10 damage to
 *   all his "Machine Gun" weapons.
 * - fch-003 Richard Aiken: 80 HP, gates 3/7. L1 no turn skip after being
 *   fatally wounded (the recovery turn is played). L2 a fatally wounding
 *   attack deals 10 less damage — over 0 Health means no faint.
 * - fch-007 Jill Valentine (S.T.A.R.S.): 70 HP, gates 4/7. L1 +1 Buy and
 *   Gold x10 every turn. L2 when she explores she may look at one player's
 *   top Inventory card and take a Weapon.
 */

function build(characterCardId: string): GameState {
  const players = [
    { name: 'A', controller: 'human' as const, characterCardId },
    { name: 'B', controller: 'human' as const, characterCardId: 'ch-003' },
  ];
  return startTurn(setup(
    { seed: 7, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS, ...OUTBREAK_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  ));
}

/** Registers a fresh card instance in `zone` and returns its instance id. */
function addCard(s: GameState, cardId: string, zone: 'hand' | 'inventory' | 'mansionDeck', seat: number): string {
  const id = `${cardId}#t${s.version}-${seat}`;
  const cards = {
    ...s.cards,
    [id]: { instanceId: id, cardId, location: { zone, index: 0 } as const },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (s as any).cards = cards;
  return id;
}

function withSeat(s: GameState, seat: number, patch: Partial<GameState['seats'][number]>): GameState {
  return { ...s, seats: s.seats.map((st, i) => (i === seat ? { ...st, ...patch } : st)) };
}

describe('CC-002 Javier Hidalgo', () => {
  const ABILITY_REVEAL = 0;
  const ABILITY_DAMAGE = 1;

  it('is a 100-HP custom character with gates 3/6 and both ability kinds', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cc-002');
    expect(c).toEqual(expect.objectContaining({
      id: 'cc-002',
      name: 'Javier Hidalgo',
      type: 'character',
      set: 'custom',
      maxHp: 100,
      level1At: 3,
      level2At: 6,
      abilities: [
        { kind: 'revealWeaponTagFromHandForCards', tag: 'machineGun', amount: 2, level: 1 },
        { kind: 'plusDamageForWeaponTag', tag: 'machineGun', amount: 10, level: 2 },
      ],
    }));
  });

  it('L1 is rejected without a Machine Gun weapon in hand', () => {
    const s = withSeat(build('cc-002'), 0, { level: 1 });
    expect(() => applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: ABILITY_REVEAL })).toThrow();
  });

  it('L1 reveals a Machine Gun from hand, draws 2 and stays once-per-turn', () => {
    let s = withSeat(build('cc-002'), 0, { level: 1 });
    const we = addCard(s, 'we-011', 'hand', 0); // Assault Machine Gun
    s = withSeat(s, 0, { hand: [...s.seats[0]!.hand, we], turnAmmo: 40 });
    const before = s.seats[0]!.hand.length;

    const prompted = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: ABILITY_REVEAL });
    const peek = prompted.prompts.find(p => p.payload?.kind === 'revealWeaponTagFromHandForCards');
    expect(peek).toBeDefined();
    expect(peek!.options).toContain(we);
    expect(peek!.options).toContain('Decline');

    const resolved = applyAction(prompted, { type: 'chooseOption', seat: 0, promptId: peek!.id, option: peek!.options.indexOf(we) });
    // +2 cards drawn; the revealed weapon stays in hand.
    expect(resolved.seats[0]!.hand.length).toBe(before + 2);
    expect(resolved.seats[0]!.hand).toContain(we);
    // the reveal is recorded on the log for the peek overlay
    const lastReveals = resolved.log[resolved.log.length - 1]?.reveals ?? [];
    expect(lastReveals.some((r: { instanceId: string }) => r.instanceId === we)).toBe(true);

    // once per turn: a second activation is rejected
    expect(() => applyAction(resolved, { type: 'useCharacterAbility', seat: 0, abilityIndex: ABILITY_REVEAL })).toThrow();
  });

  it('L2 gives his Machine Gun weapons +10 (preview), only at level 2', () => {
    const l1 = withSeat(build('cc-002'), 0, { level: 1 });
    const we1 = addCard(l1, 'we-011', 'hand', 0);
    const sL1 = withSeat({ ...l1, cards: { ...l1.cards } }, 0, { hand: [...l1.seats[0]!.hand, we1] });
    expect(exploreDamage(sL1, 0, [we1])).toBe(20); // base 20, no bonus at L1

    const l2 = withSeat(build('cc-002'), 0, { level: 2 });
    const we2 = addCard(l2, 'we-011', 'hand', 0);
    const sL2 = withSeat(l2, 0, { hand: [...l2.seats[0]!.hand, we2] });
    expect(exploreDamage(sL2, 0, [we2])).toBe(30); // 20 + 10
  });
});

describe('FCH-003 Richard Aiken', () => {
  it('is an 80-HP custom character with gates 3/7 and both ability kinds', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'fch-003');
    expect(c).toEqual(expect.objectContaining({
      id: 'fch-003',
      name: 'Richard Aiken',
      type: 'character',
      set: 'custom',
      maxHp: 80,
      level1At: 3,
      level2At: 7,
      abilities: [
        { kind: 'noTurnSkipAfterDowned', level: 1 },
        { kind: 'fatalWoundDamageReduction', amount: 10, level: 2 },
      ],
    }));
  });

  function downedRichard(level: 0 | 1 | 2): GameState {
    const s = withSeat(build('fch-003'), 0, { level });
    // fold Richard's hand + discard into the inventory like a real flipDown
    const sh = s.seats[0]!;
    const inventory = [...sh.inventory, ...sh.hand, ...sh.discard];
    return withSeat(s, 0, {
      downed: true,
      hp: 0,
      hand: [],
      discard: [],
      inventory,
    });
  }

  it('L1 plays the recovery turn instead of passing play on', () => {
    const s = downedRichard(1);
    const after = startTurn(s);
    // revived, -20 max Health, hand of 5, and STILL active this turn
    expect(after.seats[0]!.downed).toBe(false);
    expect(after.seats[0]!.hp).toBe(60);
    expect(after.seats[0]!.hand).toHaveLength(5);
    expect(after.activeSeat).toBe(0);
  });

  it('without L1 the recovery turn is skipped (play passes on)', () => {
    const s = downedRichard(0); // ability gated on level 1
    const after = startTurn(s);
    expect(after.seats[0]!.downed).toBe(false);
    expect(after.seats[0]!.hp).toBe(60);
    expect(after.activeSeat).toBe(1); // the turn passed — rulebook "skip this turn"
  });

  it('L2 reduces a fatally wounding attack by 10 and keeps him standing', () => {
    // ma-044 Grave Zombie: 10 HP / 10 attack. Richard (hp 5, level 2, no
    // weapons) takes exactly 10 -> 5 - 10 = -5; -5 + 10 = 5 -> survives.
    let s = withSeat(build('fch-003'), 0, { level: 2, hp: 5 });
    const zombie = addCard(s, 'ma-044', 'mansionDeck', 0);
    s = { ...s, mansionDeck: [zombie, ...s.mansionDeck.filter(id => id !== zombie)] };
    const r = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1, leader: 'main' });
    expect(r.seats[0]!.hp).toBe(5);
    expect(r.seats[0]!.downed).toBe(false);
  });

  it('L2 does not save him from a bigger hit (still downed)', () => {
    // ma-004 Zombie (hp 25 / attack 20): 5 - 20 = -15, -15 + 10 = -5 -> downed.
    let s = withSeat(build('fch-003'), 0, { level: 2, hp: 5 });
    const zombie = addCard(s, 'ma-004', 'mansionDeck', 0);
    s = { ...s, mansionDeck: [zombie, ...s.mansionDeck.filter(id => id !== zombie)] };
    const r = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1, leader: 'main' });
    expect(r.seats[0]!.downed).toBe(true);
  });
});

describe('FCH-007 Jill Valentine (S.T.A.R.S.)', () => {
  it('is a 70-HP custom character with gates 4/7 and both ability kinds', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'fch-007');
    expect(c).toEqual(expect.objectContaining({
      id: 'fch-007',
      name: 'Jill Valentine (S.T.A.R.S.)',
      type: 'character',
      set: 'custom',
      maxHp: 70,
      level1At: 4,
      level2At: 7,
      abilities: [
        { kind: 'plusBuyPassive', amount: 1, level: 1 },
        { kind: 'goldAtTurnStart', amount: 10, level: 1 },
        { kind: 'explorePeekInventoryTopTakeWeapon', level: 2 },
      ],
    }));
  });

  it('L1 grants +1 Buy and Gold x10 every turn', () => {
    const s = withSeat(build('fch-007'), 0, { level: 1 });
    const t = startTurn(s);
    expect(t.seats[0]!.buysLeft).toBe(2);
    expect(t.seats[0]!.turnGold).toBe(10);
  });

  it('L2 offers the inventory peek after an explore and takes a Weapon on accepting', () => {
    let s = withSeat(build('fch-007'), 0, { level: 2 });
    // easy kill so the explore itself raises no extra prompts
    const m = addCard(s, 'ma-044', 'mansionDeck', 0);
    s = { ...s, mansionDeck: [m, ...s.mansionDeck.filter(id => id !== m)] };
    // seat 1's top Inventory card is a weapon
    const handgun = addCard(s, 'we-004', 'inventory', 1);
    const seat1Inv = [handgun, ...s.seats[1]!.inventory];
    s = withSeat(s, 1, { inventory: seat1Inv });

    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1, leader: 'main' });
    const peek = explored.prompts.find(p => p.payload?.kind === 'jillStarsPeek');
    expect(peek).toBeDefined();
    expect(peek!.options).toContain('1');
    expect(peek!.options).not.toContain('0'); // another player, not herself

    const revealed = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: peek!.id, option: peek!.options.indexOf('1') });
    const take = revealed.prompts.find(p => p.payload?.kind === 'jillStarsTake');
    expect(take).toBeDefined();

    const taken = applyAction(revealed, { type: 'chooseOption', seat: 0, promptId: take!.id, option: 0 });
    expect(taken.seats[0]!.hand).toContain(handgun);
    expect(taken.seats[1]!.inventory[0]).not.toBe(handgun);
  });

  it('L2 peek on a non-Weapon top resolves without a take prompt', () => {
    let s = withSeat(build('fch-007'), 0, { level: 2 });
    const m = addCard(s, 'ma-044', 'mansionDeck', 0);
    s = { ...s, mansionDeck: [m, ...s.mansionDeck.filter(id => id !== m)] };
    const ammoTop = addCard(s, 'am-001', 'inventory', 1);
    s = withSeat(s, 1, { inventory: [ammoTop, ...s.seats[1]!.inventory] });

    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1, leader: 'main' });
    const peek = explored.prompts.find(p => p.payload?.kind === 'jillStarsPeek');
    expect(peek).toBeDefined();
    const revealed = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: peek!.id, option: peek!.options.indexOf('1') });
    expect(revealed.prompts.some(p => p.payload?.kind === 'jillStarsTake')).toBe(false);
  });

  it('no peek prompt without an explore', () => {
    const s = withSeat(build('fch-007'), 0, { level: 2 });
    expect(s.prompts.some(p => p.payload?.kind === 'jillStarsPeek')).toBe(false);
  });
});