import { describe, it, expect } from 'vitest';
import { validateAction } from './validate';
import type { GameState, CardInstance, CardDef, PlayerState, Action } from '../types';

function seat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s, name: 'P' + s, controller: 'human',
    characterInstanceId: 'c' + s, hp: 100, maxHp: 100, decorations: 0, level: 1,
    turnAmmo: 0, turnGold: over.turnGold ?? 50, actionsLeft: over.actionsLeft ?? 1,
    buysLeft: over.buysLeft ?? 1, exploresLeft: over.exploresLeft ?? 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: [], hand: over.hand ?? ['a-1', 'i-1', 'm-1', 'w-1', 'w-2'],
    discard: [], playArea: [], downed: over.downed ?? false, dead: over.dead ?? false,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'ac-1':  { id: 'ac-1', name: 'Deadly Aim', type: 'action', set: 'premier', text: '', copies: 5, cost: 50, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] },
  'it-1':  { id: 'it-1', name: 'Green Herb', type: 'item', set: 'premier', text: '', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  'am-1':  { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: '', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'we-1':  { id: 'we-1', name: 'Handgun', type: 'weapon', set: 'premier', text: '', copies: 9, cost: 20, ammoReq: 20, damage: 10 },
  'we-2':  { id: 'we-2', name: 'AMG', type: 'weapon', set: 'premier', text: '', copies: 4, cost: 30, ammoReq: 40, damage: 20 },
  'ma-1':  { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 20, attack: 20, decorations: 1 },
  'ch-1':  { id: 'ch-1', name: 'Chris', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 }] },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: 1, phase: over.phase ?? 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: ['mkr-1'] } },
    mansionDeck: ['ma-1i'], mansionBottom: [], removed: [],
    cards: { 'a-1': inst('a-1', 'ac-1'), 'i-1': inst('i-1', 'it-1'), 'm-1': inst('m-1', 'am-1'), 'm-2': inst('m-2', 'am-1'), 'w-1': inst('w-1', 'we-1'), 'w-2': inst('w-2', 'we-2'), 'mkr-1': inst('mkr-1', 'we-1'), 'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'), 'ma-1i': inst('ma-1i', 'ma-1') },
    cardDefs: DEFS, prompts: over.prompts ?? [], winners: [], log: [],
  };
}

