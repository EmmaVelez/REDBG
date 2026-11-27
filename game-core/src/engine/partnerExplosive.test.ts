import { applyAction } from './actions';
import type { CardDef, CardInstance, GameState, PlayerState } from '../types';

/**
 * Manny ruling (2026-11-26): an "Explosive" weapon attached to the Partner and
 * used to Explore is disposed of exactly like one used from hand — Trashed
 * (or Discarded under Jill L2 / Grenade Launcher), not left attached. The
 * Partner-zone exemption only covers the non-explosive stay-attached rule.
 */

function seat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s, name: 'P' + s, controller: 'human',
    characterInstanceId: over.characterInstanceId ?? ('c' + s),
    hp: over.hp ?? 100, maxHp: over.maxHp ?? 100,
    decorations: over.decorations ?? 0, level: over.level ?? 1,
    turnAmmo: over.turnAmmo ?? 0, turnGold: over.turnGold ?? 50,
    actionsLeft: over.actionsLeft ?? 1, buysLeft: over.buysLeft ?? 1,
    exploresLeft: over.exploresLeft ?? 1,
    weaponDamageBonusThisTurn: over.weaponDamageBonusThisTurn ?? 0,
    attached: over.attached ?? [],
    ...(over.partnerInstanceId !== undefined
      ? {
          partnerInstanceId: over.partnerInstanceId,
          partnerAttached: over.partnerAttached ?? [],
          partnerHp: over.partnerHp ?? over.hp ?? 100,
          partnerMaxHp: over.partnerMaxHp ?? over.maxHp ?? 100,
        }
      : {}),
    inventory: over.inventory ?? ['inv1', 'inv2', 'inv3', 'inv4', 'inv5'],
    hand: over.hand ?? ['w1'],
    discard: over.discard ?? [], playArea: over.playArea ?? [],
    downed: over.downed ?? false, dead: over.dead ?? false,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'ch-1': { id: 'ch-1', name: 'Chris', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 100, level2At: 4 },
  'ch-jill': { id: 'ch-jill', name: 'Jill', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 80, level1At: 0, abilities: [{ kind: 'explosivesGoToDiscardInsteadOfTrash', level: 1 }] },
  'w20': { id: 'w20', name: 'Magnum', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 20 },
  'w-grenade': { id: 'w-grenade', name: 'Grenade', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 15, weaponTags: ['explosive'] },
  'w-partner': { id: 'w-partner', name: 'Partner Gun', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 15 },
  'ma-1': { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 20, attack: 20, decorations: 1 },
  'ma-2': { id: 'ma-2', name: 'Zombie', type: 'infected', set: 'premier', text: '', copies: 3, hp: 15, attack: 10, decorations: 1 },
  'ma-3': { id: 'ma-3', name: 'Licker', type: 'infected', set: 'premier', text: '', copies: 2, hp: 40, attack: 30, decorations: 3 },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: over.rngState ?? 1, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, {})],
    marketPiles: { hg: { pileId: 'hg', cards: [] } },
    mansionDeck: over.mansionDeck ?? ['inf1', 'inf2', 'inf3'],
    removed: over.removed ?? [],
    cards: over.cards ?? {
      'c0': inst('c0', over.seat0?.characterInstanceId === undefined && over.seat0?.characterInstanceId !== null ? 'ch-1' : 'ch-1'),
      'c1': inst('c1', 'ch-1'),
      'w1': inst('w1', 'w20'),
      'pg': inst('pg', 'w-grenade'),
      'pw': inst('pw', 'w-partner'),
      'inf1': inst('inf1', 'ma-1'), 'inf2': inst('inf2', 'ma-2'), 'inf3': inst('inf3', 'ma-3'),
    },
    cardDefs: DEFS,
    prompts: over.prompts ?? [], winners: [], log: [],
  };
}

function jillState(): GameState {
  const s = baseState({
    seat0: { hand: [], characterInstanceId: 'cj', partnerInstanceId: 'c1', partnerAttached: ['pg'], exploresLeft: 1, turnAmmo: 0, level: 1 },
  });
  return {
    ...s,
    cards: { ...s.cards, 'cj': inst('cj', 'ch-jill') },
  };
}

test('attached explosive used in an explore is TRASHED and detaches; other attached weapons stay', () => {
  // w1 (20) + pg (15) + pw (15) = 50 >= ma-1 (20 HP) -> defeated.
  const s = baseState({
    seat0: { hand: ['w1'], partnerInstanceId: 'c1', partnerAttached: ['pg', 'pw'], exploresLeft: 1, turnAmmo: 0 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1', 'pg', 'pw'], exploreCount: 1 });
  expect(after.seats[0]?.attached).toEqual(['inf1']);
  expect(after.seats[0]?.partnerAttached).toEqual(['pw']);
  expect(after.removed).toContain('pg');
  expect(after.seats[0]?.playArea).not.toContain('pg');
  expect(after.seats[0]?.playArea).not.toContain('pw');
  expect(after.seats[0]?.playArea).toContain('w1');
});

test('attached explosive is trashed even when the Infected is NOT defeated', () => {
  // pg alone deals 15 < ma-1 (20 HP) -> not defeated, but the Grenade is spent.
  const s = baseState({
    seat0: { hand: [], partnerInstanceId: 'c1', partnerAttached: ['pg'], exploresLeft: 1, turnAmmo: 0 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['pg'], exploreCount: 1 });
  expect(after.seats[0]?.partnerAttached).toEqual([]);
  expect(after.removed).toContain('pg');
});

test('multi-explore trashes the attached explosive exactly once', () => {
  // ma-1 + ma-2 = 35 combined; w1 (20) + pg (15) = 35 -> defeated.
  const s = baseState({
    seat0: { hand: ['w1'], partnerInstanceId: 'c1', partnerAttached: ['pg'], exploresLeft: 2, turnAmmo: 0 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1', 'pg'], exploreCount: 2 });
  expect(after.seats[0]?.partnerAttached).toEqual([]);
  expect(after.removed.filter(id => id === 'pg')).toHaveLength(1);
});

test('Jill L2: an attached explosive used in an explore goes to DISCARD, not trash', () => {
  const s = jillState();
  // pg alone (15) < ma-1 (20) -> not defeated; the disposition still applies.
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['pg'], exploreCount: 1 });
  expect(after.seats[0]?.partnerAttached).toEqual([]);
  expect(after.seats[0]?.discard).toContain('pg');
  expect(after.removed).not.toContain('pg');
});

test('partner-attached explosive also disposes when the PARTNER leads', () => {
  const s = baseState({
    seat0: { hand: [], partnerInstanceId: 'c1', partnerAttached: ['pg', 'pw'], exploresLeft: 1, turnAmmo: 0, hp: 100, partnerHp: 100 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['pg', 'pw'], exploreCount: 1, leader: 'partner' });
  expect(after.seats[0]?.partnerAttached).toEqual(['pw']);
  expect(after.removed).toContain('pg');
});
