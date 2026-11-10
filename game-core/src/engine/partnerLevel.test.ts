import { validateAction } from './validate';
import { partnerAbilities, leaderAbilities } from './abilities';
import { enumerateLegalActions } from '../ai/enumerate';
import { chooseGreedyAction } from '../ai/policy';
import type { GameState, CardInstance, CardDef, PlayerState } from '../types';

/**
 * Alliance Partner Modification, two rules that were missing:
 *
 * 1. "Your Partner's level is determined by the total Decorations attached to
 *    your Main Character, and follows all the same rules outlined in the
 *    LEVEL UP! Section." A Partner never holds Decorations of its own.
 * 2. "Your Leading Character takes the full Damage ... After your Leading
 *    Character has taken Damage, the Infected is passed to your Partner." The
 *    leading character is the one fighting, so ITS abilities apply — a
 *    partner-led explore must not silently use the Main character's.
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
  // A Main character with no abilities at all, so anything observed in a
  // partner-led explore can only have come from the Partner.
  'ch-main': { id: 'ch-main', name: 'Main', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 100 },
  // Chris Redfield (Alliance) CH-019: L1 -20 ammo on a single weapon, L2 +5
  // damage. Level gates at 2 and 6 Decorations.
  'ch-partner': {
    id: 'ch-partner', name: 'Chris (Alliance)', type: 'character', set: 'alliance', text: '', copies: 1,
    maxHp: 80, level1At: 2, level2At: 6,
    levels: [{ level: 1, text: 'L1' }, { level: 2, text: 'L2' }],
    abilities: [
      { kind: 'singleWeaponAmmoDiscount', amount: 20, level: 1 },
      { kind: 'plusDamageThisTurn', amount: 5, level: 2 },
    ],
  },
  // A Main carrying the same L1 discount — proves the Main's abilities do not
  // leak into a partner-led explore.
  'ch-main-discount': {
    id: 'ch-main-discount', name: 'Main w/ discount', type: 'character', set: 'premier', text: '', copies: 1,
    maxHp: 100, level1At: 0,
    abilities: [{ kind: 'singleWeaponAmmoDiscount', amount: 20, level: 1 }],
  },
  'w20': { id: 'w20', name: 'Magnum', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 20, damage: 40 },
  'ma-3': { id: 'ma-3', name: 'Licker', type: 'infected', set: 'premier', text: '', copies: 2, hp: 40, attack: 30, decorations: 3 },
  // Too tough for w20 (40 damage) to defeat, so the leader actually takes the
  // 30 damage — needed to tell the two leaders apart.
  'ma-big': { id: 'ma-big', name: 'Armored Majini', type: 'infected', set: 'premier', text: '', copies: 2, hp: 100, attack: 30, decorations: 3 },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: over.rngState ?? 1, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, over.seat1)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: [] } },
    mansionDeck: over.mansionDeck ?? ['inf1'],
    mansionBottom: over.mansionBottom ?? [],
    removed: over.removed ?? [],
    cards: over.cards ?? {
      'c0': inst('c0', 'ch-main'), 'c1': inst('c1', 'ch-main'),
      'pc': inst('pc', 'ch-partner'),
      'w1': inst('w1', 'w20'),
      'inf1': inst('inf1', 'ma-3'),
    },
    cardDefs: DEFS,
    prompts: over.prompts ?? [], winners: [], log: [],
  };
}

// --- 1. the Partner's level follows the Main character's Decorations ---

test('partnerAbilities derives the Partner level from the Main Decorations', () => {
  const at = (decorations: number) => baseState({ seat0: { partnerInstanceId: 'pc', decorations } });
  // ch-partner gates L1 at 2 Decorations and L2 at 6.
  expect(partnerAbilities(at(0), 0)).toEqual([]);
  expect(partnerAbilities(at(1), 0)).toEqual([]);
  expect(partnerAbilities(at(2), 0).map(a => a.kind)).toEqual(['singleWeaponAmmoDiscount']);
  expect(partnerAbilities(at(6), 0).map(a => a.kind)).toEqual(['singleWeaponAmmoDiscount', 'plusDamageThisTurn']);
  // No partner -> no partner abilities.
  expect(partnerAbilities(baseState(), 0)).toEqual([]);
});

test('leaderAbilities resolves the leading character, not always the Main', () => {
  const s = baseState({ seat0: { partnerInstanceId: 'pc', decorations: 6 } });
  expect(leaderAbilities(s, 0, 'main')).toEqual([]);
  expect(leaderAbilities(s, 0, 'partner').map(a => a.kind)).toEqual(['singleWeaponAmmoDiscount', 'plusDamageThisTurn']);
});

// --- 2. a partner-led explore uses the Partner's abilities ---

test('a partner-led explore resolves the Partner abilities (ammo discount)', () => {
  // w20 costs 20 Ammo and the seat has none. The Partner's L1 -20 makes it free
  // when the Partner leads; a Main-led explore is unaffordable.
  const s = baseState({ seat0: { partnerInstanceId: 'pc', decorations: 2, turnAmmo: 0 } });
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 }).ok).toBe(false);
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1, leader: 'partner' }).ok).toBe(true);
});

test('the Partner levels up with the Main Decorations, gating its abilities', () => {
  // Below 2 Decorations the Partner has no abilities at all, so its -20
  // discount is absent and the same explore is unaffordable.
  const low = baseState({ seat0: { partnerInstanceId: 'pc', decorations: 1, turnAmmo: 0 } });
  expect(validateAction(low, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1, leader: 'partner' }).ok).toBe(false);
  const leveled = baseState({ seat0: { partnerInstanceId: 'pc', decorations: 2, turnAmmo: 0 } });
  expect(validateAction(leveled, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1, leader: 'partner' }).ok).toBe(true);
});

test('the Main abilities do not leak into a partner-led explore', () => {
  // The Main carries the -20 discount; the Partner is a plain character with
  // none. Leading with the Partner must not inherit the Main's discount.
  const s = baseState({
    seat0: { characterInstanceId: 'cm', partnerInstanceId: 'pc', turnAmmo: 0 },
    cards: {
      'cm': inst('cm', 'ch-main-discount'), 'c0': inst('c0', 'ch-main-discount'),
      'c1': inst('c1', 'ch-main'),
      'pc': inst('pc', 'ch-main'),
      'w1': inst('w1', 'w20'), 'inf1': inst('inf1', 'ma-3'),
    },
  });
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 }).ok).toBe(true);
  expect(validateAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1, leader: 'partner' }).ok).toBe(false);
});

// --- 3. bots can lead an explore with the Partner ---

test('bots enumerate a partner-led explore alongside the Main-led one', () => {
  const withPartner = baseState({ seat0: { partnerInstanceId: 'pc', decorations: 2, turnAmmo: 20 } });
  const leaders = enumerateLegalActions(withPartner, 0)
    .filter(a => a.type === 'explore')
    .map(a => (a.type === 'explore' ? a.leader : undefined));
  expect(leaders).toContain('partner');
  expect(leaders).toContain(undefined);

  const noPartner = baseState({ seat0: { turnAmmo: 20 } });
  const leaders2 = enumerateLegalActions(noPartner, 0)
    .filter(a => a.type === 'explore')
    .map(a => (a.type === 'explore' ? a.leader : undefined));
  expect(leaders2).not.toContain('partner');
});

test('the bot prefers a partner-led explore when the Partner is the healthier character', () => {
  // ma-3 deals 30. The Main is at 10 HP and would be downed; the Partner is at
  // 100. With nothing to buy, the 1-ply policy should pick the partner-led
  // explore to keep the Main alive.
  const s = baseState({
    seat0: { partnerInstanceId: 'pc', hp: 10, partnerHp: 100, turnGold: 0, turnAmmo: 20 },
    marketPiles: { hg: { pileId: 'hg', cards: [] } },
    mansionDeck: ['big1'],
    cards: {
      'c0': inst('c0', 'ch-main'), 'c1': inst('c1', 'ch-main'),
      'pc': inst('pc', 'ch-partner'),
      'w1': inst('w1', 'w20'),
      'big1': inst('big1', 'ma-big'),
    },
  });
  const action = chooseGreedyAction(s, 0);
  expect(action.type).toBe('explore');
  if (action.type === 'explore') expect(action.leader).toBe('partner');
});
