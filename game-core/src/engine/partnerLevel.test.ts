import { validateAction } from './validate';
import { applyAction } from './actions';
import { startTurn } from './game';
import { partnerAbilities, leaderAbilities, seatAbilities } from './abilities';
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
  // Steve Burnside (Alliance) CH-013 L1: recover 10 HP at turn start.
  'ch-steve': {
    id: 'ch-steve', name: 'Steve Burnside', type: 'character', set: 'alliance', text: '', copies: 1,
    maxHp: 70, level1At: 5,
    levels: [{ level: 1, text: 'Recover 10 Health at the beginning of each turn.' }],
    abilities: [{ kind: 'healAtTurnStart', amount: 10, level: 1 }],
  },
  // Barry Burton L1: one of his weapons gets +5 damage for the turn (manual).
  'ch-barry': {
    id: 'ch-barry', name: 'Barry Burton', type: 'character', set: 'premier', text: '', copies: 1,
    maxHp: 90, level1At: 0,
    levels: [{ level: 1, text: 'When attacking/exploring, one of Barry\'s weapons gets +5 damage for the turn.' }],
    abilities: [{ kind: 'plusDamageThisTurn', amount: 5, level: 1 }],
  },
  // Jack Krauser (Alliance) CH-014 L1: cannot use more than one weapon.
  'ch-krauser': {
    id: 'ch-krauser', name: 'Jack Krauser', type: 'character', set: 'alliance', text: '', copies: 1,
    maxHp: 90, level1At: 0,
    levels: [{ level: 1, text: 'Jack cannot use more than one weapon.' }],
    abilities: [{ kind: 'singleWeaponLimiter', level: 1 }],
  },
  'it-fads': { id: 'it-fads', name: 'First Aid Spray', type: 'item', set: 'premier', text: 'Heal your Character to full Health.', copies: 1, cost: 60, itemEffects: [{ kind: 'healToFull' }] },
  'it-gh': { id: 'it-gh', name: 'Green Herb', type: 'item', set: 'premier', text: 'Trash: heal 20.', copies: 2, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  'it-rh': { id: 'it-rh', name: 'Red Herb', type: 'item', set: 'premier', text: 'Trash with a Green Herb: heal to full.', copies: 2, cost: 20, itemEffects: [{ kind: 'healSelfAndPartnerToFull' }] },
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

// --- 4. the Partner is a full second character: its abilities are the seat's ---

/** A partner-mode seat whose Main has no abilities and whose Partner is `cardId`. */
function partnerSeat(partnerCardId: string, over: Partial<PlayerState> = {}): GameState {
  const partnerInst = 'px';
  return baseState({
    seat0: { characterInstanceId: 'cm', partnerInstanceId: partnerInst, ...over },
    cards: {
      'cm': inst('cm', 'ch-main'), 'c0': inst('c0', 'ch-main'), 'c1': inst('c1', 'ch-main'),
      [partnerInst]: inst(partnerInst, partnerCardId),
      'w1': inst('w1', 'w20'), 'inf1': inst('inf1', 'ma-3'),
    },
  });
}

test('seatAbilities unions the Main and Partner abilities', () => {
  const s = partnerSeat('ch-barry');
  expect(seatAbilities(s, 0).map(a => a.kind)).toEqual(['plusDamageThisTurn']);
  // No partner -> just the Main's (empty here).
  expect(seatAbilities(baseState(), 0)).toEqual([]);
});

test("per-character restrictions are not unioned onto the other character", () => {
  // The Partner is Krauser (singleWeaponLimiter): the Main must still be free
  // to bring two weapons, so the restriction stays on the Partner alone.
  const s = partnerSeat('ch-krauser');
  expect(seatAbilities(s, 0)).toEqual([]);
  expect(partnerAbilities(s, 0).map(a => a.kind)).toEqual(['singleWeaponLimiter']);
});

test('the Partner heals its own Health at the beginning of the turn', () => {
  // Steve Burnside L1: recover 10 HP at the start of each turn. The Main is at
  // full Health, so any recovery must land on the Partner's separate Health.
  const s = partnerSeat('ch-steve', { decorations: 5, hp: 100, partnerHp: 40, partnerMaxHp: 70 });
  const after = startTurn({ ...s, activeSeat: 0 });
  expect(after.seats[0]?.hp).toBe(100);
  expect(after.seats[0]?.partnerHp).toBe(50);
});

test('the Partner manual abilities are usable', () => {
  const s = partnerSeat('ch-barry');
  // The Main has no abilities, so index 0 is not a Main ability.
  expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
  const action = { type: 'useCharacterAbility' as const, seat: 0, abilityIndex: 0, character: 'partner' as const };
  expect(validateAction(s, action).ok).toBe(true);
  expect(applyAction(s, action).seats[0]?.weaponDamageBonusThisTurn).toBe(5);
});

test('bots enumerate the Partner manual abilities', () => {
  const s = partnerSeat('ch-barry');
  const partnerMoves = enumerateLegalActions(s, 0).filter(
    a => a.type === 'useCharacterAbility' && a.character === 'partner',
  );
  expect(partnerMoves.length).toBe(1);
});

// --- 5. healing reaches the Partner ---

test('a First Aid Spray heals both Characters', () => {
  const s = partnerSeat('ch-main', { hp: 30, partnerHp: 40, hand: ['spray'] });
  const after = applyAction({ ...s, cards: { ...s.cards, spray: inst('spray', 'it-fads') } },
    { type: 'playItem', seat: 0, instanceId: 'spray' });
  expect(after.seats[0]?.hp).toBe(100);
  expect(after.seats[0]?.partnerHp).toBe(100);
});

test('a Green Herb heal reaches both Characters', () => {
  const base = partnerSeat('ch-main', { hp: 30, partnerHp: 40, hand: ['gh'] });
  const s = { ...base, cards: { ...base.cards, gh: inst('gh', 'it-gh') } };
  const played = applyAction(s, { type: 'playItem', seat: 0, instanceId: 'gh' });
  const prompt = played.prompts.find(p => p.payload?.kind === 'healGreenHerb');
  expect(prompt).toBeDefined();
  const healed = applyAction(played, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
  expect(healed.seats[0]?.hp).toBe(50);
  expect(healed.seats[0]?.partnerHp).toBe(60);
});

test('a Red Herb heals both Characters to full', () => {
  const base = partnerSeat('ch-main', { hp: 30, partnerHp: 40, hand: ['rh', 'gh'] });
  const s = { ...base, cards: { ...base.cards, rh: inst('rh', 'it-rh'), gh: inst('gh', 'it-gh') } };
  const after = applyAction(s, { type: 'playItem', seat: 0, instanceId: 'rh' });
  expect(after.seats[0]?.hp).toBe(100);
  expect(after.seats[0]?.partnerHp).toBe(100);
});

// --- 6. the bot looks after its Partner ---

test('the bot plays a healing item when its Partner is hurt', () => {
  const base = partnerSeat('ch-main', { hp: 100, partnerHp: 20, turnGold: 0, turnAmmo: 0, hand: ['spray'] });
  const s = { ...base, cards: { ...base.cards, spray: inst('spray', 'it-fads') } };
  const action = chooseGreedyAction(s, 0);
  expect(action.type).toBe('playItem');
  if (action.type === 'playItem') expect(action.instanceId).toBe('spray');
});
