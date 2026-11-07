import { requiredAmmo, computeDamage, resolveExplore, resolveMultiExplore, exploreDamage } from './explore';
import type { MultiExploreTarget, ExploreWeapon } from './explore';
import type { CardDef, GameState } from '../types';

test('requiredAmmo', () => {
  expect(requiredAmmo([{ damage: 10, ammoReq: 20 }, { damage: 20, ammoReq: 30 }])).toBe(50);
  expect(requiredAmmo([])).toBe(0);
});

test('computeDamage two plain weapons', () => {
  expect(computeDamage({ weapons: [{ damage: 10, ammoReq: 20 }, { damage: 20, ammoReq: 30 }], ammo: 50, bonusDamage: 0 })).toBe(30);
});

test('computeDamage bonusDamage 10, no weapons, ammo 0', () => {
  expect(computeDamage({ weapons: [], ammo: 0, bonusDamage: 10 })).toBe(10);
});

test('computeDamage Full-Bore', () => {
  expect(computeDamage({ weapons: [{ damage: 40, ammoReq: 70, weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] }], ammo: 120, bonusDamage: 0 })).toBe(70);
    expect(computeDamage({ weapons: [{ damage: 40, ammoReq: 70, weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] }], ammo: 100, bonusDamage: 0 })).toBe(40);
});

test('computeDamage Burst-Fire', () => {
  expect(computeDamage({ weapons: [{ damage: 20, ammoReq: 30, weaponEffects: [{ kind: 'plusDamagePerExtraWeapon', amount: 20 }] }, { damage: 10, ammoReq: 20 }], ammo: 60, bonusDamage: 0 })).toBe(50);
  expect(computeDamage({ weapons: [{ damage: 20, ammoReq: 30, weaponEffects: [{ kind: 'plusDamagePerExtraWeapon', amount: 20 }] }], ammo: 60, bonusDamage: 0 })).toBe(20);
});

test('computeDamage ignores grantExplores', () => {
  expect(computeDamage({ weapons: [{ damage: 25, ammoReq: 40, weaponEffects: [{ kind: 'grantExplores', amount: 1 }] }], ammo: 0, bonusDamage: 0 })).toBe(25);
});

test('exploreDamage reads weapon damages + turn bonus from a full state', () => {
  const state: GameState = {
    version: 1, seed: 1, rngState: 1, phase: 'main', activeSeat: 0, turnNumber: 1,
    seats: [{
      seat: 0, name: 'P0', controller: 'human', characterInstanceId: 'ch-1#1',
      hp: 100, maxHp: 100, decorations: 0, level: 0 as const, turnAmmo: 120, turnGold: 0,
      actionsLeft: 1, buysLeft: 1, exploresLeft: 1, weaponDamageBonusThisTurn: 5,
      attached: [], inventory: [], hand: [], discard: [], playArea: [], downed: false, dead: false,
    }],
    marketPiles: {}, mansionDeck: [], mansionBottom: [], removed: [],
    cards: {
      'w1': { instanceId: 'w1', cardId: 'we-full', location: { zone: 'hand', index: 0 } },
      'w2': { instanceId: 'w2', cardId: 'we-plain', location: { zone: 'hand', index: 0 } },
      'chc': { instanceId: 'chc', cardId: 'ch-1', location: { zone: 'hand', index: 0 } },
    },
    cardDefs: {
      'we-full': { id: 'we-full', name: 'Full-Bore', type: 'weapon', set: 'premier', text: '', copies: 1, damage: 40, ammoReq: 70, weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] },
      'we-plain': { id: 'we-plain', name: 'Handgun', type: 'weapon', set: 'premier', text: '', copies: 1, damage: 10, ammoReq: 20 },
      'ch-1': { id: 'ch-1', name: 'Chris', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 100 },
    },
    prompts: [], winners: [], log: [],
  };
  // Full-Bore (40, +30 ammo bonus at ammo 120) + Handgun 10 + turn bonus 5 = 85
  expect(exploreDamage(state, 0, ['w1', 'w2'])).toBe(85);
  // Not enough ammo for the Full-Bore threshold: 40 + 10 + 5 = 55
  const lowAmmo = { ...state, seats: [{ ...state.seats[0] as NonNullable<GameState['seats'][number]>, turnAmmo: 90 }] };
  expect(exploreDamage(lowAmmo, 0, ['w1', 'w2'])).toBe(55);
  // Unknown ids contribute zero damage
  expect(exploreDamage(state, 0, ['missing'])).toBe(5);
});

