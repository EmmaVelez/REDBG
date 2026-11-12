
import { chooseGreedyAction, EXPLORE_BIAS, isUnarmedDeadEnd, idleTurnsInARow, STALL_TURNS } from './policy';
import { enumerateLegalActions } from './enumerate';
import { evaluateState } from './evaluate';
import { applyAction } from '../engine/actions';
import type { Action, GameState, CardDef, PlayerState } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'generic', level: 2 }] }),
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
    marketPiles: {
      hg: { pileId: 'hg', cards: ['we-1#1'] },
      kn: { pileId: 'kn', cards: ['we-2#1'] },
    },
    mansionDeck: ['ma-1#1', 'ma-1#2'], removed: [],
    cards: Object.fromEntries(['ch-1#0', 'ch-1#1', 'am-1#1', 'we-1#1', 'we-2#1', 'we-3#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } }])),
    cardDefs: DEFS,
    prompts: [], winners: [], endReason: undefined, log: [],
    ...over,
  };
  return s;
}

// Manual argmax reimplementation: the test computes what the policy SHOULD pick
// by simulating every legal action with the same functions the policy uses
// (including the explore bias and the no-op skip). This pins the policy to
// true 1-ply greedy without hardcoding brittle scores.
function manualArgmax(s: GameState, seat: number): Action {
  const legal = enumerateLegalActions(s, seat);
  let best: Action | undefined = undefined;
  let bestScore = 0;
  for (const a of legal) {
    const next = applyAction(s, a);
    if (JSON.stringify(next.seats) === JSON.stringify(s.seats) &&
        JSON.stringify(next.mansionDeck) === JSON.stringify(s.mansionDeck) &&
        JSON.stringify(next.prompts) === JSON.stringify(s.prompts) &&
        next.phase === s.phase && next.activeSeat === s.activeSeat && next.turnNumber === s.turnNumber) {
      continue; // no-op
    }
    if (a.type === 'explore' && a.weapons.length === 0 && s.seats[seat]?.mustExplore !== true) continue;
    const score = a.type === 'endTurn'
      ? evaluateState(
          {
            ...next,
            seats: next.seats.map(s =>
              s.seat === seat
                ? { ...s, turnGold: 0, turnAmmo: 0, actionsLeft: 0, buysLeft: 0, exploresLeft: 0, weaponDamageBonusThisTurn: 0 }
                : s,
            ),
          },
          seat,
          { clampDiscardToHeld: true },
        )
      : evaluateState(next, seat) + (a.type === 'explore' ? EXPLORE_BIAS : 0);
    if (best === undefined || score > bestScore) { bestScore = score; best = a; }
  }
  return best ?? ({ type: 'endTurn', seat } as Action);
}

