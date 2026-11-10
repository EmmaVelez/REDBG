
import { chooseBotAction, type BotDifficulty } from './bot';
import { chooseGreedyAction, choosePlayoutAction } from './policy';
import { enumerateLegalActions } from './enumerate';
import type { Action, GameState, CardDef, PlayerState } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'plusDamageThisTurn', amount: 5, level: 2 }] }),
  'am-1': def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  'we-1': def('we-1', { type: 'weapon', cost: 20, ammoReq: 20, damage: 10 }),
  'we-2': def('we-2', { type: 'weapon', cost: 5, ammoReq: 0, damage: 8 }),
  'we-3': def('we-3', { type: 'weapon', cost: 30, ammoReq: 0, damage: 30 }),
  'ac-1': def('ac-1', { type: 'action', cost: 20, bonuses: { gold: 10 } }),
  'it-1': def('it-1', { type: 'item', itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] }),
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

function baseState(over: Partial<GameState> = {}): GameState {
  const s: GameState = {
    version: 1, seed: 1, rngState: 1, phase: 'main', activeSeat: 0, turnNumber: 1,
    seats: [player(0), player(1)],
    marketPiles: { hg: { pileId: 'hg', cards: ['we-1#1'] }, kn: { pileId: 'kn', cards: ['we-2#1'] } },
    mansionDeck: ['ma-1#1', 'ma-1#2'], mansionBottom: [], removed: [],
    cards: Object.fromEntries(['ch-1#0', 'ch-1#1', 'am-1#1', 'we-1#1', 'we-2#1', 'we-3#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } }])),
    cardDefs: DEFS, prompts: [], winners: [], endReason: undefined, log: [],
    ...over,
  };
  return s;
}

const HAND5: string[] = ['am-1#1', 'we-1#1', 'we-2#1', 'we-3#1', 'ac-1#1'];

describe('chooseBotAction', () => {
  let s: GameState;
  const seat = 0;

  beforeEach(() => {
    s = baseState({ seats: [player(0, { hand: HAND5 }), player(1)] });
  });

  // Test 1: Hard bot plays the greedy playout (whole-turn lines)
  test('hard bot plays the greedy playout', () => {
    // Assert enumerate order first
    const order = enumerateLegalActions(s, seat).map(a => a.type);
    // The fixture player is level 1 with generic L1+L2 abilities: only the L1
    // ability (index 0) passes validation, so exactly one useCharacterAbility.
    expect(order).toEqual(['playActionCard', 'playAmmo', 'explore', 'explore', 'explore', 'explore', 'useCharacterAbility', 'endTurn']);

    // Check greedy action
    expect(chooseBotAction(s, seat, 'hard', () => 0.1)).toEqual(choosePlayoutAction(s, seat));
  });

  // Test 2: Hard bot ignores noise
  test('hard bot ignores noise', () => {
    expect(chooseBotAction(s, seat, 'hard', () => 0.99)).toEqual(choosePlayoutAction(s, seat));
  });

  // Test 3: easy bot with r=0 uses the first legal action
  test('easy bot with r=0 uses the first legal action', () => {
    // r=0 < 0.5 noisy; idx = floor(0/0.5*7) = 0 -> first legal action
    expect(chooseBotAction(s, seat, 'easy', () => 0)).toEqual({ type: 'playActionCard', seat: 0, instanceId: 'ac-1#1' });
  });

  // Test 4: easy bot with r just under noise picks the last action
  test('easy bot with r just under noise picks the last action', () => {
    // r=0.499 < 0.5 noisy; idx = floor(0.499/0.5*8) = floor(7.984) = 7 -> legal[7] = endTurn
    expect(chooseBotAction(s, seat, 'easy', () => 0.499)).toEqual({ type: 'endTurn', seat: 0 });
  });

  // Test 5: easy bot with r at or above noise plays greedy
  test('easy bot with r at or above noise plays greedy', () => {
    // r=0.5 >= 0.5 -> greedy
    expect(chooseBotAction(s, seat, 'easy', () => 0.5)).toEqual(chooseGreedyAction(s, seat));
    // r=0.9 >= 0.5 -> greedy
    expect(chooseBotAction(s, seat, 'easy', () => 0.9)).toEqual(chooseGreedyAction(s, seat));
  });

  // Test 6: normal bot noise is 20%
  test('normal bot noise is 20%', () => {
    // Case 1: r=0.001 < 0.2 noisy. idx = floor(0.001/0.2*7) = 0 -> playActionCard
    expect(chooseBotAction(s, seat, 'normal', () => 0.001)).toEqual({ type: 'playActionCard', seat: 0, instanceId: 'ac-1#1' });

    // Case 2: r=0.1 < 0.2 noisy. 7 legal actions (the L2 ability is level-locked):
    // idx = floor(0.1/0.2*7) = 3 -> the solo we-3 explore
        expect(chooseBotAction(s, seat, 'normal', () => 0.1)).toEqual({ type: 'explore', seat: 0, weapons: ['we-3#1'], exploreCount: 1 });

    // Case 3: r=0.999 >= 0.2 -> greedy
    expect(chooseBotAction(s, seat, 'normal', () => 0.999)).toEqual(chooseGreedyAction(s, seat));
  });

  // Test 7: unknown seat falls back to endTurn
  test('unknown seat falls back to endTurn', () => {
    expect(chooseBotAction(baseState(), 99, 'easy', () => 0)).toEqual({ type: 'endTurn', seat: 99 });
  });

  // Test 8: waiting seat falls back to endTurn
  test('waiting seat falls back to endTurn', () => {
    // Seat 1 is not active (activeSeat=0 in baseState)
    expect(chooseBotAction(s, 1, 'easy', () => 0)).toEqual({ type: 'endTurn', seat: 1 });
  });

  // Test 9: deterministic for fixed rand
  test('deterministic for fixed rand', () => {
    // Easy mode
    const easy1 = chooseBotAction(s, seat, 'easy', () => 0.3);
    const easy2 = chooseBotAction(s, seat, 'easy', () => 0.3);
    expect(easy1).toEqual(easy2);

    // Normal mode
    const normal1 = chooseBotAction(s, seat, 'normal', () => 0.05);
    const normal2 = chooseBotAction(s, seat, 'normal', () => 0.05);
    expect(normal1).toEqual(normal2);
  });

  // Test 10: rand is called exactly once per invocation
  test('rand is called exactly once per invocation', () => {
    // Easy mode (should call rand)
    let calls = 0;
    const countedRand = () => { calls += 1; return 0; };
    chooseBotAction(s, seat, 'easy', countedRand);
    expect(calls).toBe(1);

    // Hard mode (should NOT call rand)
    calls = 0;
    chooseBotAction(s, seat, 'hard', countedRand);
    expect(calls).toBe(0);
  });
});
