import { describe, test, expect } from 'vitest';
import { choosePlayoutAction, chooseGreedyAction, ROLLOUT_MAX_STEPS, ROLLOUT_CANDIDATE_CAP } from './policy';
import { enumerateLegalActions } from './enumerate';
import { applyAction } from '../engine/actions';
import type { Action, GameState, CardDef, PlayerState } from '../types';

/**
 * The greedy playout: instead of scoring each candidate by the state ONE
 * action ahead, it simulates the rest of the turn with the same greedy policy
 * and compares the end-of-turn positions. These tests pin the behaviour the
 * 1-ply policy cannot see: sequencing a setup move before a payoff, and
 * declining a fight whose cost only shows up after the reveal.
 */

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }] }),
  'am-1': def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 20 } }),
  'we-weak': def('we-weak', { cost: 0, ammoReq: 0, damage: 5 }),
  'we-strong': def('we-strong', { cost: 0, ammoReq: 20, damage: 30 }),
  'ma-1': def('ma-1', { type: 'infected', hp: 25, attack: 5, decorations: 1 }),
  'ma-bruiser': def('ma-bruiser', { type: 'infected', hp: 999, attack: 50, decorations: 1 }),
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
    marketPiles: {},
    mansionDeck: ['ma-1#1'], removed: [],
    cards: Object.fromEntries(
      ['ch-1#0', 'ch-1#1', 'am-1#1', 'we-weak#1', 'we-strong#1', 'ma-1#1', 'ma-bruiser#1'].map(id => [
        id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
      ]),
    ),
    cardDefs: DEFS,
    prompts: [], winners: [], endReason: undefined, log: [],
    ...over,
  };
  return s;
}

describe('choosePlayoutAction', () => {
  test('returns exactly one legal action', () => {
    const s = baseState({
      seats: [player(0, { hand: ['we-weak#1'] }), player(1)],
    });
    const a = choosePlayoutAction(s, 0);
    expect(enumerateLegalActions(s, 0)).toContainEqual(a);
  });

  test('deterministic on identical inputs', () => {
    const s = baseState({
      seats: [player(0, { hand: ['we-weak#1', 'am-1#1'], exploresLeft: 2 }), player(1)],
    });
    expect(choosePlayoutAction(s, 0)).toEqual(choosePlayoutAction(s, 0));
  });

  test('does not mutate the state', () => {
    const s = baseState({
      seats: [player(0, { hand: ['we-weak#1', 'am-1#1'], exploresLeft: 2 }), player(1)],
    });
    const before = JSON.stringify(s);
    choosePlayoutAction(s, 0);
    expect(JSON.stringify(s)).toBe(before);
  });

  test('no legal actions falls back to endTurn', () => {
    // Empty mansion: nothing to explore, so the dead-end escape hatch (unarmed
    // explore) is not available either and endTurn is the only move.
    const s = baseState({ seats: [player(0), player(1)], mansionDeck: [] });
    expect(choosePlayoutAction(s, 0)).toEqual({ type: 'endTurn', seat: 0 });
  });

  test('unknown seat falls back to endTurn', () => {
    expect(choosePlayoutAction(baseState(), 99)).toEqual({ type: 'endTurn', seat: 99 });
  });

  // The worked example of what the playout adds: the 1-ply policy sees the
  // +80 explore bias and the weak weapon's explore (5 damage, loses) beats the
  // ammo card (+60). The playout sees that playing the ammo FIRST enables the
  // strong weapon to defeat the infected, so it sequences the setup move.
  test('sequences an ammo card before the explore it enables', () => {
    const s = baseState({
      mansionDeck: ['ma-1#1'],
      seats: [player(0, { hand: ['we-weak#1', 'we-strong#1', 'am-1#1'], exploresLeft: 2 }), player(1)],
    });

    const greedy = chooseGreedyAction(s, 0);
    expect(greedy.type).toBe('explore');
    if (greedy.type === 'explore') expect(greedy.weapons).toEqual(['we-weak#1']);

    const playout = choosePlayoutAction(s, 0);
    expect(playout).toEqual({ type: 'playAmmo', seat: 0, instanceId: 'am-1#1' });
  });

  // A fight the 1-ply bias accepts but the playout rejects: the bruiser deals
  // 50 damage and cannot be defeated, so the explore is pure loss. The 1-ply
  // policy still takes it (bias 80 - 50 hp); the playout compares the
  // end-of-turn positions and keeps its Health.
  test('declines a losing explore the 1-ply bias accepts', () => {
    const s = baseState({
      mansionDeck: ['ma-bruiser#1'],
      seats: [player(0, { hand: ['we-weak#1'] }), player(1)],
    });

    expect(chooseGreedyAction(s, 0).type).toBe('explore');
    expect(choosePlayoutAction(s, 0).type).not.toBe('explore');
  });

  // Winning the game is worth more than any positional score, and the fastest
  // winning line wins: the explore that wins NOW beats playing the ammo first
  // (both lines win, the immediate one costs one fewer step).
  test('takes the explore that wins the game over a slower setup', () => {
    const s = baseState({
      endInfectedCardId: 'ma-1',
      mansionDeck: ['ma-1#1'],
      seats: [player(0, { hand: ['we-strong#1', 'am-1#1'], exploresLeft: 1, turnAmmo: 20 }), player(1)],
    });
    expect(choosePlayoutAction(s, 0)).toEqual({
      type: 'explore', seat: 0, weapons: ['we-strong#1'], exploreCount: 1,
    });
  });

  test('rollout bounds are exported and positive', () => {
    expect(ROLLOUT_MAX_STEPS).toBeGreaterThan(0);
    expect(ROLLOUT_CANDIDATE_CAP).toBeGreaterThan(0);
  });
});