describe('validateAction', () => {
  it('playActionCard ok', () => {
    expect(validateAction(baseState(), { type: 'playActionCard', seat: 0, instanceId: 'a-1' })).toEqual({ ok: true });
  });

  it('playActionCard wrong phase', () => {
    expect(validateAction(baseState({ phase: 'setup' }), { type: 'playActionCard', seat: 0, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playActionCard: not in main phase' });
  });

  it('playActionCard wrong seat', () => {
    expect(validateAction(baseState(), { type: 'playActionCard', seat: 1, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playActionCard: not your turn' });
  });

  it('playActionCard no actions', () => {
    expect(validateAction(baseState({ seat0: { actionsLeft: 0 } }), { type: 'playActionCard', seat: 0, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playActionCard: no actions left' });
  });

  it('playActionCard card not in hand', () => {
    expect(validateAction(baseState({ seat0: { hand: [] } }), { type: 'playActionCard', seat: 0, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playActionCard: card not in hand: a-1' });
  });

  it('playActionCard not an action', () => {
    expect(validateAction(baseState(), { type: 'playActionCard', seat: 0, instanceId: 'i-1' })).toEqual({ ok: false, reason: 'playActionCard: not an action card: i-1' });
  });

  it('playActionCard unknown card', () => {
    expect(validateAction(baseState({ seat0: { hand: ['zzz'] } }), { type: 'playActionCard', seat: 0, instanceId: 'zzz' })).toEqual({ ok: false, reason: 'playActionCard: unknown card: zzz' });
  });

  it('playItem ok', () => {
    expect(validateAction(baseState(), { type: 'playItem', seat: 0, instanceId: 'i-1' })).toEqual({ ok: true });
  });

  it('playItem ok with zero actions', () => {
    expect(validateAction(baseState({ seat0: { actionsLeft: 0 } }), { type: 'playItem', seat: 0, instanceId: 'i-1' })).toEqual({ ok: true });
  });

  it('playItem wrong type', () => {
    expect(validateAction(baseState(), { type: 'playItem', seat: 0, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playItem: not an item card: a-1' });
  });

  it('playAmmo ok', () => {
    expect(validateAction(baseState(), { type: 'playAmmo', seat: 0, instanceId: 'm-1' })).toEqual({ ok: true });
  });

  it('playAmmo wrong type', () => {
    expect(validateAction(baseState(), { type: 'playAmmo', seat: 0, instanceId: 'i-1' })).toEqual({ ok: false, reason: 'playAmmo: not an ammo card: i-1' });
  });

  it('explore ok', () => {
    expect(validateAction(baseState({ seat0: { hand: ['w-1', 'm-1', 'm-2'] } }), { type: 'explore', seat: 0, weapons: ['w-1'], ammoCards: ['m-1', 'm-2'], exploreCount: 1 })).toEqual({ ok: true });
  });

  it('explore insufficient ammo', () => {
    expect(validateAction(baseState(), { type: 'explore', seat: 0, weapons: ['w-1'], ammoCards: ['m-1'], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: insufficient ammo' });
  });

  it('explore no weapons', () => {
    expect(validateAction(baseState(), { type: 'explore', seat: 0, weapons: [], ammoCards: [], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: no weapons' });
  });

  it('explore weapon not in hand', () => {
    expect(validateAction(baseState({ seat0: { hand: ['m-1'] } }), { type: 'explore', seat: 0, weapons: ['w-1'], ammoCards: [], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: weapon not in hand: w-1' });
  });

  it('explore not a weapon', () => {
    expect(validateAction(baseState(), { type: 'explore', seat: 0, weapons: ['a-1'], ammoCards: [], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: not a weapon: a-1' });
  });

  it('explore duplicate weapon', () => {
    expect(validateAction(baseState(), { type: 'explore', seat: 0, weapons: ['w-1', 'w-1'], ammoCards: ['m-1'], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: duplicate weapon: w-1' });
  });

  it('explore ammo card not in hand', () => {
    expect(validateAction(baseState({ seat0: { hand: ['w-1'] } }), { type: 'explore', seat: 0, weapons: ['w-1'], ammoCards: ['m-1'], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: ammo card not in hand: m-1' });
  });

  it('explore not an ammo card', () => {
    expect(validateAction(baseState(), { type: 'explore', seat: 0, weapons: ['w-1'], ammoCards: ['a-1'], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: not an ammo card: a-1' });
  });

  it('buy ok', () => {
    expect(validateAction(baseState(), { type: 'buy', seat: 0, pileId: 'hg' })).toEqual({ ok: true });
  });

  it('buy insufficient gold', () => {
    expect(validateAction(baseState({ seat0: { turnGold: 10 } }), { type: 'buy', seat: 0, pileId: 'hg' })).toEqual({ ok: false, reason: 'buy: insufficient gold' });
  });

  it('buy no buys left', () => {
    expect(validateAction(baseState({ seat0: { buysLeft: 0 } }), { type: 'buy', seat: 0, pileId: 'hg' })).toEqual({ ok: false, reason: 'buy: no buys left' });
  });

  it('buy unknown pile', () => {
    expect(validateAction(baseState(), { type: 'buy', seat: 0, pileId: 'nope' })).toEqual({ ok: false, reason: 'buy: unknown pile: nope' });
  });

  it('buy empty pile', () => {
    expect(validateAction(baseState({ marketPiles: { hg: { pileId: 'hg', cards: [] } } }), { type: 'buy', seat: 0, pileId: 'hg' })).toEqual({ ok: false, reason: 'buy: empty pile: hg' });
  });

  it('useCharacterAbility ok', () => {
    expect(validateAction(baseState(), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: true });
  });

  it('useCharacterAbility bad index', () => {
    expect(validateAction(baseState(), { type: 'useCharacterAbility', seat: 0, abilityIndex: 5 })).toEqual({ ok: false, reason: 'useCharacterAbility: bad ability index: 5' });
  });

  it('useCharacterAbility wrong seat', () => {
    expect(validateAction(baseState(), { type: 'useCharacterAbility', seat: 1, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: not your turn' });
  });

  it('endTurn ok', () => {
    expect(validateAction(baseState(), { type: 'endTurn', seat: 0 })).toEqual({ ok: true });
  });

  it('endTurn wrong seat', () => {
    expect(validateAction(baseState(), { type: 'endTurn', seat: 1 })).toEqual({ ok: false, reason: 'endTurn: not your turn' });
  });

  it('endTurn setup phase', () => {
    expect(validateAction(baseState({ phase: 'setup' }), { type: 'endTurn', seat: 0 })).toEqual({ ok: false, reason: 'endTurn: not in main phase' });
  });

  it('chooseOption ok', () => {
    expect(validateAction(baseState({ prompts: [{ id: 'p1', seat: 0, text: 't', options: ['A', 'B'] }] }), { type: 'chooseOption', seat: 0, promptId: 'p1', option: 1 })).toEqual({ ok: true });
  });

  it('chooseOption unknown prompt', () => {
    expect(validateAction(baseState(), { type: 'chooseOption', seat: 0, promptId: 'p9', option: 0 })).toEqual({ ok: false, reason: 'chooseOption: unknown prompt: p9' });
  });

  it('chooseOption not your prompt', () => {
      expect(validateAction(baseState({ prompts: [{ id: 'p1', seat: 1, text: 't', options: ['A'] }] }), { type: 'chooseOption', seat: 0, promptId: 'p1', option: 0 })).toEqual({ ok: false, reason: 'chooseOption: not your prompt' });
    });

    it('chooseOption bad option', () => {
      expect(validateAction(baseState({ prompts: [{ id: 'p1', seat: 0, text: 't', options: ['A'] }] }), { type: 'chooseOption', seat: 0, promptId: 'p1', option: 2 })).toEqual({ ok: false, reason: 'chooseOption: bad option: 2' });
    });

  it('unknown seat', () => {
    expect(validateAction(baseState(), { type: 'endTurn', seat: 9 })).toEqual({ ok: false, reason: 'endTurn: unknown seat: 9' });
  });

  it('dead player', () => {
    expect(validateAction(baseState({ seat0: { dead: true } }), { type: 'playActionCard', seat: 0, instanceId: 'a-1' })).toEqual({ ok: false, reason: 'playActionCard: player is dead' });
  });
});
