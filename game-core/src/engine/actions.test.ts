import { applyAction } from './actions';
import { validateAction } from './validate';
import { exploreDamage } from './explore';
import { startTurn } from './game';
import { enumerateLegalActions } from '../ai/enumerate';
import type { GameState, CardInstance, CardDef, PlayerState } from '../types';

function seat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s, name: 'P' + s, controller: 'human',
    characterInstanceId: over.characterInstanceId ?? ('c' + s), hp: over.hp ?? 100, maxHp: over.maxHp ?? 100,
    decorations: over.decorations ?? 0, level: over.level ?? 1,
    turnAmmo: over.turnAmmo ?? 0, turnGold: over.turnGold ?? 50, actionsLeft: over.actionsLeft ?? 1,
    buysLeft: over.buysLeft ?? 1, exploresLeft: over.exploresLeft ?? 1,
    weaponDamageBonusThisTurn: over.weaponDamageBonusThisTurn ?? 0, attached: [],
    ...(over.partnerInstanceId !== undefined ? { partnerInstanceId: over.partnerInstanceId, partnerAttached: over.partnerAttached ?? [], partnerHp: over.partnerHp ?? over.hp ?? 100, partnerMaxHp: over.partnerMaxHp ?? over.maxHp ?? 100 } : {}),
    inventory: over.inventory ?? ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'],
    hand: over.hand ?? ['a1', 'i1', 'am1', 'w1', 'w2'],
    discard: over.discard ?? [], playArea: over.playArea ?? [], downed: over.downed ?? false, dead: over.dead ?? false,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'ac-1': { id: 'ac-1', name: 'Deadly Aim', type: 'action', set: 'premier', text: 'Deadly Aim', copies: 5, cost: 50, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] },
  'ac-2': { id: 'ac-2', name: 'Merchant', type: 'action', set: 'premier', text: 'Merchant', copies: 6, cost: 50, bonuses: { buys: 1, cards: 1, gold: 20 } },
  'ac-3': { id: 'ac-3', name: 'Reload', type: 'action', set: 'premier', text: 'Reload', copies: 5, cost: 20, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] },
  'ac-4': { id: 'ac-4', name: 'Umbrella', type: 'action', set: 'premier', text: 'Umbrella', copies: 5, cost: 50, actionEffects: [{ kind: 'moveHandCardToTopOfInventory' }] },
  'ac-5': { id: 'ac-5', name: 'Ominous Battle', type: 'action', set: 'premier', text: 'Ominous Battle', copies: 5, cost: 60, actionEffects: [{ kind: 'trashHandCard' }] },
  'ac-6': { id: 'ac-6', name: 'Shattered Memories', type: 'action', set: 'premier', text: 'Shattered Memories', copies: 5, cost: 20, actionEffects: [{ kind: 'trashUpToTwoFromDiscard' }] },
  'ac-7': { id: 'ac-7', name: 'Master of Unlocking', type: 'action', set: 'premier', text: 'Master of Unlocking', copies: 3, cost: 30, bonuses: { actions: 1 }, actionEffects: [{ kind: 'stealRevealedWeaponsFromOpponentsTopCards' }] },
  'it-1': { id: 'it-1', name: 'Green Herb', type: 'item', set: 'premier', text: 'Green Herb', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  'it-2': { id: 'it-2', name: 'First Aid Spray', type: 'item', set: 'premier', text: 'First Aid Spray', copies: 5, cost: 60, itemEffects: [{ kind: 'healToFull' }] },
  'am-1': { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Ammo x10', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'we-1': { id: 'we-1', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10 },
  'w9-1': { id: 'w9-1', name: 'Test Knife', type: 'weapon', set: 'premier', text: 'Test Knife', copies: 1, ammoReq: 0, damage: 5 },
  'w20-1': { id: 'w20-1', name: 'Test Magnum', type: 'weapon', set: 'premier', text: 'Test Magnum', copies: 1, ammoReq: 0, damage: 20 },
  'ma-1': { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: 'Majini', copies: 3, hp: 20, attack: 20, decorations: 1 },
  'ma-10': { id: 'ma-10', name: 'Uroboros Aheri', type: 'infected', set: 'premier', text: 'Uroboros', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] },
  'ch-1': { id: 'ch-1', name: 'Chris', type: 'character', set: 'premier', text: 'Chris', copies: 1, maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 }] },
  'ch-008': { id: 'ch-008', name: 'Chris Redfield', type: 'character', set: 'premier', text: 'Chris cannot be healed and cannot attach non-Infected cards.', copies: 1, level1At: 0, level2At: 4, maxHp: 120, abilities: [{ kind: 'noHealingNoNonInfectedAttach', level: 1 }, { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 2 }] },
  'ch-sheva': { id: 'ch-sheva', name: 'Sheva', type: 'character', set: 'premier', text: 'Sheva', copies: 1, maxHp: 80, level1At: 2, level2At: 4, abilities: [{ kind: 'exchangeHandWithInventoryTop', level: 1 }, { kind: 'ammoReqReduction', tag: 'rifle', amount: 20, level: 2 }] },
  'ch-barry': { id: 'ch-barry', name: 'Barry', type: 'character', set: 'premier', text: 'Barry', copies: 1, maxHp: 90, level1At: 2, level2At: 7, abilities: [{ kind: 'plusDamageThisTurn', amount: 5, level: 1 }, { kind: 'weaponTagPlusDamage', tag: 'magnum', amount: 20, level: 2 }] },
  'ch-ada': { id: 'ch-ada', name: 'Ada', type: 'character', set: 'premier', text: 'Ada', copies: 1, maxHp: 80, level1At: 4, level2At: 8, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'actionBonus', amount: 40, level: 2 }] },
  'ch-ada-n': { id: 'ch-ada-n', name: 'Ada (Nightmare)', type: 'character', set: 'nightmare', text: 'Ada (Nightmare)', copies: 1, maxHp: 70, level1At: 1, level2At: 10, abilities: [{ kind: 'cardsOnDamageTakenDuringTurn', amount: 2, level: 1 }, { kind: 'setHpToOnLethal', amount: 10, level: 2 }] },
  'ch-luis': { id: 'ch-luis', name: 'Luis Sera', type: 'character', set: 'nightmare', text: 'Luis Sera', copies: 1, maxHp: 80, level1At: 3, level2At: 5, abilities: [{ kind: 'optionalPlusOneCardWithDiscardCondition', level: 1 }, { kind: 'onDefeatMoveDiscardToInventoryBottom', level: 2 }] },
  'ch-wesker-n': { id: 'ch-wesker-n', name: 'Albert Wesker (Nightmare)', type: 'character', set: 'nightmare', text: 'Wesker (Nightmare)', copies: 1, maxHp: 110, level1At: 1, level2At: 6, abilities: [{ kind: 'plusOneCardAtTurnStartIfSingleLowHpPlayer', hpThreshold: 30, level: 1 }, { kind: 'choosePlayerToDiscardOneCardDuringTurn', level: 2 }] },
  'ch-leon-a': { id: 'ch-leon-a', name: 'Leon S. Kennedy (Alliance)', type: 'character', set: 'alliance', text: 'Leon (Alliance)', copies: 1, maxHp: 80, level1At: 1, level2At: 7, abilities: [{ kind: 'discardCardToInventoryBottom', level: 1 }, { kind: 'inventoryBottomToTop', level: 2 }] },
  'ch-billy': { id: 'ch-billy', name: 'Billy Coen (Alliance)', type: 'character', set: 'alliance', text: 'Billy (Alliance)', copies: 1, maxHp: 80, level1At: 1, level2At: 5, abilities: [{ kind: 'gainAmmoX10ForGold', amount: 10, level: 1 }, { kind: 'discardToHandIfTenPlus', threshold: 10, level: 2 }] },
  'ch-krauser-a': { id: 'ch-krauser-a', name: 'Jack Krauser (Alliance)', type: 'character', set: 'alliance', text: 'Krauser (Alliance)', copies: 1, maxHp: 90, level1At: 0, level2At: 6, abilities: [{ kind: 'singleWeaponLimiter', level: 1 }, { kind: 'plusDamagePerCardInHand', amount: 10, level: 2 }] },
  'ch-steve': { id: 'ch-steve', name: 'Steve Burnside (Alliance)', type: 'character', set: 'alliance', text: 'Steve (Alliance)', copies: 1, maxHp: 70, level1At: 5, level2At: 7, abilities: [{ kind: 'healAtTurnStart', amount: 10, level: 1 }, { kind: 'discardCardForHealAndDamage', cardId: 'ac-018', heal: 20, damage: 30, level: 2 }] },
  'ch-chris-a': { id: 'ch-chris-a', name: 'Chris Redfield (Alliance)', type: 'character', set: 'alliance', text: 'Chris (Alliance)', copies: 1, maxHp: 80, level1At: 3, level2At: 8, abilities: [{ kind: 'singleWeaponAmmoDiscount', amount: 20, level: 1 }, { kind: 'chosenWeaponTypeAmmoDiscount', amount: 20, level: 2 }] },
  'ch-jill-a': { id: 'ch-jill-a', name: 'Jill Valentine (Alliance)', type: 'character', set: 'alliance', text: 'Jill (Alliance)', copies: 1, maxHp: 90, level1At: 1, level2At: 6, abilities: [{ kind: 'partnerAttachedCountDamageBonus', amount: 10, threshold: 1, level: 1 }, { kind: 'offTurnFlashGrenadeLasPlagas', level: 2 }] },
  'ch-josh-a': { id: 'ch-josh-a', name: 'Josh Stone (Alliance)', type: 'character', set: 'alliance', text: 'Josh (Alliance)', copies: 1, maxHp: 80, level1At: 0, level2At: 4, abilities: [{ kind: 'weaponCostCap', maxCost: 50, level: 1 }, { kind: 'partnerAttachCapBonus', amount: 2, level: 2 }] },
  'ch-claire-a': { id: 'ch-claire-a', name: 'Claire Redfield (Alliance)', type: 'character', set: 'alliance', text: 'Claire (Alliance)', copies: 1, maxHp: 80, level1At: 3, level2At: 7, abilities: [{ kind: 'herbTrashDamageBonus', amount: 20, level: 1 }, { kind: 'doubleDamageOnBothHerbs', level: 2 }] },
  'ch-carlos-a': { id: 'ch-carlos-a', name: 'Carlos Oliveira (Alliance)', type: 'character', set: 'alliance', text: 'Carlos (Alliance)', copies: 1, maxHp: 90, level1At: 4, level2At: 9, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'perfectExploreReward', level: 2 }] },
  'w30-1': { id: 'w30-1', name: 'Test Shotgun', type: 'weapon', set: 'premier', text: 'Shotgun', copies: 1, ammoReq: 0, damage: 30 },
  'it-001': { id: 'it-001', name: 'Green Herb', type: 'item', set: 'premier', text: 'Trash: heal 20, or trash with another Green Herb to heal 60.', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  'it-004': { id: 'it-004', name: 'Red Herb', type: 'item', set: 'alliance', text: 'Trash: heal yourself and your partner to full Health.', copies: 2, cost: 20, itemEffects: [{ kind: 'healSelfAndPartnerToFull' }] },
  'we-expensive': { id: 'we-expensive', name: 'Bolt-Action Rifle', type: 'weapon', set: 'premier', text: 'Rifle', copies: 1, cost: 60, ammoReq: 30, damage: 20 },
  'we-017': { id: 'we-017', name: 'Flash Grenade', type: 'weapon', set: 'alliance', text: 'Flash Grenade', copies: 1, cost: 20, ammoReq: 0, damage: 0, weaponTags: ['explosive'] },
  'ma-025': { id: 'ma-025', name: 'Duvalia (Las Plagas)', type: 'infected', set: 'alliance', text: '', copies: 2, hp: 60, attack: 40, decorations: 5, plagas: true },
  'we-pistol': { id: 'we-pistol', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10, weaponType: 'handgun', weaponTags: ['gun', 'pistol'] },
  'we-knife': { id: 'we-knife', name: 'Combat Knife', type: 'weapon', set: 'premier', text: 'Knife', copies: 11, cost: 0, ammoReq: 0, damage: 5, weaponType: 'knife', weaponTags: ['melee', 'knife'] },
  'ac-018': { id: 'ac-018', name: 'Uroboros Injection', type: 'action', set: 'alliance', text: 'Uroboros Injection', copies: 1, cost: 30 },
  'am-001': { id: 'am-001', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Ammo x10', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'ch-becky': { id: 'ch-becky', name: 'Rebecca', type: 'character', set: 'premier', text: 'Rebecca', copies: 1, maxHp: 70, level1At: 2, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'trashFromHandAtWill', level: 2 }] },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: over.rngState ?? 1, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, over.seat1)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: ['mkr1'] } },
    mansionDeck: over.mansionDeck ?? ['inf1'], mansionBottom: over.mansionBottom ?? [], removed: over.removed ?? [],
    cards: {
      'a1': inst('a1', 'ac-1'), 'a2': inst('a2', 'ac-2'), 'a3': inst('a3', 'ac-3'), 'a4': inst('a4', 'ac-4'), 'a5': inst('a5', 'ac-5'), 'a6': inst('a6', 'ac-6'), 'a7': inst('a7', 'ac-7'),
      'i1': inst('i1', 'it-1'), 'i2': inst('i2', 'it-1'), 'i3': inst('i3', 'it-2'),
      'am1': inst('am1', 'am-1'), 'am2': inst('am2', 'am-1'),
      'w1': inst('w1', 'we-1'), 'w2': inst('w2', 'we-1'),
      'w5': inst('w5', 'w9-1'), 'w20': inst('w20', 'w20-1'),
      'dw1': inst('dw1', 'w9-1'),
      'mkr1': inst('mkr1', 'we-1'), 'inf1': inst('inf1', 'ma-1'), 'uro1': inst('uro1', 'ma-10'), 'gh1': inst('gh1', 'it-1'),
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'), 'c008': inst('c008', 'ch-008'),
      'cs': inst('cs', 'ch-sheva'), 'cb': inst('cb', 'ch-barry'), 'ca': inst('ca', 'ch-ada'), 'cr': inst('cr', 'ch-becky'), 'cada': inst('cada', 'ch-ada-n'), 'cl': inst('cl', 'ch-luis'), 'cw': inst('cw', 'ch-wesker-n'), 'cla': inst('cla', 'ch-leon-a'), 'cbilly': inst('cbilly', 'ch-billy'), 'amx': inst('amx', 'am-001'), 'ckra': inst('ckra', 'ch-krauser-a'), 'csteve': inst('csteve', 'ch-steve'), 'ac18': inst('ac18', 'ac-018'), 'cchris': inst('cchris', 'ch-chris-a'), 'wp': inst('wp', 'we-pistol'), 'wk': inst('wk', 'we-knife'), 'cjill': inst('cjill', 'ch-jill-a'), 'fg1': inst('fg1', 'we-017'), 'inf2': inst('inf2', 'ma-025'), 'cjosh': inst('cjosh', 'ch-josh-a'), 'wex': inst('wex', 'we-expensive'), 'cclaire': inst('cclaire', 'ch-claire-a'), 'rh1': inst('rh1', 'it-004'), 'ccarlos': inst('ccarlos', 'ch-carlos-a'), 'w30': inst('w30', 'w30-1'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'), 'inv4': inst('inv4', 'am-1'), 'inv5': inst('inv5', 'am-1'), 'inv6': inst('inv6', 'am-1'), 'inv7': inst('inv7', 'am-1'), 'inv8': inst('inv8', 'am-1'),
    },
    cardDefs: DEFS, prompts: over.prompts ?? [], winners: [], log: [],
  };
}



function pr(s: GameState): { id: string } & { payload?: Record<string, string>; options: string[]; seat: number; text: string } {
  return s.prompts[0] as unknown as { id: string } & { payload?: Record<string, string>; options: string[]; seat: number; text: string };
}
function p0(s: GameState): PlayerState {
  return s.seats[0] as PlayerState;
}
test('play action card (Deadly Aim)', () => {
  const s = applyAction(baseState(), { type: 'playActionCard', seat: 0, instanceId: 'a1' });
  expect(p0(s).hand).not.toContain('a1');
  expect(p0(s).playArea).toContain('a1');
  expect(p0(s).actionsLeft).toBe(0);
  expect(p0(s).weaponDamageBonusThisTurn).toBe(10);
  expect(s.version).toBe(2);
  expect(s.log.length).toBe(1);
});

test('play action card with bonuses (Merchant)', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a2', 'i1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a2' });
  expect(p0(s).hand).not.toContain('a2');
  expect(p0(s).hand).toContain('inv1'); // drew 1 from inventory
  expect(p0(s).turnGold).toBe(70);
  expect(p0(s).buysLeft).toBe(2);
  expect(p0(s).actionsLeft).toBe(0);
});

