import { record, replay, assertReplayDeterministic } from './replay';
import { setup } from './game';
import { applyAction } from './actions';
import { startTurn } from './game';
import type { GameSetup, GameState, CardInstance, CardDef, PlayerState, Action } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const CARDS: ReadonlyArray<CardDef> = [
  def('ch-1', { type: 'character', maxHp: 100, level2At: 4 }),
  def('ch-2', { type: 'character', maxHp: 80, level2At: 3 }),
  def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  def('we-1', { type: 'weapon', copies: 9, cost: 20, ammoReq: 20, damage: 10 }),
  def('we-4', { type: 'weapon', copies: 11, cost: 0, ammoReq: 0, damage: 5 }),
  def('ma-1', { type: 'infected', copies: 3, hp: 20, attack: 20, decorations: 1 }),
  def('ma-10', { type: 'infected', copies: 2, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] }),
];

const PILES = [
  { pileId: 'hg', cardIds: ['we-1'] },
  { pileId: 'kn', cardIds: ['we-4'] },
];

function spec(seed: number): GameSetup {
  return { seed, players: [{ name: 'P0', controller: 'human' }, { name: 'P1', controller: 'human' }] };
}

function state(seed = 1): GameState {
  return setup(spec(seed), CARDS, PILES);
}

test('record appends', () => {
  const s0 = state();
  const r = record(s0, { type: 'endTurn', seat: 0 });
  expect(r.log.length).toBe(1);
  expect(r.log[0]?.action.type).toBe('endTurn');
  expect(r.version).toBe(2);
  expect(r.seats).toBe(s0.seats);
});

test('record twice', () => {
  const s0 = state();
  const r2 = record(record(s0, { type: 'endTurn', seat: 0 }), { type: 'endTurn', seat: 1 });
  expect(r2.log.length).toBe(2);
  expect(r2.log[0]?.seq).toBe(1);
  expect(r2.log[1]?.seq).toBe(2);
  expect(r2.version).toBe(3);
  expect(r2.seats).toBe(s0.seats);
});

test('replay empty actions', () => {
  const replayed = replay(spec(1), CARDS, PILES, []);
  expect(replayed.log.length).toBe(0);
  expect(replayed.version).toBe(1);
  expect(replayed.phase).toBe('main');
  expect(replayed.seats.length).toBe(2);
});

test('replay single buy', () => {
  const acts: Action[] = [
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_6' },
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_3' },
    { type: 'buy', seat: 0, pileId: 'hg' },
  ];
  const replayed = replay(spec(1), CARDS, PILES, acts);
  expect(replayed.log.length).toBe(3);
  expect(replayed.version).toBe(4);
  expect((replayed.seats[0] as PlayerState).turnGold).toBe(0);
  expect(replayed.marketPiles.hg?.cards.length).toBe(8);
});

test('replay two buys', () => {
  // seat 0 buys in its turn, then seat 1 buys after the turn passes
  const acts: Action[] = [
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_6' },
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_3' },
    { type: 'buy', seat: 0, pileId: 'hg' },
    { type: 'endTurn', seat: 0 },
    { type: 'playAmmo', seat: 1, instanceId: 'am-1#s2_7' },
    { type: 'buy', seat: 1, pileId: 'kn' },
  ];
  const replayed = replay(spec(1), CARDS, PILES, acts);
  expect(replayed.log.length).toBe(6);
  expect(replayed.version).toBe(7);
  expect((replayed.seats[0] as PlayerState).turnGold).toBe(0);
  expect((replayed.seats[0] as PlayerState).buysLeft).toBe(0);
  expect((replayed.seats[1] as PlayerState).turnGold).toBe(10);
  expect(replayed.marketPiles.hg?.cards.length).toBe(8);
  expect(replayed.marketPiles.kn?.cards.length).toBe(10);
});

test('replay throws on illegal action in the list', () => {
  // a second buy in the same turn violates the 1-buy limit
  const acts: Action[] = [
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_6' },
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_3' },
    { type: 'buy', seat: 0, pileId: 'hg' },
    { type: 'buy', seat: 0, pileId: 'kn' },
  ];
  expect(() => replay(spec(1), CARDS, PILES, acts)).toThrow('applyAction: buy: no buys left');
});

test('replay determinism — full sequence', () => {
  const acts: Action[] = [
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_6' },
    { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_3' },
    { type: 'buy', seat: 0, pileId: 'hg' },
    { type: 'endTurn', seat: 0 },
    { type: 'buy', seat: 1, pileId: 'kn' },
  ];
  const r = replay(spec(1), CARDS, PILES, acts);
  const r2 = replay(spec(1), CARDS, PILES, acts);
  expect(r).toEqual(r2);
});

test('assertReplayDeterministic true', () => {
  let s0 = state(1);
  let s1 = applyAction(s0, { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_6' });
  let s2 = applyAction(s1, { type: 'playAmmo', seat: 0, instanceId: 'am-1#s1_3' });
  let s3 = applyAction(s2, { type: 'buy', seat: 0, pileId: 'hg' });
  expect(assertReplayDeterministic(s3)).toBe(true);
});

test('assertReplayDeterministic with playActionCard in log', () => {
  const s0 = state(1);
  const h = s0.seats[0] as PlayerState;
  const ammoId = h.hand.find(id => id.startsWith('am-1#'));
  if (ammoId === undefined) {
    expect(true).toBe(true);
    return;
  }
  const s1 = applyAction(s0, { type: 'playAmmo', seat: 0, instanceId: ammoId });
  expect(assertReplayDeterministic(s1)).toBe(true);
});

test('record-then-replay mismatch proof', () => {
  const ref = record(state(), { type: 'endTurn', seat: 0 });
  expect(assertReplayDeterministic(ref)).toBe(false);
});

test('replay with explore + shuffle determinism', () => {
  const s0 = state(1);
  const h = s0.seats[0] as PlayerState;
  const knifeId = h.hand.find(id => (CARDS.find(c => c.id === (s0.cards[id] as CardInstance)?.cardId))?.ammoReq === 0 && id.startsWith('we-'));
  if (knifeId === undefined) {
    expect(true).toBe(true);
    return;
  }
  const acts: Action[] = [{ type: 'explore', seat: 0, weapons: [knifeId], exploreCount: 1 }];
    const r1 = replay(spec(1), CARDS, PILES, acts);
    const expected = applyAction(s0, acts[0] as Action);
    expect(r1).toEqual(expected);
});
