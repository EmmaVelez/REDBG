import type { CardDef } from '../types';

/**
 * Alliance Expansion Cards
 * Based on Alliance cards.txt file.
 */
export const ALLIANCE_CARDS: ReadonlyArray<CardDef> = [
  // ========================================================================
  // CHARACTERS (Alliance-exclusive)
  // ========================================================================
  
  { id: 'ch-011', name: 'Carlos Oliveira', type: 'character', set: 'alliance', text: 'L1: When Carlos explores, look at the top card of Mansion; if it is a Weapon, you may take it. L2: During your turn, attach up to 2 additional cards under your Character.', copies: 1, level1At: 4, level2At: 9, maxHp: 90, levels: [], abilities: [] },
  { id: 'ch-012', name: 'Josh Stone', type: 'character', set: 'alliance', text: 'Begins the game with a Knife and an Action card.', copies: 1, level1At: 3, level2At: 8, maxHp: 80, levels: [], abilities: [{ kind: 'singleWeaponLimiter', level: 1 }] },
  { id: 'ch-013', name: 'Steve Burnside', type: 'character', set: 'alliance', text: 'Begins the game with an Explosive weapon.', copies: 1, level1At: 5, level2At: 7, maxHp: 70, levels: [], abilities: [] },
  { id: 'ch-014', name: 'Jack Krauser', type: 'character', set: 'alliance', text: 'L1: Jack cannot use more than one weapon. L2: Jack deals an additional X damage this turn, where X is the number of cards in your hand times 10.', copies: 1, level1At: 0, level2At: 6, maxHp: 90, levels: [{ level: 1, text: 'Jack cannot use more than one weapon.' }, { level: 2, text: 'Jack deals an additional X damage this turn, where X is the number of cards in your hand times 10.' }], abilities: [{ kind: 'singleWeaponLimiter', level: 1 }, { kind: 'plusDamagePerCardInHand', amount: 10, level: 2 }] },
  { id: 'ch-015', name: 'Hunk', type: 'character', set: 'alliance', text: 'L1: Whenever Hunk would take damage, you may redirect it to his partner instead. L2: At the beginning of your turn, Hunk gets +2 cards if he has no partner.', copies: 1, level1At: 3, level2At: 6, maxHp: 70, levels: [], abilities: [{ kind: 'damageRedirectToPartner', level: 1 }] },
  { id: 'ch-016', name: 'Jill Valentine (Brainwashed)', type: 'character', set: 'alliance', text: 'L1: When Jill explores, one weapon she is using gets +10 damage if her partner has one or fewer cards attached. L2: During another player turn, when a Las Plagas infected is revealed, you may trash a Flash Grenade from your hand and apply its effect.', copies: 1, level1At: 1, level2At: 6, maxHp: 90, levels: [], abilities: [] },
  { id: 'ch-017', name: 'Billy Coen', type: 'character', set: 'alliance', text: 'L1: During your turn, you may gain one Ammo x 10. If you do, you get +10 gold. L2: During your turn, if you have 10 or more cards in your discard pile, you may move one of them to your hand.', copies: 1, level1At: 1, level2At: 5, maxHp: 80, levels: [{ level: 1, text: 'During your turn, you may gain one Ammo x 10. If you do, you get +10 gold.' }, { level: 2, text: 'During your turn, if you have 10 or more cards in your discard pile, you may move one of them to your hand.' }], abilities: [{ kind: 'gainAmmoX10ForGold', amount: 10, level: 1 }, { kind: 'discardToHandIfTenPlus', threshold: 10, level: 2 }] },
  { id: 'ch-018', name: 'Leon S. Kennedy', type: 'character', set: 'alliance', text: 'L1: During your turn, you may move one card from your discard pile to the bottom of your inventory. L2: During your turn, you may move the bottom card of your inventory to the top.', copies: 1, level1At: 1, level2At: 7, maxHp: 80, levels: [{ level: 1, text: 'During your turn, you may move one card from your discard pile to the bottom of your inventory.' }, { level: 2, text: 'During your turn, you may move the bottom card of your inventory to the top.' }], abilities: [{ kind: 'discardCardToInventoryBottom', level: 1 }, { kind: 'inventoryBottomToTop', level: 2 }] },
  { id: 'ch-019', name: 'Chris Redfield', type: 'character', set: 'alliance', text: 'L1: While Chris is using only one weapon, that weapon has a -20 ammo requirement. L2: While Chris is using only one weapon type, weapons of that type have a -20 ammo requirement.', copies: 1, level1At: 3, level2At: 8, maxHp: 80, levels: [], abilities: [] },
  { id: 'ch-020', name: 'Claire Redfield', type: 'character', set: 'alliance', text: 'L1: When you trash a Green Herb or Red Herb from your hand, Claire deals an additional 20 damage during this turn. L2: When you trash a Green Herb and a Red Herb from your hand, double all damage Claire deals during this turn.', copies: 1, level1At: 3, level2At: 7, maxHp: 80, levels: [], abilities: [] },
  // ========================================================================
  // WEAPONS - KNIVES
  // ========================================================================
  
  { id: 'we-004', name: 'Combat Knife', type: 'weapon', set: 'alliance', text: 'Free, no ammo. Deals 5 damage.', weaponType: 'knife', copies: 11, cost: 0, ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'], weaponEffects: [] },
  { id: 'we-005', name: 'Survival Knife', type: 'weapon', set: 'alliance', text: 'This Weapon gets +5 Damage for every other "Knife" Weapon used this turn.', copies: 1, cost: 50, ammoReq: 0, damage: 10, weaponTags: ['melee', 'knife'], weaponEffects: [{ kind: 'plusDamagePerOtherKnifeUsedThisTurn', amount: 5 }] },
  
  // ========================================================================
  // WEAPONS - PISTOLS
  // ========================================================================
  
  { id: 'we-009', name: 'Handgun', type: 'weapon', set: 'alliance', text: 'Requires 20 ammo. Deals 10 damage.', weaponType: 'handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  { id: 'we-010', name: 'Burst-Fire Handgun', type: 'weapon', set: 'alliance', text: '+20 damage when used alongside another Weapon in the same Explore.', copies: 1, cost: 60, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [{ kind: 'plusDamageWhenUsingMultipleWeapons', amount: 20 }] },
  { id: 'we-025', name: 'Blowback Pistol', type: 'weapon', set: 'alliance', text: 'Discard any number of "Pistol" cards from hand to play. +10 damage per card discarded.', weaponType: 'handgun', copies: 5, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  { id: 'we-018', name: 'Grenade Launcher [F. Grenade]', type: 'weapon', set: 'alliance', text: 'All Explosives go to discard instead of trash. Requires ammo. Deals 20 damage.', weaponType: 'explosive', copies: 1, cost: 80, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-027', name: 'Samurai Edge', type: 'weapon', set: 'alliance', text: 'Requires 60 ammo. Deals 30 damage. +20 damage for each card gained this turn.', copies: 1, cost: 70, ammoReq: 60, damage: 30, weaponTags: ['gun', 'pistol'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - SHOTGUNS
  // ========================================================================
  
  { id: 'we-020', name: 'Riot Shotgun', type: 'weapon', set: 'alliance', text: 'You get +1 explore this turn. Requires 60 ammo. Deals 45 damage.', copies: 7, cost: 70, ammoReq: 60, damage: 45, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-021', name: 'Triple Barreled Shotgun', type: 'weapon', set: 'alliance', text: 'You get +2 explore this turn. +10 damage for each Infected being battled.', weaponType: 'shotgun', copies: 1, cost: 90, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [] },
  { id: 'we-013', name: 'Pump Action Shotgun', type: 'weapon', set: 'alliance', text: 'You get +1 explore this turn. Requires 40 ammo. Deals 25 damage.', copies: 4, cost: 40, ammoReq: 40, damage: 25, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-014', name: 'Automatic Shotgun', type: 'weapon', set: 'alliance', text: '+1 explore. First Infected with 40 or less HP revealed this turn is defeated immediately.', copies: 1, cost: 80, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 40 }, { kind: 'grantExplores', amount: 1 }] },
  { id: 'we-044', name: 'Custom Pump-Action Shotgun', type: 'weapon', set: 'alliance', text: 'When you defeat an Infected, move 1 card from hand/discard to another player discard.', weaponType: 'shotgun', copies: 5, cost: 50, ammoReq: 40, damage: 30, weaponTags: ['gun', 'shotgun'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - RIFLES
  // ========================================================================
  
  { id: 'we-019', name: 'Telescopic Sight Rifle', type: 'weapon', set: 'alliance', text: 'When exploring, reveal cards from BOTTOM of Mansion instead of top. Requires 50 ammo. Deals 30 damage.', weaponType: 'rifle', copies: 7, cost: 50, ammoReq: 50, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-015', name: 'Bolt-Action Rifle', type: 'weapon', set: 'alliance', text: 'Reveal top card of Inventory: +30 damage if cost is 40 or more.', weaponType: 'rifle', copies: 4, cost: 50, ammoReq: 50, damage: 20, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-016', name: 'Semi-Automatic Rifle', type: 'weapon', set: 'alliance', text: '+10 damage for each Action played this turn. Requires 70 ammo. Deals 30 damage.', copies: 1, cost: 90, ammoReq: 70, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'plusDamagePerActionPlayedThisTurn', amount: 10 }] },
  { id: 'we-036', name: 'Single Shot Rifle w/Scope', type: 'weapon', set: 'alliance', text: 'Choose a player. That player discards a card from hand. Requires 40 ammo. Deals 30 damage.', weaponType: 'rifle', copies: 4, cost: 50, ammoReq: 40, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-037', name: 'Special Ops Rifle', type: 'weapon', set: 'alliance', text: 'Each non-exploring player discards a card from hand. Requires 50 ammo. Deals 50 damage.', weaponType: 'rifle', copies: 1, cost: 80, ammoReq: 50, damage: 50, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  { id: 'we-047', name: 'Custom Bolt-Action Rifle', type: 'weapon', set: 'alliance', text: '+10 damage if 3+ XP on character. Requires 50 ammo. Deals 40 damage.', weaponType: 'rifle', copies: 5, cost: 60, ammoReq: 50, damage: 40, weaponTags: ['gun', 'rifle'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - MACHINE GUNS
  // ========================================================================
  
  { id: 'we-011', name: 'Assault Machine Gun', type: 'weapon', set: 'alliance', text: 'Requires 40 ammo. Deals 20 damage.', weaponType: 'machinegun', copies: 4, cost: 30, ammoReq: 40, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-012', name: 'Full-Bore Machine Gun', type: 'weapon', set: 'alliance', text: '+30 damage if more than 100 ammo in play area. Requires 70 ammo. Deals 40 damage.', copies: 1, cost: 100, ammoReq: 70, damage: 40, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] },
  { id: 'we-038', name: 'Machine Pistol w/Stock', type: 'weapon', set: 'alliance', text: '+20 gold this turn. Requires 30 ammo. Deals 20 damage.', weaponType: 'handgun', copies: 4, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-039', name: 'Gangster\'s Machine Gun', type: 'weapon', set: 'alliance', text: '+10 damage per "Machine Gun" in discard pile. Requires 50 ammo. Deals 50 damage.', copies: 1, cost: 80, ammoReq: 50, damage: 50, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  { id: 'we-022', name: 'Russian Assault Rifle', type: 'weapon', set: 'alliance', text: 'Machine gun. X/X ammo/damage, cap 20.', weaponType: 'rifle', copies: 4, cost: 40, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [], xAmmo: true, ammoCap: 20 },
  { id: 'we-023', name: 'Signature Special', type: 'weapon', set: 'alliance', text: 'Machine gun. X/X ammo/damage, cap 60.', copies: 1, cost: 70, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [], xAmmo: true, ammoCap: 60 },
  
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
  
  { id: 'we-017', name: 'Flash Grenade', type: 'weapon', set: 'alliance', text: 'Next "Las Plagas" revealed is defeated. Move low HP Infected to bottom of mansion. Trashes after use. No ammo.', weaponType: 'explosive', copies: 5, cost: 20, ammoReq: 0, damage: 0, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'alliance', text: 'Deals 90 damage. Trashed after use. No ammo.', copies: 1, cost: 130, ammoReq: 0, damage: 90, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-018g', name: 'Grenade Launcher', type: 'weapon', set: 'alliance', text: 'All Explosives go to discard instead of trash. Requires ammo. Deals 20 damage.', weaponType: 'explosive', copies: 1, cost: 80, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-040', name: 'Flashbang', type: 'weapon', set: 'alliance', text: '+1 explore. All low HP Infected deal 0 damage this turn. Trashes after use. No ammo.', copies: 5, cost: 20, ammoReq: 0, damage: 10, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-043', name: 'Ibex Standard', type: 'weapon', set: 'alliance', text: 'Pay 20 ammo: +10 damage. No ammo. Deals 10 damage.', copies: 5, cost: 30, ammoReq: 10, damage: 10, weaponTags: ['pistol'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - BOW
  // ========================================================================
  
  { id: 'we-002', name: 'Longbow', type: 'weapon', set: 'alliance', text: 'No ammo. Deals 25 damage.', weaponType: 'bow', copies: 5, cost: 110, ammoReq: 0, damage: 25, weaponTags: ['gun'], weaponEffects: [] },
  { id: 'we-048', name: 'Hunting Bow', type: 'weapon', set: 'alliance', text: '+10 damage if no actions in play area. Cannot play actions while in play.', weaponType: 'bow', copies: 5, cost: 100, ammoReq: 0, damage: 20, weaponTags: ['gun'], weaponEffects: [] },
  
  // ========================================================================
  // WEAPONS - SPECIAL
  // ========================================================================
  
  { id: 'we-003', name: 'Submission', type: 'weapon', set: 'alliance', text: 'Melee. +5 damage if 80+ HP. (Versus: target discards weapon.)', copies: 5, cost: 20, ammoReq: 0, damage: 5, weaponTags: ['melee'], weaponEffects: [{ kind: 'plusDamageIfSelfHpAtLeast', hp: 80, amount: 5 }] },
  { id: 'we-001', name: 'Grenade', type: 'weapon', set: 'alliance', text: '5 damage to each adjacent player. Trashes after use.', weaponType: 'explosive', copies: 5, cost: 40, ammoReq: 0, damage: 15, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-041', name: 'HE Grenade', type: 'weapon', set: 'alliance', text: 'No ammo. Deals 20 damage.', weaponType: 'explosive', copies: 5, cost: 40, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-042', name: 'Incendiary Grenade', type: 'weapon', set: 'alliance', text: '+5 damage per Infected being battled. No ammo. Deals 10 damage.', weaponType: 'explosive', copies: 5, cost: 30, ammoReq: 0, damage: 10, weaponTags: ['explosive'], weaponEffects: [{ kind: 'plusDamagePerInfectedBattled', amount: 5 }] },
  { id: 'we-031', name: 'Night Scope Rocket Launcher', type: 'weapon', set: 'alliance', text: '+20 damage at night. Trashes after use. No ammo.', copies: 5, cost: 80, ammoReq: 0, damage: 60, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-034', name: 'Mine Thrower', type: 'weapon', set: 'alliance', text: '+10 damage per Ammo card in play area. No ammo. Deals 0 damage.', copies: 5, cost: 120, ammoReq: 0, damage: 0, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-007', name: 'Gatling Gun', type: 'weapon', set: 'alliance', text: 'X ammo, X damage: X equals current Ammo.', copies: 1, cost: 110, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'damageEqualsCurrentAmmo' }] },
  { id: 'we-024', name: 'Flamethrower', type: 'weapon', set: 'alliance', text: 'X = 5 x discard pile size. No ammo.', copies: 5, cost: 90, ammoReq: 0, damage: 0, weaponTags: ['gun'], weaponEffects: [] },
  { id: 'we-045', name: 'Custom Full-Bore Machine Gun', type: 'weapon', set: 'alliance', text: '+1 XP when defeat 1+ infected. Requires 30 ammo. Deals 20 damage.', weaponType: 'machinegun', copies: 5, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'machineGun'], weaponEffects: [] },
  
  // ========================================================================
  // INFECTED / EVENTS (Alliance-exclusive)
  // ========================================================================

  { id: 'ma-022', name: 'Lurker', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 10, attack: 10, decorations: 1 },
  { id: 'ma-023', name: 'Infected Bat', type: 'infected', set: 'alliance', text: 'This infected gets +20 health if it is being attacked with another infected.', copies: 3, hp: 15, attack: 20, decorations: 1, infectedEffects: [{ kind: 'plusHpIfAttackedWithAnotherInfected', amount: 20 }] },
  { id: 'ma-024', name: 'Licker Beta', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 35, attack: 20, decorations: 3 },
  { id: 'ma-025', name: 'Duvalia (Las Plagas)', type: 'infected', set: 'alliance', text: 'When this infected kills a character, the player with the most decorations gains five Ammo x 10 cards.', plagas: true, copies: 2, hp: 60, attack: 40, decorations: 5, infectedEffects: [{ kind: 'onKillGainAmmoX10ToMostDecorated', count: 5 }] },
  { id: 'ma-026', name: 'Garrador', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 50, attack: 40, decorations: 4 },
  { id: 'ma-027', name: 'Zombie (Male)', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 20, attack: 10, decorations: 1 },
  { id: 'ma-028', name: 'Kipepeo (Las Plagas)', type: 'infected', set: 'alliance', text: 'No effect.', plagas: true, copies: 3, hp: 20, attack: 20, decorations: 1 },
  { id: 'ma-029', name: 'Albert Wesker', type: 'infected', set: 'alliance', text: 'All other revealed infected get +10 health and +10 damage this turn.', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'buffOtherRevealedInfected', hp: 10, damage: 10 }] },
  { id: 'ma-030', name: 'Cephalo (Las Plagas)', type: 'infected', set: 'alliance', text: 'When defeated, choose a player. That player must explore on his next turn.', plagas: true, copies: 3, hp: 25, attack: 20, decorations: 2, infectedEffects: [{ kind: 'mustExploreNextTurnOnDefeat' }] },
  { id: 'ma-031', name: 'Proto Tyrant', type: 'infected', set: 'alliance', text: 'When revealed, all non-exploring characters with 50 or more health take 40 damage.', copies: 1, hp: 60, attack: 40, decorations: 5 },
  { id: 'ma-032', name: 'Iron Maiden', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 50, attack: 30, decorations: 4 },
  { id: 'ma-033', name: 'Zombie Horde', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 30, attack: 20, decorations: 2 },
  { id: 'ma-034', name: 'Nosferatu', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 55, attack: 30, decorations: 4 },
  { id: 'ma-035', name: 'Los Illuminados Monk', type: 'infected', set: 'alliance', text: 'This infected gets +5 health and +5 damage for each infected attached to the exploring main character.', copies: 2, hp: 15, attack: 20, decorations: 3, infectedEffects: [{ kind: 'plusHpAndDamagePerAttachedInfected', amount: 5 }] },
  { id: 'ma-036', name: 'Reaper', type: 'infected', set: 'alliance', text: 'If not defeated with damage equal to its health, trash 1 card with the highest cost attached to your partner.', copies: 2, hp: 35, attack: 40, decorations: 4, infectedEffects: [{ kind: 'trashHighestCostAttachedOnPartnerIfNotExactDefeat' }] },
  { id: 'ma-037', name: 'Guardian of Insanity', type: 'infected', set: 'alliance', text: 'When revealed, each characters takes 10 damage.', copies: 3, hp: 30, attack: 20, decorations: 2 },
  { id: 'ma-038', name: 'Explosive Barrel', type: 'event', set: 'alliance', text: 'When revealed, if the exploring characters are dealing 80 or more total damage, each of them takes 30 damage. Otherwise, your characters collectively deal an additional 30 damage and you get +1 explore. Then remove this event from the game.', copies: 3 },
  { id: 'ma-039', name: 'Collapsing Floor Trap', type: 'event', set: 'alliance', text: 'When revealed, reveal the top two cards of the mansion. Your characters are now battling any revealed infected. Shuffle any non-infected cards revealed in this way into the mansion. Then remove this event from the game.', copies: 1 },
  { id: 'ma-040', name: 'Laser Targeting Device', type: 'event', set: 'alliance', text: 'When revealed, look at the top card of the mansion. If it is an infected, attach it to your character, then shuffle the LTD back into the mansion. Otherwise, shuffle the revealed card and the LTD into the mansion.', copies: 1 },

  // ========================================================================
  // AMMUNITION
  // ========================================================================
  
  { id: 'am-004', name: 'Treasure', type: 'ammunition', set: 'alliance', text: 'You get +30 gold this turn.', copies: 10, cost: 40, bonuses: { gold: 30 } },
  
  // ========================================================================
  // ITEMS
  // ========================================================================
  
  { id: 'it-001', name: 'Green Herb', type: 'item', set: 'alliance', text: 'Trash: heal 20. Trash with another Green Herb to heal 60.', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  { id: 'it-005', name: 'Yellow Herb', type: 'item', set: 'alliance', text: '+10 max HP, heal 10 next turn.', copies: 3, itemEffects: [{ kind: 'plusMaxHp', amount: 10 }] },
  { id: 'it-006', name: 'First Aid Spray', type: 'item', set: 'alliance', text: 'Heal to full HP.', copies: 4, cost: 60, itemEffects: [{ kind: 'healToFull' }] },
  { id: 'it-007', name: 'Blue Herb', type: 'item', set: 'alliance', text: 'Reduces Infected damage by 20 this turn.', copies: 4, cost: 30 },
  { id: 'it-004', name: 'Red Herb', type: 'item', set: 'alliance', text: '+20 max HP.', copies: 2, cost: 20, itemEffects: [{ kind: 'healSelfAndPartnerToFull' }] },
  { id: 'it-009', name: 'Green+Blue Herb', type: 'item', set: 'alliance', text: 'Heal 40 HP.', copies: 3, cost: 40 },
  { id: 'it-050', name: 'Reliable Blade', type: 'item', set: 'alliance', text: 'When defeat Infected, may get +10 gold. Trashes after turn.', copies: 10, cost: 0, itemEffects: [] },
  
  // ========================================================================
  // ACTIONS
  // ========================================================================
  
  { id: 'ac-013', name: 'Partners', type: 'action', set: 'alliance', text: 'You get +20 ammo and +2 actions. Attach this to your partner if you have one. If this card is attached to your partner at the beginning of the turn, you get +1 action during this turn.', copies: 5, cost: 30, bonuses: { ammo: 20, actions: 2 } },
  { id: 'ac-014', name: 'Star-Crossed Duo', type: 'action', set: 'alliance', text: 'You get +2 cards and +1 buy. Attach this card to your partner if you have one. When your character explores, if your partner is leading with this card attached, one of your partner weapons deals +10 damage this turn.', copies: 8, cost: 40, bonuses: { cards: 2, buys: 1 } },
  { id: 'ac-015', name: 'Great Ambition', type: 'action', set: 'alliance', text: 'You get +10 gold and +1 action. If you have no partner, you get +2 cards.', copies: 5, cost: 50, bonuses: { gold: 10, actions: 1 } },
  { id: 'ac-016', name: 'Archrival', type: 'action', set: 'alliance', text: 'You get +2 cards. All players discard down to one or fewer cards attached to their partners.', copies: 5, cost: 30, bonuses: { cards: 2 } },
  { id: 'ac-017', name: 'Fierce Battle', type: 'action', set: 'alliance', text: 'You get +4 cards. Choose another player. That player gets +1 card.', copies: 5, cost: 80, bonuses: { cards: 4 } },
  { id: 'ac-018', name: 'Uroboros Injection', type: 'action', set: 'alliance', text: 'You get +2 actions and +1 buy. During another player turn, you may trash this card to give +20 health to a revealed infected of your choice.', copies: 5, cost: 60, bonuses: { actions: 2, buys: 1 } },
  { id: 'ac-019', name: 'Quirck of Fate', type: 'action', set: 'alliance', text: 'You get +1 action. Trash a card from your hand, then draw a card.', copies: 8, cost: 30, bonuses: { actions: 1 } },
  { id: 'ac-020', name: 'Cornered', type: 'action', set: 'alliance', text: 'Attach this card to your partner if you have one. At the beginning of your turn, if there are two Cornered cards attached to your partner, trash both. Then, gain 3 cards with a total combined cost of 100 or less gold and move them to the top of your inventory in any order.', copies: 5, cost: 30 },
  { id: 'ac-021', name: 'Gathering Forces', type: 'action', set: 'alliance', text: 'You get +20 gold, +1 action, and +1 buy. Any cards you gain this turn go to your hand instead of your discard pile.', copies: 5, cost: 90, bonuses: { gold: 20, actions: 1, buys: 1 } },
  { id: 'ac-022', name: 'Desperate Forces', type: 'action', set: 'alliance', text: 'You get +20 ammo and +1 action. Choose a weapon type. All weapons of that type get +10 damage this turn.', copies: 5, cost: 70, bonuses: { ammo: 20, actions: 1 } },
  { id: 'ac-032', name: 'Silver Ghost', type: 'action', set: 'alliance', text: '+1 card, +1 action.', copies: 4, cost: 30, bonuses: { cards: 1, actions: 1 } },
  { id: 'ac-033', name: 'Punisher', type: 'action', set: 'alliance', text: '+2 cards, +1 action.', copies: 1, cost: 70, bonuses: { cards: 2, actions: 1 } },
  { id: 'ac-040', name: 'Flashbang', type: 'action', set: 'alliance', text: '+1 explore. Non-Explosive Infected deal 0 damage.', copies: 5, cost: 20, bonuses: { explores: 1 } },
  { id: 'ac-050', name: 'Mercenaries Item', type: 'action', set: 'alliance', text: '+20 gold.', copies: 3, cost: 50, bonuses: { gold: 20 } },
];