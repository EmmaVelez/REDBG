import { sumBonuses, applyBonusPools, promptsFor, trashDestination } from './cards';
import type { BonusSnapshot, BonusPools, PromptKind } from './cards';
import type { CardDef } from '../types';

test('sumBonuses empty', () => {
  expect(sumBonuses([])).toEqual({ cards: 0, gold: 0, ammo: 0, buys: 0, actions: 0, explores: 0 });
});

test('sumBonuses with three cards', () => {
  const cards: CardDef[] = [
    { id: 'it-001', name: 'Ammo Pack', type: 'item', set: 'premier', text: '', copies: 1, bonuses: { ammo: 10, gold: 10 } },
    { id: 'we-002', name: 'Shotgun', type: 'weapon', set: 'premier', text: '', copies: 1, bonuses: { explores: 1 } },
    { id: 'ac-003', name: 'Merchant', type: 'action', set: 'premier', text: '', copies: 1, bonuses: { buys: 1, cards: 1, gold: 20 } },
  ];
  expect(sumBonuses(cards)).toEqual({ cards: 1, gold: 30, ammo: 10, buys: 1, actions: 0, explores: 1 });
});

test('sumBonuses card with no bonuses field', () => {
  const card: CardDef = { id: 'we-004', name: 'Combat Knife', type: 'weapon', set: 'premier', text: '', copies: 11, damage: 5, ammoReq: 0 };
  expect(sumBonuses([card])).toEqual({ cards: 0, gold: 0, ammo: 0, buys: 0, actions: 0, explores: 0 });
});

test('applyBonusPools', () => {
  const pools: BonusPools = { turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1 };
  const bonuses: BonusSnapshot = { cards: 2, gold: 20, ammo: 10, buys: 1, actions: 1, explores: 1 };
  const result = applyBonusPools(pools, bonuses);
  expect(result.pools).toEqual({ turnAmmo: 10, turnGold: 20, actionsLeft: 2, buysLeft: 2, exploresLeft: 2 });
  expect(result.draws).toBe(2);
});

test('applyBonusPools zeros', () => {
  const pools: BonusPools = { turnAmmo: 5, turnGold: 5, actionsLeft: 1, buysLeft: 1, exploresLeft: 1 };
  const bonuses: BonusSnapshot = { cards: 0, gold: 0, ammo: 0, buys: 0, actions: 0, explores: 0 };
  const result = applyBonusPools(pools, bonuses);
  expect(result.pools).toEqual({ turnAmmo: 5, turnGold: 5, actionsLeft: 1, buysLeft: 1, exploresLeft: 1 });
  expect(result.draws).toBe(0);
});

test('promptsFor Deadly Aim (immediate)', () => {
  const card: CardDef = { id: 'ac-001', name: 'Deadly Aim', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] };
  expect(promptsFor(card)).toEqual([]);
});

test('promptsFor Reload', () => {
  const card: CardDef = { id: 'ac-002', name: 'Reload', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] };
  expect(promptsFor(card)).toEqual(['recoverWeaponFromDiscardToHand']);
});

test('promptsFor Umbrella', () => {
  const card: CardDef = { id: 'ac-003', name: 'Umbrella', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'moveHandCardToTopOfInventory' }] };
  expect(promptsFor(card)).toEqual(['moveHandCardToTopOfInventory']);
});

test('promptsFor Ominous Battle', () => {
  const card: CardDef = { id: 'ac-004', name: 'Ominous Battle', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'trashHandCard' }] };
  expect(promptsFor(card)).toEqual(['trashHandCard']);
});

test('promptsFor Struggle', () => {
  const card: CardDef = { id: 'ac-005', name: 'Struggle', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'negateWeaponCost40OrLessFromHand' }] };
  expect(promptsFor(card)).toEqual(['negateWeaponCost40OrLessFromHand']);
});

test('promptsFor Mansion Foyer', () => {
  const card: CardDef = { id: 'ac-006', name: 'Mansion Foyer', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'lookAtMansionTop', count: 2 }] };
  expect(promptsFor(card)).toEqual(['lookAtMansionTop']);
});

