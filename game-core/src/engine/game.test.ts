import { setup, startTurn, checkWin } from './game';
import type { GameSetup, GameState, CardInstance, CardDef, PlayerState } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const CARDS: ReadonlyArray<CardDef> = [
  def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 }] }),
  def('ch-2', { type: 'character', maxHp: 80, level2At: 3 }),
  def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  def('we-1', { type: 'weapon', copies: 9, cost: 20, ammoReq: 20, damage: 10 }),
  def('we-4', { type: 'weapon', copies: 11, cost: 0, ammoReq: 0, damage: 5 }),
  def('ma-1', { type: 'infected', copies: 3, hp: 20, attack: 20, decorations: 1 }),
  def('ma-10', { type: 'infected', copies: 2, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] }),
  def('tk-1', { type: 'token', copies: 2, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-1' }] }),
  def('it-3', { type: 'item', copies: 3, itemEffects: [{ kind: 'plusMaxHp20' }] }),
];

const PILES = [
  { pileId: 'hg', cardIds: ['we-1'] },
  { pileId: 'kn', cardIds: ['we-4'] },
];

function setup2(seed = 1, players: Array<{ name: string; characterCardId?: string }> = []): GameState {
  const spec: GameSetup = { seed, players: players.length ? players.map(p => ({ name: p.name, controller: 'human' as const, ...(p.characterCardId ? { characterCardId: p.characterCardId } : {}) })) : [{ name: 'P0', controller: 'human' }, { name: 'P1', controller: 'human' }] };
  return setup(spec, CARDS, PILES);
}

function p0(s: GameState): PlayerState {
  return s.seats[0] as PlayerState;
}

function p1(s: GameState): PlayerState {
  return s.seats[1] as PlayerState;
}

function seatMap(s: GameState, mutate: (p: PlayerState, i: number) => PlayerState): GameState {
  return { ...s, seats: s.seats.map(mutate) };
}

test('setup shape', () => {
  const s = setup2(1);
  expect(s.seats.length).toBe(2);
  expect(s.phase).toBe('main');
  expect(s.activeSeat).toBe(0);
  expect(s.turnNumber).toBe(1);
  expect(s.version).toBe(1);
  expect(s.seed).toBe(1);
  s.seats.forEach(seat => {
    expect(seat.hand.length).toBe(5);
    expect(seat.inventory.length).toBe(5);
    expect(seat.discard).toEqual([]);
    expect(seat.playArea).toEqual([]);
  });
});

test('setup starting deck contents', () => {
  const s = setup2(1);
  const all = [...p0(s).hand, ...p0(s).inventory];
  expect(all.filter(id => id.startsWith('am-1#')).length).toBe(7);
  expect(all.filter(id => id === 'we-1#1').length).toBe(1);
  expect(all.filter(id => id.startsWith('we-4#')).length).toBe(2);
});

test('setup mansion', () => {
  const s = setup2(1);
  expect(s.mansionDeck.length).toBe(10);
  expect(s.mansionDeck).toContain('ma-1#1');
  expect(s.mansionDeck).not.toContain('we-1#1');
});

test('setup market', () => {
  const s = setup2(1);
  const m = s.marketPiles as Record<string, { pileId: string; cards: readonly string[] }>;
  const hg = m['hg'];
  const kn = m['kn'];
  if (hg === undefined || kn === undefined) throw new Error('missing pile');
  expect(hg.cards.length).toBe(9);
  expect(kn.cards.length).toBe(11);
  expect(new Set([...hg.cards, ...kn.cards])).toEqual(new Set([
    'we-1#1', 'we-1#2', 'we-1#3', 'we-1#4', 'we-1#5', 'we-1#6', 'we-1#7', 'we-1#8', 'we-1#9',
    'we-4#1', 'we-4#2', 'we-4#3', 'we-4#4', 'we-4#5', 'we-4#6', 'we-4#7', 'we-4#8', 'we-4#9', 'we-4#10', 'we-4#11',
  ]));
});

test('setup cardDefs + cards registry', () => {
  const s = setup2(1);
  const we1 = s.cardDefs['we-1'];
  const am = s.cards['am-1#1'];
  const ma = s.cards['ma-10#2'];
  if (we1 === undefined || am === undefined || ma === undefined) throw new Error('missing card');
  expect(we1.damage).toBe(10);
  expect(am.cardId).toBe('am-1');
  expect(ma.cardId).toBe('ma-10');
});

test('setup character assignment with explicit ids', () => {
  const s = setup2(1, [{ name: 'A', characterCardId: 'ch-2' }, { name: 'B', characterCardId: 'ch-1' }]);
  expect(p0(s).characterInstanceId).toMatch(/^ch-2#/);
  expect(p1(s).characterInstanceId).toMatch(/^ch-1#/);
  expect(p0(s).hp).toBe(80);
  expect(p1(s).hp).toBe(100);
});

test('setup deterministic', () => {
  expect(setup2(1)).toEqual(setup2(1));
});

test('setup different seeds differ', () => {
  expect(setup2(1).mansionDeck).not.toEqual(setup2(2).mansionDeck);
});

test('startTurn resets pools', () => {
  const s = setup2(1);
  const dirty = seatMap(s, (p, i) => i === 0 ? {
    ...p,
    turnAmmo: 9,
    turnGold: 7,
    actionsLeft: 0,
    buysLeft: 0,
    exploresLeft: 0,
    weaponDamageBonusThisTurn: 5,
    playArea: ['am-1#1'],
  } : p);
  const t = startTurn(dirty);
  expect(p0(t).turnAmmo).toBe(0);
  expect(p0(t).turnGold).toBe(0);
  expect(p0(t).actionsLeft).toBe(1);
  expect(p0(t).buysLeft).toBe(1);
  expect(p0(t).exploresLeft).toBe(1);
  expect(p0(t).weaponDamageBonusThisTurn).toBe(0);
  expect(p0(t).playArea).toEqual([]);
  expect(t.activeSeat).toBe(0);
  expect(t.turnNumber).toBe(1);
  expect(t.version).toBe(2);
});

test('startTurn skips downed player', () => {
  const s = setup2(1, [{ name: 'A', characterCardId: 'ch-1' }, { name: 'B', characterCardId: 'ch-1' }]);
  const downed = seatMap(s, (p, i) => i === 0 ? {
    ...p,
    downed: true,
    hp: 0,
    hand: [],
    inventory: ['am-1#1', 'am-1#2', 'am-1#3', 'am-1#4', 'am-1#5', 'am-1#6', 'am-1#7', 'we-1#1', 'we-4#1', 'we-4#2'],
    discard: [],
  } : p);
  const t = startTurn(downed);
  expect(p0(t).downed).toBe(false);
  expect(p0(t).maxHp).toBe(80);
  expect(p0(t).hp).toBe(80);
  expect(p0(t).hand.length).toBe(5);
  expect(t.activeSeat).toBe(1);
  expect(t.turnNumber).toBe(2);
  expect(t.version).toBe(2);
});

test('startTurn downed death', () => {
  const s = setup2(1);
  const dying = seatMap(s, (p, i) => i === 0 ? {
    ...p,
    downed: true,
    hp: 0,
    maxHp: 15,
    hand: [],
    inventory: [],
    discard: [],
  } : p);
  const t = startTurn(dying);
  expect(p0(t).dead).toBe(true);
  expect(p0(t).downed).toBe(false);
  expect(p0(t).maxHp).toBe(-5);
  expect(t.activeSeat).toBe(1);
  expect(t.turnNumber).toBe(2);
});

test('startTurn not in main phase', () => {
  const s = setup2(1);
  const result = startTurn({ ...s, phase: 'setup' });
  expect(result.version).toBe(1);
  expect(result.phase).toBe('setup');
  expect(result.seats).toBe(s.seats);
});

test('checkWin not over', () => {
  const s = setup2(1);
  expect(checkWin(s)).toEqual({ gameOver: false, winners: [] });
});

test('checkWin uroboros', () => {
  const s = setup2(1);
  const won = seatMap(s, (p, i) => i === 0 ? { ...p, attached: ['ma-10#1'], decorations: 3 } : p);
  const c = checkWin(won);
  expect(c.gameOver).toBe(true);
  expect(c.endReason).toBe('uroborosDefeated');
  expect(c.winners).toEqual([0]);
});

test('checkWin uroboros decides by decorations', () => {
  const s = setup2(1);
  const won = seatMap(s, (p, i) => i === 0 ? { ...p, attached: ['ma-10#1'], decorations: 3 } : { ...p, attached: ['ma-10#2'], decorations: 5 });
  const c = checkWin(won);
  expect(c.winners).toEqual([1]);
});

test('checkWin uroboros tie-break hp', () => {
  const s = setup2(1);
  const won = seatMap(s, (p, i) => i === 0 ? { ...p, attached: ['ma-10#1'], hp: 70 } : { ...p, attached: ['ma-10#2'], hp: 60 });
  const c = checkWin(won);
  expect(c.winners).toEqual([0]);
});

test('checkWin uroboros exact tie', () => {
  const s = setup2(1);
  const won = seatMap(s, (p, i) => i === 0 ? { ...p, attached: ['ma-10#1'], hp: 70 } : { ...p, attached: ['ma-10#2'], hp: 70 });
  const c = checkWin(won);
  expect(c.winners).toEqual([0, 1]);
});

test('checkWin all dead', () => {
  const dead = seatMap(setup2(1), p => ({ ...p, dead: true }));
  const c = checkWin(dead);
  expect(c.gameOver).toBe(true);
  expect(c.endReason).toBe('allPlayersDead');
  expect(c.winners).toEqual([]);
});

test('checkWin one dead one alive', () => {
  const s = setup2(1);
  const dead = seatMap(s, (p, i) => i === 0 ? { ...p, dead: true } : p);
  const c = checkWin(dead);
  expect(c.gameOver).toBe(false);
});

test('checkWin empty seats', () => {
  const s = setup2(1);
  const empty = { ...s, seats: [] };
  const c = checkWin(empty);
  expect(c.gameOver).toBe(true);
  expect(c.endReason).toBe('allPlayersDead');
});