test('resolveExplore insufficient ammo', () => {
  expect(resolveExplore({ weapons: [{ damage: 50, ammoReq: 50 }], ammo: 20, bonusDamage: 0, revealed: { id: 'ma-005', name: 'Bui Kichwa', type: 'infected', set: 'premier', text: '', copies: 3, hp: 10, attack: 10, decorations: 1 } })).toEqual({ kind: 'insufficientAmmo', required: 50, available: 20 });
});

test('resolveExplore defeated', () => {
  expect(resolveExplore({ weapons: [{ damage: 20, ammoReq: 10 }], ammo: 20, bonusDamage: 0, revealed: { id: 'ma-005', name: 'Bui Kichwa', type: 'infected', set: 'premier', text: '', copies: 3, hp: 10, attack: 10, decorations: 1 } })).toEqual({ kind: 'defeated', decorations: 1, damage: 20, hp: 10 });
});

test('resolveExplore notDefeated', () => {
  expect(resolveExplore({ weapons: [{ damage: 5, ammoReq: 10 }], ammo: 20, bonusDamage: 0, revealed: { id: 'ma-005', name: 'Bui Kichwa', type: 'infected', set: 'premier', text: '', copies: 3, hp: 10, attack: 10, decorations: 1 } })).toEqual({ kind: 'notDefeated', damageTaken: 10, shuffleBack: false });
});

test('resolveExplore Uroboros shuffleBack', () => {
  expect(resolveExplore({ weapons: [{ damage: 50, ammoReq: 10 }], ammo: 20, bonusDamage: 0, revealed: { id: 'ma-010', name: 'Uroboros Aheri', type: 'infected', set: 'premier', text: '', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] } })).toEqual({ kind: 'notDefeated', damageTaken: 70, shuffleBack: true });
});

test('resolveExplore Gatling Gun Majini', () => {
  expect(resolveExplore({ weapons: [{ damage: 30, ammoReq: 0 }], ammo: 60, bonusDamage: 0, revealed: { id: 'ma-014', name: 'Gatling Gun Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 40, attack: 25, decorations: 4, infectedEffects: [{ kind: 'plusDamagePerFull10AmmoOfAttacker', amount: 5 }] } })).toEqual({ kind: 'defeated', decorations: 4, damage: 60, hp: 40 });
  expect(resolveExplore({ weapons: [{ damage: 30, ammoReq: 0 }], ammo: 10, bonusDamage: 0, revealed: { id: 'ma-014', name: 'Gatling Gun Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 40, attack: 25, decorations: 4, infectedEffects: [{ kind: 'plusDamagePerFull10AmmoOfAttacker', amount: 5 }] } })).toEqual({ kind: 'notDefeated', damageTaken: 25, shuffleBack: false });
});

test('resolveExplore nonInfected', () => {
  expect(resolveExplore({ weapons: [{ damage: 10, ammoReq: 0 }], ammo: 0, bonusDamage: 0, revealed: { id: 'it-001', name: 'Green Herb', type: 'item', set: 'premier', text: '', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] } })).toEqual({ kind: 'nonInfected', cardId: 'it-001' });
});

test('resolveMultiExplore all defeated', () => {
  expect(resolveMultiExplore({ damage: 60, revealed: [{ cardId: 'ma-003', hp: 15, attack: 10, infectedEffects: [{ kind: 'noActionsNextTurnOfAPlayerOnDefeat' }] }, { cardId: 'ma-002', hp: 20, attack: 20 }] })).toEqual({ defeated: true, combinedHp: 35, combinedAttack: 30, shuffleBackCards: [], blockedByCannotDefeat: false, effectiveDamage: 60 });
});

test('resolveMultiExplore not defeated', () => {
  expect(resolveMultiExplore({ damage: 30, revealed: [{ cardId: 'ma-003', hp: 15, attack: 10, infectedEffects: [{ kind: 'noActionsNextTurnOfAPlayerOnDefeat' }] }, { cardId: 'ma-002', hp: 20, attack: 20 }] })).toEqual({ defeated: false, combinedHp: 35, combinedAttack: 30, shuffleBackCards: [], blockedByCannotDefeat: false, effectiveDamage: 30 });
});

test('resolveMultiExplore Uroboros flagged', () => {
  expect(resolveMultiExplore({ damage: 50, revealed: [{ cardId: 'ma-002', hp: 20, attack: 20 }, { cardId: 'ma-010', hp: 90, attack: 70, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] }] })).toEqual({ defeated: false, combinedHp: 110, combinedAttack: 90, shuffleBackCards: ['ma-010'], blockedByCannotDefeat: false, effectiveDamage: 50 });
});