test('promptsFor Green Herb', () => {
  const card: CardDef = { id: 'it-001', name: 'Green Herb', type: 'item', set: 'premier', text: '', copies: 1, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] };
  expect(promptsFor(card)).toEqual(['healGreenHerb']);
});

test('promptsFor First Aid Spray', () => {
  const card: CardDef = { id: 'it-002', name: 'First Aid Spray', type: 'item', set: 'premier', text: '', copies: 1, itemEffects: [{ kind: 'healToFull' }] };
  expect(promptsFor(card)).toEqual([]);
});

test('promptsFor Yellow Herb', () => {
  const card: CardDef = { id: 'it-003', name: 'Yellow Herb', type: 'item', set: 'premier', text: '', copies: 1, itemEffects: [{ kind: 'plusMaxHp20' }] };
  expect(promptsFor(card)).toEqual([]);
});

test('promptsFor weapon effects (shotgun + burst-fire handgun)', () => {
  const card: CardDef = { id: 'we-007', name: 'Shotgun', type: 'weapon', set: 'premier', text: '', copies: 1, weaponEffects: [{ kind: 'grantExplores', amount: 1 }, { kind: 'plusDamagePerExtraWeapon', amount: 20 }] };
  expect(promptsFor(card)).toEqual([]);
});

test('promptsFor Rocket Launcher Case token', () => {
  const card: CardDef = { id: 'tk-001', name: 'Rocket Launcher Case', type: 'token', set: 'premier', text: '', copies: 1, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-008' }] };
  expect(promptsFor(card)).toEqual([]);
});

test('promptsFor dedupe + order', () => {
  const card: CardDef = { id: 'it-004', name: 'Mixed Effects', type: 'item', set: 'premier', text: '', copies: 1, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }, { kind: 'healToFull' }], actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] };
  expect(promptsFor(card)).toEqual(['recoverWeaponFromDiscardToHand', 'healGreenHerb']);
});

test('promptsFor no effects', () => {
  const card: CardDef = { id: 'we-004', name: 'Combat Knife', type: 'weapon', set: 'premier', text: '', copies: 11, damage: 5, ammoReq: 0 };
  expect(promptsFor(card)).toEqual([]);
});

test('trashDestination item', () => {
  const card: CardDef = { id: 'it-001', name: 'Green Herb', type: 'item', set: 'premier', text: '', copies: 1 };
  expect(trashDestination(card)).toBe('removed');
});

test('trashDestination token', () => {
  const card: CardDef = { id: 'tk-001', name: 'Rocket Launcher Case', type: 'token', set: 'premier', text: '', copies: 1, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-008' }] };
  expect(trashDestination(card)).toBe('removed');
});

test('trashDestination explosive weapon', () => {
  const card: CardDef = { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'premier', text: '', copies: 1, weaponTags: ['explosive', 'gun'], damage: 15, ammoReq: 0 };
  expect(trashDestination(card)).toBe('removed');
  expect(trashDestination(card, { explosivesToDiscard: true })).toBe('discard');
});

test('trashDestination explosive weapon opts undefined', () => {
  const card: CardDef = { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'premier', text: '', copies: 1, weaponTags: ['explosive', 'gun'], damage: 15, ammoReq: 0 };
  expect(trashDestination(card)).toBe('removed');
});

test('trashDestination action', () => {
  const card: CardDef = { id: 'ac-001', name: 'Deadly Aim', type: 'action', set: 'premier', text: '', copies: 1, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] };
  expect(trashDestination(card)).toBe('keep');
});

test('trashDestination ammunition', () => {
  const card: CardDef = { id: 'am-001', name: 'Ammo Pack', type: 'ammunition', set: 'premier', text: '', copies: 1, bonuses: { ammo: 10, gold: 10 } };
  expect(trashDestination(card)).toBe('keep');
});

test('trashDestination non-explosive weapon', () => {
  const card: CardDef = { id: 'we-007', name: 'Shotgun', type: 'weapon', set: 'premier', text: '', copies: 1, weaponTags: ['gun'], damage: 10, ammoReq: 20 };
  expect(trashDestination(card)).toBe('keep');
});
