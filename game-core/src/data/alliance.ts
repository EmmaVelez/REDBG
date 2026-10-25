import type { CardDef, CardBonuses } from '../types';

export const ALLIANCE_CARDS: ReadonlyArray<CardDef> = [
  // Characters (Alliance-exclusive)
  { id: 'ch-011', name: 'Carlos Oliveira', type: 'character', set: 'alliance', text: 'When Carlos explores, look at the top card of the Mansion; if it is a Weapon, you may take it. During your turn, attach up to 2 additional cards under your Character.', copies: 1, level1At: 4, level2At: 9, maxHp: 85, levels: [{ level: 1, text: 'When Carlos explores, look at the top card of the Mansion; if it is a Weapon, you may take it.' }, { level: 2, text: 'During your turn, attach up to 2 additional cards under your Character.' }], abilities: [] },
  { id: 'ch-012', name: 'Josh Stone', type: 'character', set: 'alliance', text: 'You only begin the game with a Knife and an Action card. Level 1 (3): When you attack, you may attach up to 2 additional cards under your Character. Level 2 (8): Your partner may attach up to 2 additional cards.', copies: 1, level1At: 3, level2At: 8, maxHp: 75, levels: [{ level: 1, text: 'You only begin the game with a Knife and an Action card.' }, { level: 2, text: 'When you attack, you may attach up to 2 additional cards under your Character.' }], abilities: [] },
  { id: 'ch-013', name: 'Steve Burnside', type: 'character', set: 'alliance', text: 'You only begin the game with an Explosive weapon. Level 1 (5): All of Steve\'s Magnum weapons gain +20 damage.', copies: 1, level1At: 5, level2At: 7, maxHp: 95, levels: [{ level: 1, text: 'You only begin the game with an Explosive weapon.' }, { level: 2, text: 'All of Steve\'s Magnum weapons gain +20 damage.' }], abilities: [] },
    { id: 'ch-014', name: 'Jack Krauser (Alliance)', type: 'character', set: 'alliance', text: 'Jack cannot use more than 1 Weapon. During your turn, Jack deals an additional X Damage during your turn where X = the number of cards in your Hand times 10.', copies: 1, level1At: 0, level2At: 6, maxHp: 90, levels: [{ level: 1, text: 'Jack can only use more than 1 weapon.' }, { level: 2, text: 'During your turn, Jack deals an additional X Damage during your turn where X = the number of cards in your Hand times 10.' }], abilities: [{ kind: 'singleWeaponLimiter', level: 1 }, { kind: 'generic', level: 2 }] },
  
    // HUNK (Alliance) - partner character for Carlos Oliveira
    // L2 is encoded as `generic` (engine no-op): it needs a Partner mechanic
    // the engine does not have yet. Convention matches ch-014 Krauser L2.
    { id: 'ch-015', name: 'HUNK (Alliance)', type: 'character', set: 'alliance', text: 'During your turn, BUNK takes any Damage you inflict on the Partner; that Player can have a Player instead. At the beginning of your turn, if HUNK has no Partner, they get +2 Cards.', copies: 1, level1At: 3, level2At: 6, maxHp: 70, levels: [{ level: 1, text: 'When BUNK takes any Damage, you can have that Player instead.' }, { level: 2, text: 'At the beginning of your turn, if HUNK has no Partner, they get +2 Cards.' }], abilities: [{ kind: 'damageRedirectToPartner', level: 1 }, { kind: 'generic', level: 2 }] },
  
  // Weapons (Alliance-exclusive)
  { id: 'we-017', name: 'Grenade Launcher', type: 'weapon', set: 'alliance', text: 'Deals 60 damage. Trashed after use.', copies: 5, cost: 35, ammoReq: 0, damage: 60, weaponTags: ['explosive'] },
  { id: 'we-018', name: 'Pistol', type: 'weapon', set: 'alliance', text: 'Requires 20 Ammo. Deals 12 damage.', copies: 10, cost: 15, ammoReq: 20, damage: 12, weaponTags: ['gun', 'pistol'] },
  { id: 'we-019', name: 'Combat Knife (Alliance)', type: 'weapon', set: 'alliance', text: 'Free, no Ammo. Deals 5 damage.', copies: 8, cost: 0, ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'] },
  { id: 'we-020', name: 'Sawed-Off Shotgun', type: 'weapon', set: 'alliance', text: 'Requires 30 Ammo. Deals 65 damage.', copies: 4, cost: 50, ammoReq: 30, damage: 65, weaponTags: ['gun', 'shotgun'] },
  { id: 'we-021', name: 'Full Auto Rifle', type: 'weapon', set: 'alliance', text: '+8 damage for every other Action card played this turn. Requires 45 Ammo. Deals 35 damage.', copies: 1, cost: 80, ammoReq: 45, damage: 35, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'plusDamagePerActionPlayedThisTurn', amount: 8 }] },
  { id: 'we-022', name: 'Heavy Machine Gun', type: 'weapon', set: 'alliance', text: '+4 damage if you have more than 90 Ammo this turn. Requires 75 Ammo. Deals 38 damage.', copies: 2, cost: 120, ammoReq: 75, damage: 38, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 90, amount: 4 }] },
  { id: 'we-023', name: 'Super Shotgun', type: 'weapon', set: 'alliance', text: 'Instantly defeats any Infected with 55 or less Health. +1 Explore. Requires 60 Ammo. Deals 70 damage.', copies: 4, cost: 110, ammoReq: 60, damage: 70, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 55 }, { kind: 'grantExplores', amount: 1 }] },
  { id: 'we-024', name: 'Riot Shotgun', type: 'weapon', set: 'alliance', text: 'Instantly defeats any Infected with 35 or less Health. +1 Explore. Requires 50 Ammo. Deals 60 damage.', copies: 1, cost: 70, ammoReq: 50, damage: 60, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 35 }, { kind: 'grantExplores', amount: 1 }] },
  
  // Ammunition (Alliance)
  { id: 'am-004', name: 'Ammo x5', type: 'ammunition', set: 'alliance', text: 'Grants +5 Ammo and +5 Gold for the turn.', copies: 12, cost: 0, bonuses: { ammo: 5, gold: 5 } },
  
  // Actions (Alliance-exclusive)
  { id: 'ac-013', name: 'Longbow', type: 'action', set: 'alliance', text: '+2 Cards.', copies: 6, cost: 30, bonuses: { cards: 2 } },
  { id: 'ac-014', name: 'Grenade', type: 'action', set: 'alliance', text: '+5 actions, +20 Gold.', copies: 8, cost: 40, bonuses: { actions: 5, gold: 20 } },
  { id: 'ac-015', name: 'Back to Back', type: 'action', set: 'alliance', text: 'Move 1 Weapon from your discard pile to your hand.', copies: 6, cost: 40, bonuses: { actions: 2, ammo: 30 }, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] },
  { id: 'ac-016', name: 'Reload', type: 'action', set: 'alliance', text: '+2 buys.', copies: 4, cost: 50, bonuses: { actions: 1, ammo: 30 } },
  
  // Items (Alliance)
  { id: 'it-004', name: 'Green Herb', type: 'item', set: 'alliance', text: 'Trash: heal 20. Trash with another Green Herb to heal 60.', copies: 3, cost: 15, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  
  // Infected (Alliance-exclusive)
  { id: 'ma-018', name: 'Majini (Heavy)', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 35, attack: 15, decorations: 2 },
  { id: 'ma-019', name: 'Licker (Gang)', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 65, attack: 40, decorations: 3 }
];

