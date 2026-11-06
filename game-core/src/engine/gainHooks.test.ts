import { test, expect } from 'vitest';
import { applyAction } from './actions';
import { startTurn } from './game';
import type { GameState, PlayerState, CardInstance, CardDef, Prompt } from '../types';

/**
 * End-to-end coverage for the central gain pipeline: every acquisition path
 * (buy, token grant, ability grant) must fire the on-gain hooks, and AC-021
 * Gathering Forces must route gains to hand for the rest of the turn only.
 */

function seat(over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: 0, name: 'P0', controller: 'human',
    characterInstanceId: 'c0', hp: 100, maxHp: 100,
    decorations: 0, level: 2,
    turnAmmo: 0, turnGold: 50, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: ['inv1', 'inv2', 'inv3'],
    hand: ['h1'], discard: ['d1'], playArea: [], downed: false, dead: false,
    ...over,
  };
}

function seat1(over: Partial<PlayerState> = {}): PlayerState {
  return seat({ seat: 1, name: 'P1', characterInstanceId: 'c1', ...over });
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'discard', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'we-1': { id: 'we-1', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10 },
  'am-1': { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Ammo x10', copies: 28, cost: 10, bonuses: { ammo: 10, gold: 10 } },
  'am-2': { id: 'am-2', name: 'Ammo x30', type: 'ammunition', set: 'premier', text: 'Ammo x30', copies: 10, cost: 50, bonuses: { ammo: 30, gold: 30 } },
  'ac-009': { id: 'ac-009', name: 'Item Management', type: 'action', set: 'premier', text: 'Trash 1 Ammo from hand to gain an Ammo worth 30 more.', copies: 5, cost: 30, actionEffects: [{ kind: 'upgradeAmmoBy30Gold' }] },
  'ac-021': { id: 'ac-021', name: 'Gathering Forces', type: 'action', set: 'alliance', text: '+20 gold, +1 action, +1 buy. Cards you gain this turn go to your hand.', copies: 5, cost: 90, bonuses: { gold: 20, actions: 1, buys: 1 }, actionEffects: [{ kind: 'gainedCardsGoToHand' }] },
  'ma-012': { id: 'ma-012', name: 'Rocket Launcher Case', type: 'token', set: 'premier', text: 'Gain the Rocket Launcher. Trash this token.', copies: 1, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-008' }] },
  'we-008': { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'premier', text: 'Rocket Launcher', copies: 1, cost: 80, ammoReq: 0, damage: 80 },
  'ch-leon2': { id: 'ch-leon2', name: 'Leon (Nightmare)', type: 'character', set: 'nightmare', text: 'Leon', copies: 1, maxHp: 80, level1At: 3, level2At: 6, abilities: [{ kind: 'plusOneCardOnGainCard', level: 2 }] },
};

function mkState(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  const prompts: readonly Prompt[] = over.prompts ?? [];
  return {
    version: 7, seed: 1, rngState: 42, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(over.seat0), seat1(over.seat1)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: ['mkr1'] } },
    mansionDeck: over.mansionDeck ?? [], mansionBottom: [], removed: over.removed ?? [],
    cards: over.cards ?? {
      'c0': inst('c0', 'ch-leon2'), 'c1': inst('c1', 'ch-leon2'),
      'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
      'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
    },
    cardDefs: DEFS, prompts, winners: [], log: [],
  };
}

test('buy fires the on-gain hook (Leon Nightmare L2) and records gainedThisTurn', () => {
  const s = applyAction(mkState(), { type: 'buy', seat: 0, pileId: 'hg' });
  const p = s.seats[0] as PlayerState;
  // bought card keeps its market instance id and lands in discard
  expect(p.discard).toEqual(['d1', 'mkr1']);
  expect(s.cards['mkr1']?.location.zone).toBe('discard');
  // the hook drew exactly one card
  expect(p.hand).toEqual(['h1', 'inv1']);
  expect(p.inventory).toEqual(['inv2', 'inv3']);
  expect(p.gainedThisTurn).toEqual(['mkr1']);
});

test('token grant (Rocket Launcher Case) fires the on-gain hook', () => {
  const base = mkState({
    prompts: [{ id: 'p1', seat: 0, text: 'Take or bottom?', options: ['Take', 'Bottom'], payload: { kind: 'takeOrBottom', instanceId: 'tok1' } }],
    cards: {
      'c0': inst('c0', 'ch-leon2'), 'c1': inst('c1', 'ch-leon2'),
      'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
      'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
      'tok1': { instanceId: 'tok1', cardId: 'ma-012', location: { zone: 'mansionDeck', index: 0 } },
    },
  });
  const s = applyAction(base, { type: 'chooseOption', seat: 0, promptId: 'p1', option: 0 });
  const p = s.seats[0] as PlayerState;
  const granted = 'we-008#g8-0-0';
  expect(p.discard).toContain(granted);
  expect(s.removed).toContain('tok1');
  expect(p.hand).toEqual(['h1', 'inv1']);
  expect(p.gainedThisTurn).toEqual([granted]);
});

test('ability grant (Item Management) fires the on-gain hook', () => {
  const base = mkState({
    seat0: { hand: ['a9', 'am1'], inventory: ['inv1', 'inv2', 'inv3'] },
    cards: {
      'c0': inst('c0', 'ch-leon2'), 'c1': inst('c1', 'ch-leon2'),
      'a9': inst('a9', 'ac-009'), 'am1': inst('am1', 'am-1'), 'am2': inst('am2', 'am-2'),
      'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
      'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
    },
  });
  const played = applyAction(base, { type: 'playActionCard', seat: 0, instanceId: 'a9' });
  const prompt = played.prompts.find(p => p.payload?.kind === 'upgradeAmmoBy30Gold');
  expect(prompt).toBeDefined();
  const s = applyAction(played, { type: 'chooseOption', seat: 0, promptId: prompt?.id ?? '', option: 0 });
  const p = s.seats[0] as PlayerState;
  const gained = 'am-2#g9-0-0';
  expect(p.discard).toContain(gained);
  expect(s.removed).toContain('am1');
  expect(p.hand).toEqual(['inv1']);
  expect(p.gainedThisTurn).toEqual([gained]);
});

test('AC-021 Gathering Forces routes gains to hand for the turn, then resets', () => {
  const base = mkState({
    seat0: { hand: ['a21', 'h1'], turnGold: 0, buysLeft: 1 },
    cards: {
      'c0': inst('c0', 'ch-leon2'), 'c1': inst('c1', 'ch-leon2'),
      'a21': inst('a21', 'ac-021'), 'h1': inst('h1', 'we-1'), 'd1': inst('d1', 'am-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'),
      'mkr1': { instanceId: 'mkr1', cardId: 'we-1', location: { zone: 'marketPile', index: 0 } },
    },
  });
  const played = applyAction(base, { type: 'playActionCard', seat: 0, instanceId: 'a21' });
  expect((played.seats[0] as PlayerState).gainedCardsGoToHand).toBe(true);

  const bought = applyAction(played, { type: 'buy', seat: 0, pileId: 'hg' });
  const p = bought.seats[0] as PlayerState;
  expect(p.discard).not.toContain('mkr1');
  expect(p.hand).toContain('mkr1');

  // Turn ends for both players; seat 0's next turn start clears the flag.
  const after0 = applyAction(bought, { type: 'endTurn', seat: 0 });
  const after1 = applyAction(after0, { type: 'endTurn', seat: 1 });
  const restarted = startTurn(after1);
  expect((restarted.seats[0] as PlayerState).gainedCardsGoToHand).toBe(false);
});