test('Reload prompt created', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a3'], discard: ['dw1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a3' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('recoverWeaponFromDiscardToHand');
  expect(pr(s).options).toEqual(['dw1']);
  expect(pr(s).seat).toBe(0);
});

test('Reload resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a3'], discard: ['dw1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a3' });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hand).toContain('dw1');
  expect(p0(s2).discard).toEqual([]);
  expect(s2.prompts).toEqual([]);
});

test('Umbrella prompt + resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a4', 'w1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a4' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).options).toEqual(['w1', 'am1']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hand).not.toContain('w1');
  expect(p0(s2).inventory[0]).toBe('w1');
  expect(s2.prompts).toEqual([]);
});

test('Ominous Battle resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a5', 'w1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a5' });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(p0(s2).hand).not.toContain('am1');
  expect(s2.removed).toContain('am1');
});

test('Green Herb heal 20', () => {
  const s = applyAction(baseState({ seat0: { hp: 50, hand: ['i1'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  expect(s.removed).toContain('i1');
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('healGreenHerb');
  // No second herb in hand: only "Heal 20" is offered — Heal 60 is illegal.
  expect(pr(s).options).toEqual(['Heal 20']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hp).toBe(70);
});

test('Green Herb healing requires the option to be offered (validator rejects out-of-range)', () => {
  const s = applyAction(baseState({ seat0: { hp: 50, hand: ['i1'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  // Only one option exists here; option 1 (Heal 60) must be rejected.
  expect(validateAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 }).ok).toBe(false);
});

test('Green Herb heal 60', () => {
  const s = applyAction(baseState({ seat0: { hp: 30, hand: ['i1', 'i2'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  // With a second herb in hand, both options are offered.
  expect(pr(s).options).toEqual(['Heal 20', 'Heal 60']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(p0(s2).hp).toBe(90);
  // Both the played herb AND the second herb from hand are trashed.
  expect(p0(s2).hand).not.toContain('i2');
  expect(s2.removed).toEqual(['i1', 'i2']);
});

test('First Aid Spray', () => {
  const s = applyAction(baseState({ seat0: { hp: 30, hand: ['i3'] } }), { type: 'playItem', seat: 0, instanceId: 'i3' });
  expect(p0(s).hp).toBe(100);
  expect(s.removed).toContain('i3');
  expect(s.prompts).toEqual([]);
});

test('playAmmo', () => {
  const s = applyAction(baseState({ seat0: { hand: ['am1', 'am2'] } }), { type: 'playAmmo', seat: 0, instanceId: 'am1' });
  expect(p0(s).turnAmmo).toBe(10);
  expect(p0(s).turnGold).toBe(60);
  expect(p0(s).playArea).toContain('am1');
  expect(p0(s).hand).not.toContain('am1');
});

test('buy', () => {
  const s = applyAction(baseState(), { type: 'buy', seat: 0, pileId: 'hg' });
  expect(p0(s).turnGold).toBe(30);
  expect(p0(s).buysLeft).toBe(0);
  expect(p0(s).discard).toContain('mkr1');
  expect((s.marketPiles.hg as { pileId: string; cards: string[] }).cards).toEqual([]);
});

test('explore defeated', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w20', 'w5'] } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(s).decorations).toBe(1);
  expect(p0(s).attached).toEqual(['inf1']);
  expect(s.mansionDeck).toEqual([]);
  expect(s.mansionBottom).toEqual([]);
  expect(p0(s).exploresLeft).toBe(0);
  expect(p0(s).dead).toBe(false);
  expect(p0(s).hp).toBe(100);
});

test('explore consumes ammo from the pool, keeps ammo cards in hand', () => {
  // w1 = we-1 (ammoReq 20). Pool starts at 30; two ammo cards in hand.
  const s = applyAction(baseState({ seat0: { hand: ['w1', 'am1', 'am2'], turnAmmo: 30 } }), { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(p0(s).turnAmmo).toBe(10); // 30 - 20 requirement consumed
  expect(p0(s).hand).toEqual(['am1', 'am2']); // ammo cards stay in hand
  expect(p0(s).playArea).toContain('w1'); // weapon moved to play area
});

test('explore with ammo cards removed from hand still works (pool-based ammo)', () => {
  // Classic bug repro: play ammo cards (for gold) BEFORE exploring; the
  // weapon must still be usable because ammo is a resource, not hand cards.
  const s1 = applyAction(baseState({ seat0: { hand: ['w1', 'am1', 'am2'] } }), { type: 'playAmmo', seat: 0, instanceId: 'am1' });
  // am1 grants +10 ammo +10 gold; the card leaves the hand
  expect(p0(s1).turnAmmo).toBe(10);
  expect(p0(s1).turnGold).toBe(60); // 50 base + 10
  expect(p0(s1).hand).not.toContain('am1');
  const s2 = applyAction(s1, { type: 'playAmmo', seat: 0, instanceId: 'am2' });
  expect(p0(s2).turnAmmo).toBe(20); // pool now covers w1's 20 ammo req
  expect(p0(s2).hand).not.toContain('am2');
  // explore with the weapon alone — no ammo cards in hand — pool funds it
  const s3 = applyAction(s2, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(p0(s3).turnAmmo).toBe(0); // 20 pool - 20 req consumed
  expect(p0(s3).playArea).toContain('w1');
});

test('explore level-up', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w20', 'w5'], decorations: 4 } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(s).level).toBe(2);
});

test('explore not defeated', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(80);
  expect(s.mansionBottom).toEqual(['inf1']);
  expect(p0(s).attached).toEqual([]);
  expect(p0(s).decorations).toBe(0);
});
test('Nightmare Ada L1: damage during your turn draws 2 cards', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cada', level: 1 as const, hand: ['w5'], inventory: ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'] } });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(80);            // 100 - 20 attack from the Majini
  expect(p0(s).hand.length).toBe(2);    // +2 drawn by the ability
  expect(p0(s).inventory.length).toBe(6); // 8 - 2 drawn
});

test('Alliance Carlos L1: can look at the top of the Mansion before exploring', () => {
  const base = baseState({ seat0: { characterInstanceId: 'ccarlos', level: 1 as const, hand: ['w1'], turnAmmo: 100 } });
  const s = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('lookAtMansionTop');
});

test('Alliance Carlos L2: a perfect explore lets him take a discard card to hand', () => {
  // w20 (Test Magnum, 20 damage) exactly matches ma-1 (Majini, 20 HP).
  const base = baseState({
    seat0: { characterInstanceId: 'ccarlos', level: 2 as const, hand: ['w20'], turnAmmo: 100, discard: ['a1'] },
    mansionDeck: ['inf1'],
  });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('perfectExploreReward');
  const after = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(after.seats[0]!.hand).toContain('a1');
  expect(after.seats[0]!.discard).not.toContain('a1');
});

test('Alliance Carlos L2: no prompt when the damage overkills', () => {
  // w30 (30 damage) overkills ma-1 (20 HP), so the damage is not equal to its health.
  const base = baseState({
    seat0: { characterInstanceId: 'ccarlos', level: 2 as const, hand: ['w30'], turnAmmo: 100, discard: ['a1'] },
    mansionDeck: ['inf1'],
  });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w30'], exploreCount: 1 });
  expect(s.prompts.length).toBe(0);
  expect(s.seats[0]!.discard).toContain('a1');
});
test('Alliance Claire L1: +20 damage when a herb is trashed from hand', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cclaire', level: 1 as const, hand: ['gh1', 'w1'], turnAmmo: 100 } });
  const played = applyAction(base, { type: 'playItem', seat: 0, instanceId: 'gh1' });
  const promptId = played.prompts[played.prompts.length - 1]?.id ?? '';
  const s = applyAction(played, { type: 'chooseOption', seat: 0, promptId, option: 0 });
  expect(s.seats[0]!.weaponDamageBonusThisTurn).toBe(20);
  expect(exploreDamage(s, 0, ['w1'])).toBe(30); // 10 base + 20
});

test('Alliance Claire L2: double damage when both herbs are trashed', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cclaire', level: 2 as const, hand: ['rh1', 'gh1', 'w1'], turnAmmo: 100 } });
  const s = applyAction(base, { type: 'playItem', seat: 0, instanceId: 'rh1' });
  expect(s.seats[0]!.damageMultiplierThisTurn).toBe(2);
  expect(s.seats[0]!.weaponDamageBonusThisTurn).toBe(20); // L1 still applies
  expect(exploreDamage(s, 0, ['w1'])).toBe(60); // (10 + 20) * 2
  // a character without the abilities gets neither
  const plain = baseState({ seat0: { characterInstanceId: 'c0', level: 2 as const, hand: ['rh1', 'gh1', 'w1'], turnAmmo: 100 } });
  const p = applyAction(plain, { type: 'playItem', seat: 0, instanceId: 'rh1' });
  expect(p.seats[0]!.damageMultiplierThisTurn).toBeUndefined();
  expect(p.seats[0]!.weaponDamageBonusThisTurn).toBe(0);
});

test('Alliance Claire: damage multiplier resets at the start of the next turn', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cclaire', level: 2 as const, hand: ['rh1', 'gh1', 'w1'], turnAmmo: 100 } });
  const s = applyAction(base, { type: 'playItem', seat: 0, instanceId: 'rh1' });
  expect(s.seats[0]!.damageMultiplierThisTurn).toBe(2);
  const next = startTurn({ ...s, activeSeat: 0 });
  expect(next.seats[0]!.damageMultiplierThisTurn).toBeUndefined();
  expect(next.seats[0]!.weaponDamageBonusThisTurn).toBe(0);
});
test('Alliance Josh L1: cannot explore with weapons costing 50 or more', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cjosh', level: 1 as const, hand: ['w1', 'wex'], turnAmmo: 100 } });
  expect(validateAction(base, { type: 'explore', seat: 0, weapons: ['wex'], exploreCount: 1 }).ok).toBe(false);
  expect(validateAction(base, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 }).ok).toBe(true);
  const legal = enumerateLegalActions(base, 0);
  expect(legal.some(a => a.type === 'explore' && a.weapons.includes('wex'))).toBe(false);
  expect(legal.some(a => a.type === 'explore' && a.weapons.includes('w1'))).toBe(true);
});

test('Alliance Josh L2: partner may attach up to 4 cards', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cjosh', level: 2 as const, hand: ['w1', 'w2', 'wp'], partnerInstanceId: 'cp#1', partnerAttached: ['a1', 'a2'], actionsLeft: 4 } });
  expect(validateAction(base, { type: 'attachToPartner', seat: 0, instanceId: 'w1' }).ok).toBe(true);
  const three = { ...base, seats: base.seats.map(s => (s.seat === 0 ? { ...s, partnerAttached: ['a1', 'a2', 'a3'] } : s)) };
  expect(validateAction(three, { type: 'attachToPartner', seat: 0, instanceId: 'w1' }).ok).toBe(true);
  const four = { ...base, seats: base.seats.map(s => (s.seat === 0 ? { ...s, partnerAttached: ['a1', 'a2', 'a3', 'a4'] } : s)) };
  expect(validateAction(four, { type: 'attachToPartner', seat: 0, instanceId: 'w1' }).ok).toBe(false);
  expect(validateAction(four, { type: 'attachToPartner', seat: 0, instanceId: 'w1', replaceIndex: 0 }).ok).toBe(true);
  // a character without the bonus keeps the base cap of 2
  const plain = baseState({ seat0: { characterInstanceId: 'c0', level: 2 as const, hand: ['w1'], partnerInstanceId: 'cp#1', partnerAttached: ['a1', 'a2'], actionsLeft: 2 } });
  expect(validateAction(plain, { type: 'attachToPartner', seat: 0, instanceId: 'w1' }).ok).toBe(false);
});
test('Chris L1 as main: may still attach weapons to partner (cap 2)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'c008', level: 1 as const, hand: ['wp', 'wk'], partnerInstanceId: 'c0', partnerAttached: [], actionsLeft: 4 } });
  expect(validateAction(base, { type: 'attachToPartner', seat: 0, instanceId: 'wp' }).ok).toBe(true);
  // The client builds its buttons from the enumerator, so the attach action
  // must actually surface there for a Chris-main seat too.
  expect(enumerateLegalActions(base, 0).some(a => a.type === 'attachToPartner' && a.instanceId === 'wp')).toBe(true);
  const two = { ...base, seats: base.seats.map(s => (s.seat === 0 ? { ...s, partnerAttached: ['a1', 'a2'] } : s)) };
  expect(validateAction(two, { type: 'attachToPartner', seat: 0, instanceId: 'wk' }).ok).toBe(false);
  expect(validateAction(two, { type: 'attachToPartner', seat: 0, instanceId: 'wk', replaceIndex: 0 }).ok).toBe(true);
});

test('Chris L1 as partner: cannot receive attachments', () => {
  const base = baseState({ seat0: { characterInstanceId: 'c0', level: 2 as const, hand: ['wp'], partnerInstanceId: 'c008', partnerAttached: [], actionsLeft: 4 } });
  expect(validateAction(base, { type: 'attachToPartner', seat: 0, instanceId: 'wp' }).ok).toBe(false);
});

test('Alliance Jill L1: +10 damage when her partner has 1 or fewer attached', () => {
  const withPartner = baseState({ seat0: { characterInstanceId: 'cjill', level: 1 as const, hand: ['w1'], turnAmmo: 100, partnerInstanceId: 'cp#1', partnerAttached: [] } });
  expect(exploreDamage(withPartner, 0, ['w1'])).toBe(20); // 10 base + 10
  const twoAttached = { ...withPartner, seats: withPartner.seats.map(s => (s.seat === 0 ? { ...s, partnerAttached: ['x1', 'x2'] } : s)) };
  expect(exploreDamage(twoAttached, 0, ['w1'])).toBe(10);
  const noPartner = baseState({ seat0: { characterInstanceId: 'cjill', level: 1 as const, hand: ['w1'], turnAmmo: 100 } });
  expect(exploreDamage(noPartner, 0, ['w1'])).toBe(10);
});

test('Alliance Jill L2: Flash Grenade reactive window triggers on a Las Plagas reveal', () => {
  const base = baseState({
    seat0: { hand: ['w20'], turnAmmo: 100 },
    seat1: { characterInstanceId: 'cjill', level: 2 as const, hand: ['fg1'] },
    mansionDeck: ['inf2'],
  });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('jillFlashGrenade');
  expect(pr(s).seat).toBe(1);
  // ability-driven, not id-driven: a different character gets no prompt
  const notJill = { ...base, seats: base.seats.map(x => (x.seat === 1 ? { ...x, characterInstanceId: 'c0' } : x)) };
  const s2 = applyAction(notJill, { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(s2.prompts.length).toBe(0);
});
test('Alliance Chris L1: -20 ammo only when using exactly one weapon', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cchris', level: 1 as const, hand: ['wp', 'wk'], turnAmmo: 100 } });
  const one = applyAction(base, { type: 'explore', seat: 0, weapons: ['wp'], exploreCount: 1 });
  expect(p0(one).turnAmmo).toBe(100); // 20 req - 20 discount = 0 consumed
  const two = applyAction(base, { type: 'explore', seat: 0, weapons: ['wp', 'wk'], exploreCount: 1 });
  expect(p0(two).turnAmmo).toBe(80);  // no discount with two weapons
});

test('Alliance Chris L2: chosen weapon type gets -20 ammo for the turn', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cchris', level: 2 as const, hand: ['wp'], turnAmmo: 100 } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('chrisAmmoDiscountType');
  expect(pr(s1).options).toEqual(['handgun', 'Decline']);
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(p0(s2).chrisAmmoDiscountTypes).toEqual(['handgun']);
  const s3 = applyAction(s2, { type: 'explore', seat: 0, weapons: ['wp'], exploreCount: 1 });
  expect(p0(s3).turnAmmo).toBe(100); // 20 - 20 = 0 required
  const s4 = startTurn(s3);
  expect(s4.seats[0]?.chrisAmmoDiscountTypes).toBeUndefined(); // reset each turn
  const noType = baseState({ seat0: { characterInstanceId: 'cchris', level: 2 as const, hand: ['w1'] } });
  expect(validateAction(noType, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
});
test('Alliance Steve L1: recovers 10 HP at the start of his turn', () => {
  const base = baseState({ seat0: { characterInstanceId: 'csteve', level: 1 as const, hp: 40, maxHp: 70 } });
  const s = startTurn({ ...base, activeSeat: 0 });
  expect(s.seats[0]?.hp).toBe(50); // 40 + 10, capped at max
  const capped = baseState({ seat0: { characterInstanceId: 'csteve', level: 1 as const, hp: 65, maxHp: 70 } });
  expect(startTurn({ ...capped, activeSeat: 0 }).seats[0]?.hp).toBe(70);
});

test('Alliance Steve L2: discard Uroboros Injection for +20 HP and +30 damage', () => {
  const base = baseState({ seat0: { characterInstanceId: 'csteve', level: 2 as const, hp: 40, maxHp: 70, hand: ['ac18', 'w1'] } });
  const s = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(p0(s).hand).toEqual(['w1']);
  expect(p0(s).discard).toEqual(['ac18']);
  expect(p0(s).hp).toBe(60);
  expect(p0(s).weaponDamageBonusThisTurn).toBe(30);
  const without = baseState({ seat0: { characterInstanceId: 'csteve', level: 2 as const, hand: ['w1'] } });
  expect(validateAction(without, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
});
test('Alliance Krauser L1: cannot explore with more than one weapon', () => {
  const base = baseState({ seat0: { characterInstanceId: 'ckra', level: 1 as const, hand: ['w1', 'w2'], turnAmmo: 100 } });
  expect(validateAction(base, { type: 'explore', seat: 0, weapons: ['w1', 'w2'], exploreCount: 1 }).ok).toBe(false);
  expect(validateAction(base, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 }).ok).toBe(true);
});

test('Alliance Krauser L2: +10 damage per card in hand', () => {
  const base = baseState({ seat0: { characterInstanceId: 'ckra', level: 2 as const, hand: ['w1', 'a1', 'a2', 'a3'], turnAmmo: 100 } });
  expect(exploreDamage(base, 0, ['w1'])).toBe(50); // 10 base + 10 x 4 cards in hand
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(p0(s).attached).toEqual(['inf1']); // 20 HP Majini defeated by 50 damage
  // level-gated: at level 1 the bonus does not apply
  const locked = baseState({ seat0: { characterInstanceId: 'ckra', level: 1 as const, hand: ['w1', 'a1', 'a2', 'a3'], turnAmmo: 100 } });
  expect(exploreDamage(locked, 0, ['w1'])).toBe(10);
});
test('Alliance Billy L1: gain an Ammo x10 and get +10 gold', () => {
  const base = baseState({
    seat0: { characterInstanceId: 'cbilly', level: 1 as const, hand: ['w1'] },
    marketPiles: { am10: { pileId: 'am10', cards: ['amx'] } },
  });
  const s = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(p0(s).discard).toEqual(['amx']);       // gain = Resource Area -> discard
  expect(p0(s).turnGold).toBe(60);              // 50 base + 10
  expect(s.marketPiles['am10']?.cards).toEqual([]);
});

test('Alliance Billy L2: move a discard card to hand with 10+ discard', () => {
  const discard = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'i1', 'i2'];
  const base = baseState({ seat0: { characterInstanceId: 'cbilly', level: 2 as const, hand: ['w1'], discard } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('discardToHandIfTenPlus');
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(p0(s2).hand).toEqual(['w1', 'a1']);
  expect(p0(s2).discard).toHaveLength(9);
});

test('Alliance Billy: L2 needs 10+ discard, L1 needs an Ammo x10 in the market', () => {
  const fewDiscard = baseState({ seat0: { characterInstanceId: 'cbilly', level: 2 as const, hand: ['w1'], discard: ['a1'] } });
  expect(validateAction(fewDiscard, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  const noAmmo = baseState({ seat0: { characterInstanceId: 'cbilly', level: 2 as const, hand: ['w1'] }, marketPiles: { hg: { pileId: 'hg', cards: ['mkr1'] } } });
  expect(validateAction(noAmmo, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
});
test('Alliance Leon L1: move a discard card to the bottom of the inventory', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cla', level: 1 as const, hand: ['w1'], discard: ['a1', 'a2'], inventory: ['inv1', 'inv2'] } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('discardCardToInventoryBottom');
  expect(pr(s1).options).toEqual(['a1', 'a2']);
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 1 });
  expect(p0(s2).discard).toEqual(['a1']);
  expect(p0(s2).inventory).toEqual(['inv1', 'inv2', 'a2']); // appended = bottom of the draw pile
});

test('Alliance Leon L2: move the bottom inventory card to the top', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cla', level: 2 as const, hand: ['w1'], inventory: ['inv1', 'inv2', 'inv3'] } });
  const s = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(p0(s).inventory).toEqual(['inv3', 'inv1', 'inv2']);
});

test('Alliance Leon: empty zones rejected, ability once per turn', () => {
  const emptyDiscard = baseState({ seat0: { characterInstanceId: 'cla', level: 2 as const, hand: ['w1'], discard: [] } });
  expect(validateAction(emptyDiscard, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
  const emptyInv = baseState({ seat0: { characterInstanceId: 'cla', level: 2 as const, hand: ['w1'], inventory: [] } });
  expect(validateAction(emptyInv, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  const base = baseState({ seat0: { characterInstanceId: 'cla', level: 2 as const, hand: ['w1'], inventory: ['inv1'] } });
  const used = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(validateAction(used, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
});
test('Nightmare Wesker L2: the single low-HP player is prompted to discard', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cw', level: 2 as const, hand: ['w1'] }, seat1: { hp: 30, hand: ['a1', 'a2'] } });
  const s = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('weskerDiscardOneCard');
  expect(pr(s).seat).toBe(1);            // the victim resolves it, not Wesker
  expect(pr(s).options).toEqual(['a1', 'a2']);
});

test('Nightmare Wesker L2: the victim discards the chosen card', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cw', level: 2 as const, hand: ['w1'] }, seat1: { hp: 25, hand: ['a1', 'a2'] } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 1, promptId: pr(s1).id, option: 0 });
  expect(s2.seats[1]?.hand).toEqual(['a2']);
  expect(s2.seats[1]?.discard).toEqual(['a1']);
  expect(s2.prompts.length).toBe(0);
  // once per turn: a second activation is rejected by the log scan
  expect(validateAction(s2, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
});

test('Nightmare Wesker L2: rejected without exactly one low-HP player, and level-gated', () => {
  const noTarget = baseState({ seat0: { characterInstanceId: 'cw', level: 2 as const, hand: ['w1'] }, seat1: { hp: 80, hand: ['a1'] } });
  expect(validateAction(noTarget, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  const locked = baseState({ seat0: { characterInstanceId: 'cw', level: 1 as const, hand: ['w1'] }, seat1: { hp: 20, hand: ['a1'] } });
  expect(validateAction(locked, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
});
test('Luis Sera L2: defeating an Infected offers discard-to-inventory moves', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cl', level: 2 as const, hand: ['w20'], discard: ['a1', 'a2'] } });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(s).attached).toEqual(['inf1']);
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('luisSeraDiscardToInventory');
  expect(pr(s).options).toEqual(['a1', 'a2', 'DONE']);
});

test('Luis Sera L2: a moved card goes to the bottom of the Inventory', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cl', level: 2 as const, hand: ['w20'], discard: ['a1', 'a2'], inventory: ['inv1', 'inv2'] } });
  const s1 = applyAction(base, { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(p0(s2).discard).toEqual(['a2']);
  expect(p0(s2).inventory).toEqual(['inv1', 'inv2', 'a1']); // appended = bottom of the draw pile
  expect(pr(s2).options).toEqual(['a2', 'DONE']);            // chain continues
  const s3 = applyAction(s2, { type: 'chooseOption', seat: 0, promptId: pr(s2).id, option: 1 }); // DONE
  expect(s3.prompts.length).toBe(0);
  expect(p0(s3).discard).toEqual(['a2']);
});

test('Luis Sera L2: no prompt with an empty discard, and level-gated at L1', () => {
  const empty = applyAction(baseState({ seat0: { characterInstanceId: 'cl', level: 2 as const, hand: ['w20'], discard: [] } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(empty).attached).toEqual(['inf1']);
  expect(empty.prompts.length).toBe(0);
  const locked = applyAction(baseState({ seat0: { characterInstanceId: 'cl', level: 1 as const, hand: ['w20'], discard: ['a1'] } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(locked.prompts.length).toBe(0);
});
test('Nightmare Ada L2: lethal damage sets HP to 10 instead of 0 (every time)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cada', level: 2 as const, hp: 10, hand: ['w5'] } });
  const s = applyAction(base, { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(10);      // 10 - 20 attack would be 0 -> replaced with 10
  expect(p0(s).downed).toBe(false);
  expect(p0(s).dead).toBe(false);
});

test('Nightmare Ada L2: non-lethal damage is unaffected, and the ability is level-gated', () => {
  const nonLethal = applyAction(baseState({ seat0: { characterInstanceId: 'cada', level: 2 as const, hp: 80, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(nonLethal).hp).toBe(60); // 80 - 20, no replacement
  const locked = applyAction(baseState({ seat0: { characterInstanceId: 'cada', level: 1 as const, hp: 10, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(locked).hp).toBe(0);
  expect(p0(locked).downed).toBe(true);
});

test('Nightmare Ada L2: reveal-time AoE lethal damage is replaced too', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cada', level: 2 as const, hp: 10, hand: ['w5'] } });
  const guardianDef: CardDef = { id: 'ma-037', name: 'Guardian of Insanity', type: 'infected', set: 'premier', text: '', copies: 3, hp: 30, attack: 20, decorations: 2 };
  const withGuardian = {
    ...base,
    cardDefs: { ...DEFS, 'ma-037': guardianDef },
    cards: { ...base.cards, 'inf1': inst('inf1', 'ma-037') },
  };
  const s = applyAction(withGuardian, { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(10);      // AoE 10 -> 0 -> 10, then attack 20 -> 0 -> 10
  expect(p0(s).downed).toBe(false);
});
test('Nightmare Ada L1: no draw when the damage downs her', () => {
  const s = applyAction(baseState({ seat0: { characterInstanceId: 'cada', level: 1 as const, hp: 10, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(0);
  expect(p0(s).downed).toBe(true);
  expect(p0(s).hand.length).toBe(0); // downed characters have no hand; no cards lost at revive
});
test('Nightmare Ada L1: no draw at level 0 (ability locked) or without the ability', () => {
  const locked = applyAction(baseState({ seat0: { characterInstanceId: 'cada', level: 0 as const, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(locked.seats[0]?.hp).toBe(80);
  expect(p0(locked).hand.length).toBe(0);
  const plain = applyAction(baseState({ seat0: { characterInstanceId: 'c0', level: 1 as const, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(plain).hp).toBe(80);
  expect(p0(plain).hand.length).toBe(0);
});

test('explore downed', () => {
  const s = applyAction(baseState({ seat0: { hp: 10, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).downed).toBe(true);
  expect(p0(s).hand).toEqual([]);
  expect(p0(s).playArea).toContain('w5'); // used weapons stay in play area
  expect(p0(s).inventory.length).toBe(8); // hand+discard were empty at flip; inventory unchanged
  expect(p0(s).attached).toEqual([]);
});

test('explore Uroboros shuffle-back', () => {
  const s = applyAction(baseState({ mansionDeck: ['uro1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(30);
  expect(s.mansionDeck).toContain('uro1');
  expect(s.mansionBottom).toEqual([]);
});

test('explore non-infected take', () => {
  const s = applyAction(baseState({ mansionDeck: ['gh1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('takeOrBottom');
  expect(pr(s).options).toEqual(['Take', 'Send to bottom of Mansion']);
  expect(s.mansionDeck).toEqual([]);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).discard).toContain('gh1');
  expect(s2.prompts).toEqual([]);
});

test('explore non-infected bottom', () => {
  const s = applyAction(baseState({ mansionDeck: ['gh1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(s2.mansionBottom).toEqual(['gh1']);
  expect(p0(s2).discard).toEqual([]);
});

test('endTurn', () => {
  const s = applyAction(baseState(), { type: 'endTurn', seat: 0 });
  expect(p0(s).hand.length).toBe(5);
  expect(p0(s).inventory.length).toBe(3);
  expect(p0(s).playArea).toEqual([]);
  expect(p0(s).discard.length).toBe(5);
  expect(s.activeSeat).toBe(1);
  expect(s.turnNumber).toBe(2);
  expect(p0(s).hp).toBe(100);
});

test('endTurn while downed skips the end-of-turn draw and loses no cards', () => {
  // Regression: the downed player's endTurn used to draw 5 cards that the
  // revive branch of startTurn then silently dropped (hand: d.hand overwrote
  // them) — 5 cards vanished per death cycle.
  const total = (p: PlayerState): number => p.hand.length + p.inventory.length + p.discard.length + p.playArea.length;
  const before = baseState({
    seat0: { downed: true, hp: 0, hand: [], inventory: ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'], discard: ['w1'], playArea: ['w2'] },
  });
  const s = applyAction(before, { type: 'endTurn', seat: 0 });
  const p = p0(s);
  expect(p.downed).toBe(true);
  expect(p.hand).toEqual([]);
  expect(p.playArea).toEqual([]);
  // playArea cards go to discard (they were still on the table when downed)
  expect(p.discard).toEqual(['w2', 'w1']);
  expect(p.inventory.length).toBe(8);
  // no card is created or destroyed
  expect(total(p)).toBe(total(p0(before)));
  expect(s.activeSeat).toBe(1);
});

test('useCharacterAbility on a passive throws (validate rejects it)', () => {
  expect(() => applyAction(baseState(), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }))
    .toThrow('useCharacterAbility: passive ability');
});

test('Shattered Memories (trashUpToTwoFromDiscard) prompts with discard options', () => {
  // ac-6 = Shattered Memories; seat 0 has three cards in discard
  const s = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('trashUpToTwoFromDiscard');
  // options = discard cards (in order) + DONE sentinel
  expect(pr(s).options).toEqual(['am2', 'w5', 'inv1', 'DONE']);
});

test('Shattered Memories: choosing a card trashes it and chains the prompt', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 }); // trash am2
  expect(s1.removed).toContain('am2');
  expect(p0(s1).discard).toEqual(['w5', 'inv1']);
  // up to 2: a follow-up prompt offers the remaining discard
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('trashUpToTwoFromDiscard');
  expect(pr(s1).payload?.trashed).toBe(1);
  expect(pr(s1).options).toEqual(['w5', 'inv1', 'DONE']);
  // trash a second card — chain ends (max 2)
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 }); // trash w5
  expect(s2.removed).toEqual(['am2', 'w5']);
  expect(p0(s2).discard).toEqual(['inv1']);
  expect(s2.prompts.length).toBe(0); // hit the 2-card cap, prompt closed
});

test('Shattered Memories: DONE ends the chain without trashing more', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  // choose one card, then DONE
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 });
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 2 }); // DONE
  expect(s2.removed).toEqual(['am2']);
  expect(p0(s2).discard).toEqual(['w5', 'inv1']);
  expect(s2.prompts.length).toBe(0);
});

test('Shattered Memories: DONE immediately keeps the discard intact', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 2 }); // DONE
  expect(s1.removed).toEqual([]);
  expect(p0(s1).discard).toEqual(['am2', 'w5']);
  expect(s1.prompts.length).toBe(0);
});

test('Master of Unlocking offers the opponents revealed top weapons', () => {
  // seat 0 plays ac-7; seat 1 has a weapon (w2) and an ammo (am1) on top.
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  expect(s0.prompts.length).toBe(1);
  expect(pr(s0).payload?.kind).toBe('stealRevealedWeaponsFromOpponentsTopCards');
  // only the top card (w2) is revealed; it is a weapon so it is offerable
  expect(pr(s0).options).toEqual(['w2', 'DONE']);
});

test('Master of Unlocking: taking a weapon moves it to your discard and ends (only one revealed)', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 }); // take w2
    expect(p0(s1).discard).toContain('w2');
    // seat 1 lost its top card; the revealed non-weapon (am1) stays on top
    expect(s1.seats[1]?.inventory).toEqual(['am1']);
    expect(s1.prompts.length).toBe(0);
  });

test('Master of Unlocking: DONE leaves the opponents inventory untouched', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 1 }); // DONE
    expect(s1.seats[1]?.inventory).toEqual(['w2', 'am1']);
    expect(p0(s1).discard).toEqual([]);
    expect(s1.prompts.length).toBe(0);
  });

test('Master of Unlocking: non-weapon top cards reveal nothing offerable (no prompt)', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  expect(s0.prompts.length).toBe(0);
});

test('Krauser L1: choosing the market knife gains it to discard and pops the pile', () => {
  // 'mkr1' (we-1 weapon) tops the fixture 'hg' pile; simulate the turn-start
  // ability prompt offering it + Decline.
  const withPrompt: GameState = {
    ...baseState(),
    prompts: [{
      id: 'ability-0-v2',
      seat: 0,
      text: 'At beginning of your turn, may gain 1 Knife weapon.',
      options: ['mkr1', 'Decline'],
      payload: { kind: 'gainKnifeAtTurnStart' },
    }],
  };
  const s1 = applyAction(withPrompt, { type: 'chooseOption', seat: 0, promptId: 'ability-0-v2', option: 0 });
  expect(p0(s1).discard).toEqual(['mkr1']);
  expect(s1.marketPiles['hg']?.cards).toEqual([]);
  expect(s1.prompts.length).toBe(0);
  // no Gold or Buy was spent — this is a gain, not a purchase
  expect(p0(s1).turnGold).toBe(50);
  expect(p0(s1).buysLeft).toBe(1);
});

test('Krauser L1: Decline leaves the market untouched', () => {
  const withPrompt: GameState = {
    ...baseState(),
    prompts: [{
      id: 'ability-0-v2',
      seat: 0,
      text: 'At beginning of your turn, may gain 1 Knife weapon.',
      options: ['mkr1', 'Decline'],
      payload: { kind: 'gainKnifeAtTurnStart' },
    }],
  };
  const s1 = applyAction(withPrompt, { type: 'chooseOption', seat: 0, promptId: 'ability-0-v2', option: 1 });
  expect(p0(s1).discard).toEqual([]);
  expect(s1.marketPiles['hg']?.cards).toEqual(['mkr1']);
  expect(s1.prompts.length).toBe(0);
});


test('Sheva L1: exchange hand card with top of Inventory', () => {
  // Sheva at level 1, hand [am1], inventory top w1
  const base = baseState({ seat0: { characterInstanceId: 'cs', level: 1 as const, hand: ['am1'], inventory: ['w1', 'am2'] } });
  const s0 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s0.prompts.length).toBe(1);
  expect(pr(s0).payload?.kind).toBe('exchangeHandWithInventoryTop');
  expect(pr(s0).options).toEqual(['am1']);
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 });
  expect(p0(s1).hand).toEqual(['w1']);
  expect(p0(s1).inventory).toEqual(['am1', 'am2']);
  expect(s1.prompts.length).toBe(0);
});

test('Sheva L1: rejected below level 1 and with empty zones', () => {
  const lvl0 = baseState({ seat0: { characterInstanceId: 'cs', level: 0 as const, hand: ['am1'], inventory: ['w1'] } });
  expect(validateAction(lvl0, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: ability not unlocked' });
  const empty = baseState({ seat0: { characterInstanceId: 'cs', level: 1 as const, hand: [], inventory: ['w1'] } });
  expect(validateAction(empty, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
});

test('Barry L1: +5 damage this turn, once per turn', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cb', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(p0(s1).weaponDamageBonusThisTurn).toBe(5);
  // second use this turn is rejected (log shows the first use)
  expect(validateAction(s1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: already used this turn' });
});

test('Barry L1: usable again next turn (log scan stops at endTurn)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cb', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  const s2 = applyAction(s1, { type: 'endTurn', seat: 0 });
  // seat 1 now; bring it back to seat 0 for the fixture's sake
  const s3 = { ...s2, activeSeat: 0, seats: s2.seats.map(s => (s.seat === 0 ? { ...s, weaponDamageBonusThisTurn: 0 } : s)) };
  expect(validateAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: true });
});

test('Ada L1: peek Mansion top without engaging', () => {
  const base = baseState({ seat0: { characterInstanceId: 'ca', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('lookAtMansionTop');
  expect(pr(s1).text).toContain('Majini'); // fixture mansionDeck top = inf1 (ma-1)
  // the card stays on top of the Mansion; nothing attached/removed
  expect(s1.mansionDeck).toEqual(base.mansionDeck);
  expect(s1.removed).toEqual([]);
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(s2.prompts.length).toBe(0);
  expect(s2.mansionDeck).toEqual(base.mansionDeck);
});

test('Rebecca L2: trash any number of cards from hand (DONE chain)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cr', level: 2 as const, hand: ['am1', 'am2', 'w1'] } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('trashFromHandAtWill');
  expect(pr(s1).options).toEqual(['am1', 'am2', 'w1', 'DONE']);
  // trash one, chain continues with the rest
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(s2.removed).toEqual(['am1']);
  expect(p0(s2).hand).toEqual(['am2', 'w1']);
  expect(s2.prompts.length).toBe(1);
  expect(pr(s2).options).toEqual(['am2', 'w1', 'DONE']);
  // DONE ends it
  const s3 = applyAction(s2, { type: 'chooseOption', seat: 0, promptId: pr(s2).id, option: 2 });
  expect(s3.removed).toEqual(['am1']);
  expect(s3.prompts.length).toBe(0);
});

test('Rebecca L2 is level-locked at level 1 (index 1)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cr', level: 1 as const, hand: ['am1'] } });
  expect(validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 })).toEqual({ ok: false, reason: 'useCharacterAbility: ability not unlocked' });
  // index 0 is Rebecca's L1 redirect passive — not manually triggerable
  expect(validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: passive ability' });
});

test('invalid action throws', () => {
  expect(() => applyAction(baseState({ seat0: { hand: ['zzz'] } }), { type: 'playActionCard', seat: 0, instanceId: 'zzz' })).toThrow('applyAction: playActionCard: unknown card: zzz');
  expect(() => applyAction(baseState(), { type: 'explore', seat: 0, weapons: ['zzz'], exploreCount: 1 })).toThrow('applyAction: explore: weapon not in hand: zzz');
});

test('startGame throws', () => {
  expect(() => applyAction(baseState(), { type: 'startGame', setup: { seed: 1, players: [{ name: 'a', controller: 'human' }] } })).toThrow('applyAction: startGame handled by game.ts setup');
});