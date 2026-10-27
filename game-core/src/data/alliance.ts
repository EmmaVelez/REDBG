import type { CardDef } from '../types';

/**
 * Alliance Expansion Cards
 * Based on Alliance cards.txt file.
 */
export const ALLIANCE_CARDS: ReadonlyArray<CardDef> = [
  // ========================================================================
  // CHARACTERS (Alliance-exclusive)
  // ========================================================================
  
  { id: 'ch-011', name: 'Carlos Oliveira', type: 'character', set: 'alliance', text: 'L1: When Carlos explores, look at the top card of Mansion; if it is a Weapon, you may take it. L2: During your turn, attach up to 2 additional cards under your Character.', copies: 1, level1At: 4, level2At: 9, maxHp: 85, levels: [], abilities: [] },
  { id: 'ch-012', name: 'Josh Stone', type: 'character', set: 'alliance', text: 'Begins the game with a Knife and an Action card.', copies: 1, level1At: 3, level2At: 8, maxHp: 75, levels: [], abilities: [{ kind: 'singleWeaponLimiter', level: 1 }] },
  { id: 'ch-013', name: 'Steve Burnside', type: 'character', set: 'alliance', text: 'Begins the game with an Explosive weapon.', copies: 1, level1At: 5, level2At: 7, maxHp: 95, levels: [], abilities: [] },

  // ========================================================================
  // WEAPONS - KNIVES
  // ========================================================================
  
  { id: 'we-004', name: 'Combat Knife', type: 'weapon', set: 'alliance', text: 'Free, no ammo. Deals 5 damage.', copies: 11, cost: 0, ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'], weaponEffects: [] },
  { id: 'we-005', name: 'Survival Knife', type: 'weapon', set: 'alliance', text: 'This Weapon gets +5 Damage for every other "Knife" Weapon used this turn.', copies: 1, cost: 50, ammoReq: 0, damage: 10, weaponTags: ['melee', 'knife'], weaponEffects: [{ kind: 'plusDamagePerOtherKnifeUsedThisTurn', amount: 5 }] },
  
  // ========================================================================
  // WEAPONS - PISTOLS
  // ========================================================================
  
  { id: 'we-009', name: 'Handgun', type: 'weapon', set: 'alliance', text: 'Requires 20 ammo. Deals 10 damage.', copies: 9, cost: 20, ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  { id: 'we-010', name: 'Burst-Fire Handgun', type: 'weapon', set: 'alliance', text: '+20 damage when used alongside another Weapon in the same Explore.', copies: 1, cost: 60, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [{ kind: 'plusDamageWhenUsingMultipleWeapons', amount: 20 }] },
  { id: 'we-025', name: 'Blowback Pistol', type: 'weapon', set: 'alliance', text: 'Discard any number of "Pistol" cards from hand to play. +10 damage per card discarded.', copies: 5, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  { id: 'we-018', name: 'Standard Sidearm', type: 'weapon', set: 'alliance', text: 'Requires 10 ammo. Deals 10 damage. +5 damage for each non-item gained this turn.', copies: 4, cost: 30, ammoReq: 10, damage: 10, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  { id: 'we-027', name: 'Samurai Edge', type: 'weapon', set: 'alliance', text: 'Requires 60 ammo. Deals 30 damage. +20 damage for each card gained this turn.', copies: 1, cost: 70, ammoReq: 60, damage: 30, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - SHOTGUNS
  // ========================================================================
  
  { id: 'we-020', name: 'Riot Shotgun', type: 'weapon', set: 'alliance', text: 'You get +1 explore this turn. Requires 60 ammo. Deals 45 damage.', copies: 7, cost: 70, ammoReq: 60, damage: 45, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-021', name: 'Triple Barreled Shotgun', type: 'weapon', set: 'alliance', text: 'You get +2 explore this turn. +10 damage for each Infected being battled.', copies: 1, cost: 90, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [] },
  { id: 'we-013', name: 'Pump Action Shotgun', type: 'weapon', set: 'alliance', text: 'You get +1 explore this turn. Requires 40 ammo. Deals 25 damage.', copies: 4, cost: 40, ammoReq: 40, damage: 25, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-014', name: 'Automatic Shotgun', type: 'weapon', set: 'alliance', text: '+1 explore. First Infected with 40 or less HP revealed this turn is defeated immediately.', copies: 1, cost: 80, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 40 }, { kind: 'grantExplores', amount: 1 }] },
  { id: 'we-044', name: 'Custom Pump-Action Shotgun', type: 'weapon', set: 'alliance', text: 'When you defeat an Infected, move 1 card from hand/discard to another player discard.', copies: 5, cost: 50, ammoReq: 40, damage: 30, weaponTags: ['gun', 'shotgun'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - RIFLES
  // ========================================================================
  
  { id: 'we-019', name: 'Telescopic Sight Rifle', type: 'weapon', set: 'alliance', text: 'When exploring, reveal cards from BOTTOM of Mansion instead of top. Requires 50 ammo. Deals 30 damage.', copies: 7, cost: 50, ammoReq: 50, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-015', name: 'Bolt-Action Rifle', type: 'weapon', set: 'alliance', text: 'Reveal top card of Inventory: +30 damage if cost is 40 or more.', copies: 4, cost: 50, ammoReq: 50, damage: 20, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-016', name: 'Semi-Automatic Rifle', type: 'weapon', set: 'alliance', text: '+10 damage for each Action played this turn. Requires 70 ammo. Deals 30 damage.', copies: 1, cost: 90, ammoReq: 70, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'plusDamagePerActionPlayedThisTurn', amount: 10 }] },
  { id: 'we-036', name: 'Single Shot Rifle w/Scope', type: 'weapon', set: 'alliance', text: 'Choose a player. That player discards a card from hand. Requires 40 ammo. Deals 30 damage.', copies: 4, cost: 50, ammoReq: 40, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-037', name: 'Special Ops Rifle', type: 'weapon', set: 'alliance', text: 'Each non-exploring player discards a card from hand. Requires 50 ammo. Deals 50 damage.', copies: 1, cost: 80, ammoReq: 50, damage: 50, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-047', name: 'Custom Bolt-Action Rifle', type: 'weapon', set: 'alliance', text: '+10 damage if 3+ XP on character. Requires 50 ammo. Deals 40 damage.', copies: 5, cost: 60, ammoReq: 50, damage: 40, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - MACHINE GUNS
  // ========================================================================
  
  { id: 'we-011', name: 'Assault Machine Gun', type: 'weapon', set: 'alliance', text: 'Requires 40 ammo. Deals 20 damage.', copies: 4, cost: 30, ammoReq: 40, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-012', name: 'Full-Bore Machine Gun', type: 'weapon', set: 'alliance', text: '+30 damage if more than 100 ammo in play area. Requires 70 ammo. Deals 40 damage.', copies: 1, cost: 100, ammoReq: 70, damage: 40, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] },
  { id: 'we-038', name: 'Machine Pistol w/Stock', type: 'weapon', set: 'alliance', text: '+20 gold this turn. Requires 30 ammo. Deals 20 damage.', copies: 4, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-039', name: 'Gangster\'s Machine Gun', type: 'weapon', set: 'alliance', text: '+10 damage per "Machine Gun" in discard pile. Requires 50 ammo. Deals 50 damage.', copies: 1, cost: 80, ammoReq: 50, damage: 50, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-022', name: 'Russian Assault Rifle', type: 'weapon', set: 'alliance', text: 'Machine gun. Fixed to 20 ammo max. Deals 40 damage.', copies: 4, cost: 40, ammoReq: 20, damage: 40, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-023', name: 'Signature Special', type: 'weapon', set: 'alliance', text: 'Machine gun. Fixed to 60 ammo max. Deals 50 damage.', copies: 1, cost: 70, ammoReq: 60, damage: 50, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - MAGNUM
  // ========================================================================
  
  { id: 'we-006', name: 'Six Shooter', type: 'weapon', set: 'alliance', text: 'Requires 50 ammo. Deals 50 damage.', copies: 5, cost: 90, ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'], weaponEffects: [] },
  { id: 'we-030', name: 'Lightning Hawk', type: 'weapon', set: 'alliance', text: 'Requires 60 ammo. Deals 60 damage.', copies: 4, cost: 100, ammoReq: 60, damage: 60, weaponTags: ['gun', 'magnum'], weaponEffects: [] },
  { id: 'we-029', name: 'Hand Cannon', type: 'weapon', set: 'alliance', text: 'Cannot be attached to characters. Trash 1 ammo from play area. Requires 80 ammo. Deals 80 damage.', copies: 1, cost: 120, ammoReq: 80, damage: 80, weaponTags: ['gun', 'magnum'], weaponEffects: [] },
  { id: 'we-035', name: 'Broken Butterfly', type: 'weapon', set: 'alliance', text: '+20 damage if 10+ cards in inventory. Requires 40 ammo. Deals 40 damage.', copies: 5, cost: 80, ammoReq: 40, damage: 40, weaponTags: ['gun', 'magnum'], weaponEffects: [] },
  { id: 'we-046', name: 'Custom Lightning Hawk', type: 'weapon', set: 'alliance', text: '+10 damage per XP removed. Requires 40 ammo. Deals 40 damage.', copies: 5, cost: 80, ammoReq: 40, damage: 40, weaponTags: ['gun', 'magnum'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - EXPLOSIVE
  // ========================================================================
  
  { id: 'we-017', name: 'Flash Grenade', type: 'weapon', set: 'alliance', text: 'Next "Las Plagas" revealed is defeated. Move low HP Infected to bottom of mansion. Trashes after use. No ammo.', copies: 5, cost: 20, ammoReq: 0, damage: 0, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'alliance', text: 'Deals 90 damage. Trashed after use. No ammo.', copies: 1, cost: 130, ammoReq: 0, damage: 90, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-018g', name: 'Grenade Launcher', type: 'weapon', set: 'alliance', text: 'All Explosives go to discard instead of trash. Requires ammo. Deals 20 damage.', copies: 1, cost: 80, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-040', name: 'Flashbang', type: 'weapon', set: 'alliance', text: '+1 explore. All low HP Infected deal 0 damage this turn. Trashes after use. No ammo.', copies: 5, cost: 20, ammoReq: 0, damage: 10, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-043', name: 'Ibex Standard', type: 'weapon', set: 'alliance', text: 'Pay 20 ammo: +10 damage. No ammo. Deals 10 damage.', copies: 5, cost: 30, ammoReq: 10, damage: 10, weaponTags: ['pistol'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - BOW
  // ========================================================================
  
  { id: 'we-002', name: 'Longbow', type: 'weapon', set: 'alliance', text: 'No ammo. Deals 25 damage.', copies: 5, cost: 110, ammoReq: 0, damage: 25, weaponTags: ['gun'], weaponEffects: [] },
  { id: 'we-048', name: 'Hunting Bow', type: 'weapon', set: 'alliance', text: '+10 damage if no actions in play area. Cannot play actions while in play.', copies: 5, cost: 100, ammoReq: 0, damage: 20, weaponTags: ['gun'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - SPECIAL
  // ========================================================================
  
  { id: 'we-003', name: 'Submission', type: 'weapon', set: 'alliance', text: 'Melee. +5 damage if 80+ HP. (Versus: target discards weapon.)', copies: 5, cost: 20, ammoReq: 0, damage: 5, weaponTags: ['melee'], weaponEffects: [{ kind: 'plusDamageIfSelfHpAtLeast', hp: 80, amount: 5 }] },
  { id: 'we-001', name: 'Grenade', type: 'weapon', set: 'alliance', text: '5 damage to each adjacent player. Trashes after use.', copies: 5, cost: 40, ammoReq: 0, damage: 15, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-041', name: 'HE Grenade', type: 'weapon', set: 'alliance', text: 'No ammo. Deals 20 damage.', copies: 5, cost: 40, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-042', name: 'Incendiary Grenade', type: 'weapon', set: 'alliance', text: '+5 damage per Infected being battled. No ammo. Deals 10 damage.', copies: 5, cost: 30, ammoReq: 0, damage: 10, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-031', name: 'Night Scope Rocket Launcher', type: 'weapon', set: 'alliance', text: '+20 damage at night. Trashes after use. No ammo.', copies: 5, cost: 80, ammoReq: 0, damage: 60, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-034', name: 'Mine Thrower', type: 'weapon', set: 'alliance', text: '+10 damage per Ammo card in play area. No ammo. Deals 0 damage.', copies: 5, cost: 120, ammoReq: 0, damage: 0, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-007', name: 'Gatling Gun', type: 'weapon', set: 'alliance', text: 'X ammo, X damage: X equals current Ammo.', copies: 1, cost: 110, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'damageEqualsCurrentAmmo' }] },
  { id: 'we-024', name: 'Flamethrower', type: 'weapon', set: 'alliance', text: 'X = 5 x discard pile size. No ammo.', copies: 5, cost: 90, ammoReq: 0, damage: 0, weaponTags: ['gun'], weaponEffects: [] },
  { id: 'we-045', name: 'Custom Full-Bore Machine Gun', type: 'weapon', set: 'alliance', text: '+1 XP when defeat 1+ infected. Requires 30 ammo. Deals 20 damage.', copies: 5, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  
  // ========================================================================
  // AMMUNITION
  // ========================================================================
  
  { id: 'am-004', name: 'Ammo x5', type: 'ammunition', set: 'alliance', text: 'Grants +5 Ammo and +5 Gold for the turn.', copies: 12, cost: 0, bonuses: { ammo: 5, gold: 5 } },
  
  // ========================================================================
  // ITEMS
  // ========================================================================
  
  { id: 'it-004', name: 'Green Herb', type: 'item', set: 'alliance', text: 'Trash: heal 20. Trash with another Green Herb to heal 60.', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  { id: 'it-005', name: 'Yellow Herb', type: 'item', set: 'alliance', text: '+10 max HP, heal 10 next turn.', copies: 3, itemEffects: [{ kind: 'plusMaxHp', amount: 10 }] },
  { id: 'it-006', name: 'First Aid Spray', type: 'item', set: 'alliance', text: 'Heal to full HP.', copies: 4, cost: 60, itemEffects: [{ kind: 'healToFull' }] },
  { id: 'it-007', name: 'Blue Herb', type: 'item', set: 'alliance', text: 'Reduces Infected damage by 20 this turn.', copies: 4, cost: 30 },
  { id: 'it-008', name: 'Red Herb', type: 'item', set: 'alliance', text: '+20 max HP.', copies: 2, cost: 40, itemEffects: [{ kind: 'plusMaxHp', amount: 20 }] },
  { id: 'it-009', name: 'Green+Blue Herb', type: 'item', set: 'alliance', text: 'Heal 40 HP.', copies: 3, cost: 40 },
  { id: 'it-050', name: 'Reliable Blade', type: 'item', set: 'alliance', text: 'When defeat Infected, may get +10 gold. Trashes after turn.', copies: 10, cost: 0, itemEffects: [] },
  
  // ========================================================================
  // ACTIONS
  // ========================================================================
  
  { id: 'ac-013', name: 'Longbow', type: 'action', set: 'alliance', text: '+2 Cards.', copies: 6, cost: 30, bonuses: { cards: 2 } },
  { id: 'ac-014', name: 'Grenade', type: 'action', set: 'alliance', text: '+5 actions, +20 Gold.', copies: 8, cost: 40, bonuses: { actions: 5, gold: 20 } },
  { id: 'ac-015', name: 'Back to Back', type: 'action', set: 'alliance', text: 'Move 1 Weapon from your discard pile to your hand.', copies: 6, cost: 40, bonuses: { actions: 2, ammo: 30 }, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] },
  { id: 'ac-016', name: 'Reload', type: 'action', set: 'alliance', text: '+2 buys.', copies: 4, cost: 50, bonuses: { actions: 1, ammo: 30 } },
  { id: 'ac-017', name: 'Single Shot Rifle w/Scope', type: 'action', set: 'alliance', text: 'Choose a player. That player discards a card from hand.', copies: 4, cost: 50, bonuses: { ammo: 40 } },
  { id: 'ac-018', name: 'Special Ops Rifle', type: 'action', set: 'alliance', text: 'Each non-exploring player discards a card from hand.', copies: 1, cost: 80, bonuses: { actions: 1 } },
  { id: 'ac-020', name: 'High Caliber', type: 'action', set: 'alliance', text: '+1 explore.', copies: 5, cost: 30, bonuses: { explores: 1 } },
  { id: 'ac-021', name: 'Quick Reload', type: 'action', set: 'alliance', text: '+1 ammo.', copies: 8, cost: 20, bonuses: { ammo: 1 } },
  { id: 'ac-022', name: 'Adrenaline Shot', type: 'action', set: 'alliance', text: '+1 action.', copies: 6, cost: 30, bonuses: { actions: 1 } },
  { id: 'ac-032', name: 'Silver Ghost', type: 'action', set: 'alliance', text: '+1 card, +1 action.', copies: 4, cost: 30, bonuses: { cards: 1, actions: 1 } },
  { id: 'ac-033', name: 'Punisher', type: 'action', set: 'alliance', text: '+2 cards, +1 action.', copies: 1, cost: 70, bonuses: { cards: 2, actions: 1 } },
  { id: 'ac-040', name: 'Flashbang', type: 'action', set: 'alliance', text: '+1 explore. Non-Explosive Infected deal 0 damage.', copies: 5, cost: 20, bonuses: { explores: 1 } },
  { id: 'ac-050', name: 'Mercenaries Item', type: 'action', set: 'alliance', text: '+20 gold.', copies: 3, cost: 50, bonuses: { gold: 20 } },
];