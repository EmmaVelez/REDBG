import { describe, it, expect } from 'vitest';
import type { Action, GameState, CardDef, PlayerState, CardInstance } from '../types';
import { chooseGreedyAction } from './policy';
import { evaluateState, MAX_INFECTION_PENALTY } from './evaluate';

/**
 * Bots must treat infection the way they treat Health: carrying counters is a
 * measurable liability, reduction is worth paying for, and a push to the
 * 10-counter cap (permanent Character loss / reanimation) is weighed like a
 * fatal explore — the bot refuses the suicide line.
 */

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'generic', level: 2 }] }),
  'am-1': def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  'we-3': def('we-3', { type: 'weapon', cost: 30, ammoReq: 0, damage: 30 }),
  'ac-raise': def('ac-raise', { type: 'action', cost: 20, bonuses: { actions: 1 }, actionEffects: [{ kind: 'powerOfTVirus' }] }),
  'ac-lower': def('ac-lower', { type: 'action', cost: 30, bonuses: { actions: 1, cards: 1 }, actionEffects: [{ kind: 'injection' }] }),
  'in-1': def('in-1', { type: 'action', copies: 1 }),
  'ma-1': def('ma-1', { type: 'infected', hp: 25, attack: 10, decorations: 1 }),
};

function player(seat: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat, name: 'P' + seat, controller: 'human',
    characterInstanceId: 'ch-1#' + seat, hp: 100, maxHp: 100,
    decorations: 0, level: 1 as const,
    turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'],
    hand: [], discard: [], playArea: [], downed: false, dead: false,
    ...over,
  };
}

function state(seat0: Partial<PlayerState> = {}, seat1: Partial<PlayerState> = {}): GameState {
  const cards: Record<string, CardInstance> = {
    'ch-1#0': { instanceId: 'ch-1#0', cardId: 'ch-1', location: { zone: 'hand' as const, index: 0 } },
    'ch-1#1': { instanceId: 'ch-1#1', cardId: 'ch-1', location: { zone: 'hand' as const, index: 0 } },
    'we-3#w': { instanceId: 'we-3#w', cardId: 'we-3', location: { zone: 'hand' as const, index: 0 } },
    'ac-raise#a': { instanceId: 'ac-raise#a', cardId: 'ac-raise', location: { zone: 'hand' as const, index: 0 } },
    'ac-lower#b': { instanceId: 'ac-lower#b', cardId: 'ac-lower', location: { zone: 'hand' as const, index: 0 } },
    'ma-1#1': { instanceId: 'ma-1#1', cardId: 'ma-1', location: { zone: 'mansionDeck' as const, index: 0 } },
    'ma-1#2': { instanceId: 'ma-1#2', cardId: 'ma-1', location: { zone: 'mansionDeck' as const, index: 0 } },
  };
  const s: GameState = {
    version: 1, seed: 1, rngState: 1, phase: 'main', activeSeat: 0, turnNumber: 1,
    seats: [player(0, seat0), player(1, seat1)],
    marketPiles: {},
    mansionDeck: ['ma-1#1', 'ma-1#2'], removed: [],
    cards, cardDefs: DEFS,
    prompts: [], winners: [], endReason: undefined, log: [],
  };
  return s;
}

/** Gives `seat` `n` infection counters (registered, in the infectionCards zone). */
function infected(n: number): Partial<PlayerState> {
  const cards: Record<string, CardInstance> = {};
  const infectionCards: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `in-1#c${i}`;
    cards[id] = { instanceId: id, cardId: 'in-1', location: { zone: 'hand' as const, index: 0 } };
    infectionCards.push(id);
  }
  return { infectionCards };
}

describe('bot infection scoring (like Health)', () => {
  it('evaluateState penalizes carried counters and accelerates near the cap', () => {
    const base = state({ hand: ['we-3#w'] }, {});
    const clean = evaluateState(base, 0);
    const at4 = evaluateState(state({ hand: ['we-3#w'], ...infected(4) }, {}), 0);
    const at8 = evaluateState(state({ hand: ['we-3#w'], ...infected(8) }, {}), 0);
    const at9 = evaluateState(state({ hand: ['we-3#w'], ...infected(9) }, {}), 0);
    const at10 = evaluateState(state({ hand: ['we-3#w'], ...infected(10) }, {}), 0);
    expect(clean).toBeGreaterThan(at4);
    expect(at4).toBeGreaterThan(at8);
    // 8 -> 9 is the accelerating-zone marginal (10 + 15); 9 -> 10 adds the
    // permanent-loss penalty on top, dwarfing any explore's value.
    expect(at8 - at9).toBe(25);
    expect(at9 - at10).toBeGreaterThan(MAX_INFECTION_PENALTY);
  });

  it('Infected Characters (Zombie A/B/C) are exempt from the infection tax', () => {
    const clean = evaluateState(state({}, {}), 0);
    const zombieAt4 = evaluateState(state({ isInfectedCharacter: true, ...infected(4) }, {}), 0);
    expect(zombieAt4).toBeGreaterThan(clean - 50);
  });
});

describe('bot infection caution (the 10th counter weighs like a fatal explore)', () => {
  function armedHand(): Partial<PlayerState> {
    return { hand: ['we-3#w'] };
  }

  it('at level 9 the bot refuses to explore (reduction/pass first)', () => {
    const s = state({ ...armedHand(), ...infected(9) }, {});
    const a = chooseGreedyAction(s, 0);
    expect(['explore', 'attack']).not.toContain(a.type);
  });

  it('at low infection the same armed seat still explores', () => {
    const s = state({ ...armedHand(), ...infected(1) }, {});
    // adventures: the mansion top is a 25-HP infected the 30-damage weapon defeats
    const a = chooseGreedyAction(s, 0);
    expect(a.type).toBe('explore');
  });

  it('at level 9 plays the infection-lowering Action, not the raising one (both in hand, explore cautioned)', () => {
    const s = state({ hand: ['we-3#w', 'ac-raise#a', 'ac-lower#b'], ...infected(9) }, {});
    const a = chooseGreedyAction(s, 0) as Action & { instanceId?: string };
    expect(a.type).toBe('playActionCard');
    expect(a.instanceId).toBe('ac-lower#b');
  });
});