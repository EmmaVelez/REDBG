import { test, expect } from 'vitest';
import { gainCard } from './gainCard';
import type { GameState, PlayerState, CardInstance, CardDef } from '../types';

function seat(over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: 0, name: 'P0', controller: 'human',
    characterInstanceId: 'c0', hp: 100, maxHp: 100,
    decorations: 0, level: 1,
    turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: ['inv1', 'inv2', 'inv3'],
    hand: ['h1'], discard: ['d1'], playArea: [], downed: false, dead: false,
    ...over,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'discard', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'we-1': { id: 'we-1', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10 },
  'am-1': { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Ammo x10', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'ch-plain': { id: 'ch-plain', name: 'Chris', type: 'character', set: 'premier', text: 'Chris', copies: 1, maxHp: 100 },
  'ch-leon2': { id: 'ch-leon2', name: 'Leon (Nightmare)', type: 'character', set: 'nightmare', text: 'Leon', copies: 1, maxHp: 80, level1At: 3, level2At: 6, abilities: [{ kind: 'plusOneCardOnGainCard', level: 2 }] },
};

function mkState(over: Partial<GameState> & { seat0?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 7, seed: 1, rngState: 42, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(over.seat0)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: ['mkr1'] } },
    mansionDeck: over.mansionDeck ?? [], removed: [],
    cards: over.cards ?? {
      'c0': inst('c0', 'ch-plain'),
      'h1': inst('h1', 'we-1'),
      'd1': inst('d1', 'am-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
      'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
    },
    cardDefs: DEFS, prompts: [], winners: [], log: [],
  };
}

test('gainCard: default destination is discard, instance id follows the convention', () => {
  const s = gainCard(mkState(), { seat: 0, cardId: 'we-1' });
  const p = s.seats[0] as PlayerState;
  const id = 'we-1#g7-0-0';
  expect(p.discard).toContain(id);
  expect(p.gainedThisTurn).toEqual([id]);
  expect(s.cards[id]?.location.zone).toBe('discard');
});

test('gainCard: explicit destinations route to hand / top / bottom of inventory', () => {
  const toHand = gainCard(mkState(), { seat: 0, cardId: 'we-1', destination: 'hand' });
  expect((toHand.seats[0] as PlayerState).hand).toContain('we-1#g7-0-0');
  expect(toHand.cards['we-1#g7-0-0']?.location.zone).toBe('hand');

  const toTop = gainCard(mkState(), { seat: 0, cardId: 'we-1', destination: 'topInventory' });
  expect((toTop.seats[0] as PlayerState).inventory[0]).toBe('we-1#g7-0-0');

  const toBottom = gainCard(mkState(), { seat: 0, cardId: 'we-1', destination: 'bottomInventory' });
  const inv = (toBottom.seats[0] as PlayerState).inventory;
  expect(inv[inv.length - 1]).toBe('we-1#g7-0-0');
});

test('gainCard: count > 1 creates one instance per copy', () => {
  const s = gainCard(mkState(), { seat: 0, cardId: 'am-1', count: 3 });
  const p = s.seats[0] as PlayerState;
  expect(p.discard.filter(id => id.startsWith('am-1#g7-0-'))).toHaveLength(3);
  expect(p.gainedThisTurn).toHaveLength(3);
});

test('gainCard: instanceId moves an existing instance instead of creating one', () => {
  const s = gainCard(mkState(), { seat: 0, cardId: 'we-1', instanceId: 'mkr1' });
  const p = s.seats[0] as PlayerState;
  expect(p.discard).toEqual(['d1', 'mkr1']);
  expect(s.cards['mkr1']?.location.zone).toBe('discard');
  expect(Object.keys(s.cards).filter(k => k.startsWith('we-1#g'))).toHaveLength(0);
  expect(p.gainedThisTurn).toEqual(['mkr1']);
});

test('gainCard: shuffleIntoInventory mixes the card in and consumes RNG', () => {
  const before = mkState();
  const s = gainCard(before, { seat: 0, cardId: 'we-1', destination: 'topInventory', shuffleIntoInventory: true });
  const p = s.seats[0] as PlayerState;
  expect(p.inventory).toHaveLength(4);
  expect(p.inventory).toContain('we-1#g7-0-0');
  expect(s.rngState).not.toBe(before.rngState);
});

test('gainCard: Gathering Forces routes discard gains to hand, other destinations untouched', () => {
  const base = mkState({ seat0: { gainedCardsGoToHand: true } });
  const toHand = gainCard(base, { seat: 0, cardId: 'we-1' });
  const p = toHand.seats[0] as PlayerState;
  expect(p.hand).toContain('we-1#g7-0-0');
  expect(p.discard).not.toContain('we-1#g7-0-0');

  const toTop = gainCard(base, { seat: 0, cardId: 'we-1', destination: 'topInventory' });
  expect((toTop.seats[0] as PlayerState).inventory[0]).toBe('we-1#g7-0-0');
});

test('gainCard: Leon (Nightmare) L2 draws one card on a gain, and the hook draw does not re-trigger', () => {
  const s = gainCard(mkState({ seat0: { characterInstanceId: 'cleon', level: 2 }, cards: {
    'cleon': inst('cleon', 'ch-leon2'),
    'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
    'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
    'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
  } }), { seat: 0, cardId: 'we-1', reason: 'buy' });
  const p = s.seats[0] as PlayerState;
  expect(p.discard).toContain('we-1#g7-0-0');
  // exactly one card drawn by the hook (inv1), not a chain
  expect(p.hand).toHaveLength(2);
  expect(p.hand).toContain('inv1');
  expect(p.inventory).toEqual(['inv2', 'inv3']);
});

test('gainCard: reason "hook" suppresses the on-gain hook', () => {
  const s = gainCard(mkState({ seat0: { characterInstanceId: 'cleon', level: 2 }, cards: {
    'cleon': inst('cleon', 'ch-leon2'),
    'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
    'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
    'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
  } }), { seat: 0, cardId: 'we-1', reason: 'hook' });
  const p = s.seats[0] as PlayerState;
  expect(p.hand).toEqual(['h1']);
});