describe('chooseGreedyAction', () => {
  // 1. 'returns the manual 1-ply argmax'
  test('returns the manual 1-ply argmax', () => {
    const s = baseState({ seats: [player(0, { hand: ['we-1#1', 'we-2#1', 'am-1#1'] }), player(1)] });
    expect(chooseGreedyAction(s, 0)).toEqual(manualArgmax(s, 0));
  });

  // 2. 'returns exactly one of the legal actions'
  test('returns exactly one of the legal actions', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'ac-1#1', 'it-1#1', 'we-1#1'] }), player(1)] });
    const a = chooseGreedyAction(s, 0);
    expect(enumerateLegalActions(s, 0)).toContainEqual(a);
  });

  // 3. 'deterministic on identical inputs'
  test('deterministic on identical inputs', () => {
    const s = baseState({ seats: [player(0, { hand: ['we-2#1', 'we-3#1'] }), player(1)] });
    expect(chooseGreedyAction(s, 0)).toEqual(chooseGreedyAction(s, 0));
  });

  // 4. 'agrees with manual argmax on several hand compositions'
  test('agrees with manual argmax on several hand compositions', () => {
    const s1 = baseState({ seats: [player(0, { hand: ['we-3#1'] }), player(1)] });
    expect(chooseGreedyAction(s1, 0)).toEqual(manualArgmax(s1, 0));

    const s2 = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'ac-1#1'] }), player(1)] });
    expect(chooseGreedyAction(s2, 0)).toEqual(manualArgmax(s2, 0));

    const s3 = baseState({ seats: [player(0, { hand: ['am-1#1'] }), player(1)] });
    expect(chooseGreedyAction(s3, 0)).toEqual(manualArgmax(s3, 0));
  });

  // 5. 'picks the winning explore over endTurn when a kill is available'
  test('picks the winning explore over endTurn when a kill is available', () => {
    const s = baseState({ seats: [player(0, { hand: ['we-3#1'] }), player(1)], mansionDeck: ['ma-1#1', 'ma-1#2'] });
    const a = chooseGreedyAction(s, 0);
    expect(a.type).toBe('explore');
    expect(a).toEqual(manualArgmax(s, 0));
  });

  // 6. 'bails out to endTurn for a seat with no legal moves'
  test('bails out to endTurn for a seat with no legal moves', () => {
    // Empty mansion: no explore is legal, so the weaponless seat has nothing
    // to do at all (the dead-end escape needs an explore to offer).
    const s = baseState({ seats: [player(0), player(1)], mansionDeck: [] });
    expect(chooseGreedyAction(s, 1)).toEqual({ type: 'endTurn', seat: 1 });
  });

  // 7. 'fallback for an unknown seat id'
  test('fallback for an unknown seat id', () => {
    expect(chooseGreedyAction(baseState(), 99)).toEqual({ type: 'endTurn', seat: 99 });
  });

  // 8. 'dead active player ends turn'
  test('dead active player ends turn', () => {
    const s = baseState({ seats: [player(0, { dead: true }), player(1)] });
    expect(chooseGreedyAction(s, 0)).toEqual({ type: 'endTurn', seat: 0 });
  });

  // 9. 'no-op actions never win; first real action breaks ties'
    test('no-op actions never win; first real action breaks ties', () => {
      // Empty hand, a Weapon still in the deck and turnGold 0: the only candidates
      // are the two no-op ability uses (ch-1 generic abilities are pass-throughs)
      // and endTurn — the seat is NOT in a dead end (it still owns a Weapon), so
      // no unarmed explore is volunteered. The no-ops must be skipped — the
      // policy must return the only real action: endTurn.
      const s = baseState({ seats: [player(0, { hand: [], inventory: ['we-3#1'] }), player(1)] });
      const a = chooseGreedyAction(s, 0);
      expect(a).toEqual({ type: 'endTurn', seat: 0 });
    });

  // 10. 'does not mutate the state'
  test('does not mutate the state', () => {
    const s = baseState({ seats: [player(0, { hand: ['we-3#1'] }), player(1)] });
    const before = JSON.stringify(s);
    chooseGreedyAction(s, 0);
    expect(JSON.stringify(s)).toBe(before);
  });
  test('a weaponless seat that cannot buy explores unarmed instead of stalling', () => {
    // No Weapon anywhere and no affordable buy: passing the turn forever is the
    // old stall. The policy must take the only move that can still change the
    // game — an unarmed explore.
    const s = baseState({ seats: [player(0, { hand: [], inventory: [] }), player(1)] });
    const a = chooseGreedyAction(s, 0);
    expect(a.type).toBe('explore');
    if (a.type === 'explore') expect(a.weapons).toEqual([]);
  });

  test('isUnarmedDeadEnd: needs no Weapon anywhere AND no affordable one', () => {
    const armed = baseState({ seats: [player(0, { inventory: ['we-3#1'] }), player(1)] });
    expect(isUnarmedDeadEnd(armed, 0)).toBe(false);
    const brokeButAffordable = baseState({ seats: [player(0, { inventory: [], turnGold: 20 }), player(1)] });
    expect(isUnarmedDeadEnd(brokeButAffordable, 0)).toBe(false); // hg pile: we-1 costs 20
    const hopeless = baseState({ seats: [player(0, { inventory: [] }), player(1)] });
    expect(isUnarmedDeadEnd(hopeless, 0)).toBe(true);
  });
  test('idleTurnsInARow counts only completed passing turns', () => {
    const end = (seq: number) => ({ seq, action: { type: 'endTurn', seat: 0 } as Action });
    const ammo = (seq: number) => ({ seq, action: { type: 'playAmmo', seat: 0, instanceId: 'am-1#1' } as Action });
    const explore = (seq: number) => ({ seq, action: { type: 'explore', seat: 0, weapons: [], exploreCount: 1 } as Action });
    // Open turn (ammo only) + two completed passing turns.
    const s = baseState({ log: [end(1), ammo(2), end(3), ammo(4), end(5), ammo(6)] });
    expect(idleTurnsInARow(s, 0)).toBe(2);
    // The most recent COMPLETED turn explored, so the count stops immediately.
    const t = baseState({ log: [end(1), ammo(2), end(3), explore(4), end(5), ammo(6)] });
    expect(idleTurnsInARow(t, 0)).toBe(0);
    // ...and a passing turn on top of it counts exactly once.
    const u = baseState({ log: [end(1), explore(2), end(3), ammo(4), end(5), ammo(6)] });
    expect(idleTurnsInARow(u, 0)).toBe(1);
    // No completed turn at all yet.
    expect(idleTurnsInARow(baseState({ log: [ammo(1)] }), 0)).toBe(0);
  });

  test('a seat that has idled for STALL_TURNS keeps fighting instead of passing', () => {
    const log: { seq: number; action: Action }[] = [];
    // STALL_TURNS + 1 completed passing turns, plus an open one.
    for (let i = 0; i < STALL_TURNS + 1; i++) {
      log.push({ seq: log.length + 1, action: { type: 'playAmmo', seat: 0, instanceId: 'am-1#1' } });
      log.push({ seq: log.length + 1, action: { type: 'endTurn', seat: 0 } });
    }
    // Empty hand, no Weapon anywhere: the seat must explore unarmed, not pass.
    const s = baseState({ seats: [player(0, { hand: [], inventory: [] }), player(1)], log });
    expect(idleTurnsInARow(s, 0)).toBeGreaterThanOrEqual(STALL_TURNS);
    const a = chooseGreedyAction(s, 0);
    expect(a.type).toBe('explore');
    if (a.type === 'explore') expect(a.weapons).toEqual([]);
  });
});