export const ALLIANCE_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am-5', cardIds: ['am-004'] },  // Ammo x5
  { pileId: 'am20', cardIds: ['am-002'] },  // Shared premium ammo
  { pileId: 'pistol', cardIds: ['we-018'] },
  { pileId: 'knife', cardIds: ['we-019'] },
  { pileId: 'shotgun-lowcost', cardIds: ['we-020'] },
  { pileId: 'rgt', cardIds: ['we-021'] },
  { pileId: 'mg-heavy', cardIds: ['we-022'] },
  { pileId: 'shotgun-highcost', cardIds: ['we-023', 'we-024'] },
  { pileId: 'longbow-action', cardIds: ['ac-013'] },
  { pileId: 'grenade-buy', cardIds: ['ac-014'] },
  { pileId: 'reload-discard', cardIds: ['ac-015'] },
  { pileId: 'buy', cardIds: ['ac-016'] }
];

export const ALLIANCE_CHARACTERS = [
  'ch-011', // Carlos Oliveira (partner)
  'ch-012', // Josh Stone (knife start)
  'ch-013', // Steve Burnside (explosive start)
  'ch-014', // Jack Krauser (single weapon limiter + hand-size damage)
  'ch-015'  // HUNK (partner for Carlos)
];

export const ALLIANCE_WEAPOON_IDS = [
  'we-021', // Full Auto Rifle (+8/action)
  'we-023', // Super Shotgun (55 HP instant kill)
  'we-024'  // Riot Shotgun (35 HP instant kill)
];

ALLIANCE_CARDS;

