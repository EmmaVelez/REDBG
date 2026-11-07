import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import type { GameState, CardInstance, CardDef, PlayerState } from '../types';

/**
 * Multi-explore (rulebook "Extra Explore") + Alliance Partner Modification
 * explore rules.
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
  'w20': { id: 'w20', name: 'Magnum', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 20 },
  'w30': { id: 'w30', name: 'Shotgun', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 30 },
  'w40': { id: 'w40', name: 'Railgun', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 40 },
  'w-partner': { id: 'w-partner', name: 'Partner Gun', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 15 },
  'ma-1': { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 20, attack: 20, decorations: 1 },
  'ma-2': { id: 'ma-2', name: 'Zombie', type: 'infected', set: 'premier', text: '', copies: 3, hp: 15, attack: 10, decorations: 1 },
  'ma-3': { id: 'ma-3', name: 'Licker', type: 'infected', set: 'premier', text: '', copies: 2, hp: 40, attack: 30, decorations: 3 },
  'it-1': { id: 'it-1', name: 'Green Herb', type: 'item', set: 'premier', text: '', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: over.rngState ?? 1, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, over.seat1)],
    marketPiles: { hg: { pileId: 'hg', cards: [] } },
    mansionDeck: over.mansionDeck ?? ['inf1', 'inf2', 'inf3'],
    mansionBottom: over.mansionBottom ?? [],
    removed: over.removed ?? [],
    cards: over.cards ?? {
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'),
      'w1': inst('w1', 'w20'),
      'pw': inst('pw', 'w-partner'),
      'inf1': inst('inf1', 'ma-1'), 'inf2': inst('inf2', 'ma-2'), 'inf3': inst('inf3', 'ma-3'),
    },
    cardDefs: DEFS,
    prompts: over.prompts ?? [], winners: [], log: [],
  };
}

test('multi-explore combines revealed infected into one battle (defeated)', () => {
  // ma-1 (20 HP) + ma-2 (15 HP) = 35 combined; w40 deals 40 -> both defeated.
  const s = baseState({
    seat0: { hand: ['w40'], exploresLeft: 2, turnAmmo: 0 },
    cards: {
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'), 'w40': inst('w40', 'w40'),
      'inf1': inst('inf1', 'ma-1'), 'inf2': inst('inf2', 'ma-2'), 'inf3': inst('inf3', 'ma-3'),
    },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w40'], exploreCount: 2 });
  expect(after.seats[0]?.attached).toEqual(['inf1', 'inf2']);
  expect(after.seats[0]?.decorations).toBe(2);
  expect(after.seats[0]?.exploresLeft).toBe(0);
  expect(after.mansionDeck).toEqual(['inf3']);
  expect(after.seats[0]?.hp).toBe(100);
});

test('multi-explore failure deals the combined damage and bottoms every infected', () => {
  // ma-1 (20 HP) + ma-2 (15 HP) = 35; w20 deals 20 -> failure, 20 + 10 combined damage.
  const s = baseState({
    seat0: { hand: ['w1'], exploresLeft: 2, turnAmmo: 0 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 2 });
  expect(after.seats[0]?.attached).toEqual([]);
  expect(after.seats[0]?.hp).toBe(70);
  expect(after.seats[0]?.exploresLeft).toBe(0);
  expect(after.mansionDeck).toEqual(['inf3']);
  expect(after.mansionBottom).toEqual(['inf1', 'inf2']);
});

test('multi-explore spends exactly the chosen number of explores', () => {
  const s = baseState({
    seat0: { hand: ['w40'], exploresLeft: 3, turnAmmo: 0 },
    cards: {
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'), 'w40': inst('w40', 'w40'),
      'inf1': inst('inf1', 'ma-1'), 'inf2': inst('inf2', 'ma-2'), 'inf3': inst('inf3', 'ma-3'),
    },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w40'], exploreCount: 2 });
  expect(after.seats[0]?.exploresLeft).toBe(1);
});

test('exploreCount is bounded by the explore pool and the Mansion size', () => {
  const s = baseState({
    seat0: { hand: ['w1'], exploresLeft: 2, turnAmmo: 0 },
  });
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 3 }).ok).toBe(false);
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 0 }).ok).toBe(false);
  // Only 3 Mansion cards; a 4-explore batch cannot be revealed.
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 4 }).ok).toBe(false);
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 2 }).ok).toBe(true);
});

test('non-infected cards revealed in a multi-explore get a take/bottom choice', () => {
  const s = baseState({
    seat0: { hand: ['w1'], exploresLeft: 2, turnAmmo: 0 },
    mansionDeck: ['inf1', 'it1', 'inf2'],
    cards: {
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'), 'w1': inst('w1', 'w20'),
      'inf1': inst('inf1', 'ma-1'), 'inf2': inst('inf2', 'ma-2'), 'it1': inst('it1', 'it-1'),
    },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 2 });
  expect(after.seats[0]?.attached).toEqual(['inf1']);
  const prompt = after.prompts.find(p => p.payload?.kind === 'takeOrBottom');
  expect(prompt?.payload?.instanceId).toBe('it1');
  expect(after.mansionDeck).toEqual(['inf2']);
});

test('partner-attached weapon joins the explore but stays attached', () => {
  // Partner gun adds 15 damage: 20 + 15 = 35 >= ma-1 (20 HP).
  const s = baseState({
    seat0: { hand: ['w1'], partnerInstanceId: 'c1', partnerAttached: ['pw'], exploresLeft: 1, turnAmmo: 0 },
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1', 'pw'], exploreCount: 1 });
  expect(after.seats[0]?.attached).toEqual(['inf1']);
  expect(after.seats[0]?.partnerAttached).toEqual(['pw']);
  expect(after.seats[0]?.playArea).not.toContain('pw');
  expect(after.seats[0]?.playArea).toContain('w1');
});

test('partner weapon alone is legal (it is not in hand)', () => {
  const s = baseState({
    seat0: { hand: [], partnerInstanceId: 'c1', partnerAttached: ['pw'], exploresLeft: 1, turnAmmo: 0 },
  });
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['pw'], exploreCount: 1 }).ok).toBe(true);
});

test('partner leading takes the explore damage and dies at 0', () => {
  // ma-3 (40 HP, 30 damage); w20 deals 20 -> failure, partner takes 30.
  const s = baseState({
    seat0: { hand: ['w1'], partnerInstanceId: 'c1', partnerAttached: [], partnerHp: 5, exploresLeft: 1, turnAmmo: 0, hp: 100 },
    mansionDeck: ['inf3', 'inf1', 'inf2'],
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1, leader: 'partner' });
  expect(after.seats[0]?.hp).toBe(100);
  expect(after.seats[0]?.partnerInstanceId).toBeUndefined();
  expect(after.seats[0]?.partnerAttached).toBeUndefined();
});

test('main leads by default (partner takes no damage)', () => {
  const s = baseState({
    seat0: { hand: ['w1'], partnerInstanceId: 'c1', partnerAttached: [], partnerHp: 5, exploresLeft: 1, turnAmmo: 0, hp: 100 },
    mansionDeck: ['inf3', 'inf1', 'inf2'],
  });
  const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(after.seats[0]?.hp).toBe(70);
  expect(after.seats[0]?.partnerHp).toBe(5);
  expect(after.seats[0]?.partnerInstanceId).toBe('c1');
});

test('enumeration offers single and all-in explore counts', () => {
  const s = baseState({ seat0: { hand: ['w1'], exploresLeft: 3, turnAmmo: 0 } });
  const counts = new Set(
    enumerateLegalActions(s, 0)
      .filter((a): a is Extract<typeof a, { type: 'explore' }> => a.type === 'explore')
      .map(a => a.exploreCount),
  );
  expect(counts.has(1)).toBe(true);
  expect(counts.has(3)).toBe(true);
});

test('enumeration includes partner weapons in the explore pool', () => {
  const s = baseState({
    seat0: { hand: [], partnerInstanceId: 'c1', partnerAttached: ['pw'], exploresLeft: 1, turnAmmo: 0 },
  });
  const explores = enumerateLegalActions(s, 0).filter(a => a.type === 'explore');
  expect(explores.some(a => a.type === 'explore' && a.weapons.includes('pw'))).toBe(true);
});

test('a partner weapon cannot be used twice in one turn', () => {
  const s = baseState({
    seat0: { hand: [], partnerInstanceId: 'c1', partnerAttached: ['pw'], exploresLeft: 2, turnAmmo: 0 },
  });
  const first = applyAction(s, { type: 'explore', seat: 0, weapons: ['pw'], exploreCount: 1 });
  expect(first.seats[0]?.exploresLeft).toBe(1);
  expect(validateAction(first, { type: 'explore', seat: 0, weapons: ['pw'], exploreCount: 1 }).ok).toBe(false);
});
