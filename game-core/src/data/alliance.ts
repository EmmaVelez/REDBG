import type { CardDef } from '../types';

/**
 * Alliance Expansion Cards
 *
 * Canonical Alliance-edition cards only, verified against the wiki's Alliance
 * box layout and the RE DBG Master Card List: CH-011..020, WE-017..025, AC-013..022,
 * MA-022..040, IT-004 (Red Herb) and AM-004 (Treasure).
 *
 * The Alliance set also re-prints the basic resources WE-004/005/009/010 and
 * IT-001 (Green Herb); those share their Premier ids and are defined once, in
 * cards.ts. Every other card id that used to live here (we-001..we-016, the
 * Outbreak/Nightmare/Mercenaries weapons, it-005/006/007/009/050) was a
 * transcription artefact, not an Alliance card, and has been removed so every
 * id in the database is unique.
 */
export const ALLIANCE_CARDS: ReadonlyArray<CardDef> = [
  // ========================================================================
  // CHARACTERS (Alliance-exclusive)
  // ========================================================================
  
  { id: 'ch-011', name: 'Carlos Oliveira', type: 'character', set: 'alliance', text: 'L1: Carlos can look at the top card of the Mansion Area before he plays his weapons to Explore. L2: After Carlos explores, take a card from his Discard Pile and place it in his hand if the damage he dealt to all Revealed Infected is equal to their health.', copies: 1, level1At: 4, level2At: 9, maxHp: 90, levels: [{ level: 1, text: 'Carlos can look at the top card of the Mansion Area before he plays his weapons to Explore.' }, { level: 2, text: 'After Carlos explores, take a card from his Discard Pile and place it in his hand if the damage he dealt to all Revealed Infected is equal to their health.' }], abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'perfectExploreReward', level: 2 }] },
  { id: 'ch-012', name: 'Josh Stone', type: 'character', set: 'alliance', text: 'L1: Josh cannot use weapons with a cost of 50 or more. L2: Josh\'s partner may attach up to 2 additional cards.', copies: 1, level1At: 0, level2At: 4, maxHp: 80, levels: [{ level: 1, text: 'Josh cannot use weapons with a cost of 50 or more.' }, { level: 2, text: 'Josh\'s partner may attach up to 2 additional cards.' }], abilities: [{ kind: 'weaponCostCap', maxCost: 50, level: 1 }, { kind: 'partnerAttachCapBonus', amount: 2, level: 2 }] },
  { id: 'ch-013', name: 'Steve Burnside', type: 'character', set: 'alliance', text: 'L1: Recover 10 Health at the beginning of each turn. L2: Discard Uroboros Injection from your hand: recover 20 Health and increase base damage by 30.', copies: 1, level1At: 5, level2At: 7, maxHp: 70, levels: [{ level: 1, text: 'Recover 10 Health at the beginning of each turn.' }, { level: 2, text: 'Discard Uroboros Injection from your hand: recover 20 Health and increase base damage by 30.' }], abilities: [{ kind: 'healAtTurnStart', amount: 10, level: 1 }, { kind: 'discardCardForHealAndDamage', cardId: 'ac-018', heal: 20, damage: 30, level: 2 }] },
  { id: 'ch-014', name: 'Jack Krauser', type: 'character', set: 'alliance', text: 'L1: Jack cannot use more than one weapon. L2: Jack deals an additional X damage this turn, where X is the number of cards in your hand times 10.', copies: 1, level1At: 0, level2At: 6, maxHp: 90, levels: [{ level: 1, text: 'Jack cannot use more than one weapon.' }, { level: 2, text: 'Jack deals an additional X damage this turn, where X is the number of cards in your hand times 10.' }], abilities: [{ kind: 'singleWeaponLimiter', level: 1 }, { kind: 'plusDamagePerCardInHand', amount: 10, level: 2 }] },
  { id: 'ch-015', name: 'Hunk', type: 'character', set: 'alliance', text: 'L1: Whenever Hunk would take damage, you may redirect it to his partner instead. L2: At the beginning of your turn, Hunk gets +2 cards if he has no partner.', copies: 1, level1At: 3, level2At: 6, maxHp: 70, levels: [], abilities: [{ kind: 'damageRedirectToPartner', level: 1 }] },
  { id: 'ch-016', name: 'Jill Valentine (Brainwashed)', type: 'character', set: 'alliance', text: 'L1: When Jill explores, one weapon she is using gets +10 damage if her partner has one or fewer cards attached. L2: During another player turn, when a Las Plagas infected is revealed, you may trash a Flash Grenade from your hand and apply its effect.', copies: 1, level1At: 1, level2At: 6, maxHp: 90, levels: [{ level: 1, text: 'When Jill explores, one weapon she is using gets +10 damage if her partner has one or fewer cards attached.' }, { level: 2, text: 'During another player\'s turn, when a Las Plagas infected is revealed, you may trash a Flash Grenade from your hand and apply its effect.' }], abilities: [{ kind: 'partnerAttachedCountDamageBonus', amount: 10, threshold: 1, level: 1 }, { kind: 'offTurnFlashGrenadeLasPlagas', level: 2 }] },
  { id: 'ch-017', name: 'Billy Coen', type: 'character', set: 'alliance', text: 'L1: During your turn, you may gain one Ammo x 10. If you do, you get +10 gold. L2: During your turn, if you have 10 or more cards in your discard pile, you may move one of them to your hand.', copies: 1, level1At: 1, level2At: 5, maxHp: 80, levels: [{ level: 1, text: 'During your turn, you may gain one Ammo x 10. If you do, you get +10 gold.' }, { level: 2, text: 'During your turn, if you have 10 or more cards in your discard pile, you may move one of them to your hand.' }], abilities: [{ kind: 'gainAmmoX10ForGold', amount: 10, level: 1 }, { kind: 'discardToHandIfTenPlus', threshold: 10, level: 2 }] },
  { id: 'ch-018', name: 'Leon S. Kennedy', type: 'character', set: 'alliance', text: 'L1: During your turn, you may move one card from your discard pile to the bottom of your inventory. L2: During your turn, you may move the bottom card of your inventory to the top.', copies: 1, level1At: 1, level2At: 7, maxHp: 80, levels: [{ level: 1, text: 'During your turn, you may move one card from your discard pile to the bottom of your inventory.' }, { level: 2, text: 'During your turn, you may move the bottom card of your inventory to the top.' }], abilities: [{ kind: 'discardCardToInventoryBottom', level: 1 }, { kind: 'inventoryBottomToTop', level: 2 }] },
  { id: 'ch-019', name: 'Chris Redfield', type: 'character', set: 'alliance', text: 'L1: One weapon he is using requires 20 less ammo, but only if he is using one weapon. L2: Lower the ammo requirement of one specific weapon type by 20 (player picks the type).', copies: 1, level1At: 3, level2At: 8, maxHp: 80, levels: [{ level: 1, text: 'One weapon he is using requires 20 less ammo, but only if he is using one weapon.' }, { level: 2, text: 'Lower the ammo requirement of one specific weapon type by 20 (player picks the type).' }], abilities: [{ kind: 'singleWeaponAmmoDiscount', amount: 20, level: 1 }, { kind: 'chosenWeaponTypeAmmoDiscount', amount: 20, level: 2 }] },
  { id: 'ch-020', name: 'Claire Redfield', type: 'character', set: 'alliance', text: 'L1: When you trash a Green Herb or Red Herb from your hand, Claire deals an additional 20 damage during this turn. L2: When you trash a Green Herb and a Red Herb from your hand, double all damage Claire deals during this turn.', copies: 1, level1At: 3, level2At: 7, maxHp: 80, levels: [{ level: 1, text: 'When you trash a Green Herb or Red Herb from your hand, Claire deals an additional 20 damage during this turn.' }, { level: 2, text: 'When you trash a Green Herb and a Red Herb from your hand, double all damage Claire deals during this turn.' }], abilities: [{ kind: 'herbTrashDamageBonus', amount: 20, level: 1 }, { kind: 'doubleDamageOnBothHerbs', level: 2 }] },
  // ========================================================================
  // WEAPONS - KNIVES
  // ========================================================================
  
  
  // ========================================================================
  // WEAPONS - PISTOLS
  // ========================================================================
  
  { id: 'we-025', name: 'Blowback Pistol', type: 'weapon', set: 'alliance', text: 'Discard any number of "Pistol" cards from hand to play. +10 damage per card discarded.', weaponType: 'handgun', copies: 5, cost: 40, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [{ kind: 'discardPistolsForDamage', amount: 10 }] },
  { id: 'we-018', name: 'Grenade Launcher [F. Grenade]', type: 'weapon', set: 'alliance', text: 'All Explosives go to discard instead of trash. Requires ammo. Deals 20 damage.', weaponType: 'explosive', copies: 1, cost: 80, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [{ kind: 'explosivesToDiscardInsteadOfTrash' }] },
  
  // ========================================================================
  // WEAPONS - SHOTGUNS
  // ========================================================================
  
  { id: 'we-020', name: 'Riot Shotgun', type: 'weapon', set: 'alliance', text: 'You get +1 explore this turn. Requires 60 ammo. Deals 45 damage.', copies: 7, cost: 70, ammoReq: 60, damage: 45, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-021', name: 'Triple Barreled Shotgun', type: 'weapon', set: 'alliance', text: 'You get +2 explore this turn. +10 damage for each Infected being battled.', weaponType: 'shotgun', copies: 1, cost: 90, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 2 }, { kind: 'plusDamagePerInfectedBattled', amount: 10 }] },
  
  // ========================================================================
  // WEAPONS - RIFLES
  // ========================================================================
  
  { id: 'we-019', name: 'Telescopic Sight Rifle', type: 'weapon', set: 'alliance', text: 'When exploring, reveal cards from BOTTOM of Mansion instead of top. Requires 50 ammo. Deals 30 damage.', weaponType: 'rifle', copies: 7, cost: 50, ammoReq: 50, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'revealFromMansionBottom' }] },
  
  // ========================================================================
  // WEAPONS - MACHINE GUNS
  // ========================================================================
  
  { id: 'we-022', name: 'Russian Assault Rifle', type: 'weapon', set: 'alliance', text: 'Machine gun. X/X ammo/damage, cap 20.', weaponType: 'rifle', copies: 4, cost: 40, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [], xAmmo: true, ammoCap: 20 },
  { id: 'we-023', name: 'Signature Special', type: 'weapon', set: 'alliance', text: 'Machine gun. X/X ammo/damage, cap 60.', copies: 1, cost: 70, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [], xAmmo: true, ammoCap: 60 },
  
  // ========================================================================
  // WEAPONS - MAGNUM
  // ========================================================================
  
  
  // ========================================================================
  // WEAPONS - EXPLOSIVE
  // ========================================================================
  
  { id: 'we-017', name: 'Flash Grenade', type: 'weapon', set: 'alliance', text: 'Next "Las Plagas" revealed is defeated. Move low HP Infected to bottom of mansion. Trashes after use. No ammo.', weaponType: 'explosive', copies: 5, cost: 20, ammoReq: 0, damage: 0, weaponTags: ['explosive'], weaponEffects: [] },
  { id: 'we-018g', name: 'Grenade Launcher', type: 'weapon', set: 'alliance', text: 'All Explosives go to discard instead of trash. Requires ammo. Deals 20 damage.', weaponType: 'explosive', copies: 1, cost: 80, ammoReq: 0, damage: 20, weaponTags: ['explosive'], weaponEffects: [{ kind: 'explosivesToDiscardInsteadOfTrash' }] },
  
  // ========================================================================
  // WEAPONS - BOW
  // ========================================================================
  
  
  // ========================================================================
  // WEAPONS - SPECIAL
  // ========================================================================
  
  { id: 'we-024', name: 'Flamethrower', type: 'weapon', set: 'alliance', text: 'X = 5 x discard pile size. No ammo.', copies: 5, cost: 90, ammoReq: 0, damage: 0, weaponTags: ['gun'], weaponEffects: [] },
  
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
  
  { id: 'it-004', name: 'Red Herb', type: 'item', set: 'alliance', text: '+20 max HP.', copies: 2, cost: 20, itemEffects: [{ kind: 'healSelfAndPartnerToFull' }] },
  
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
  { id: 'ac-021', name: 'Gathering Forces', type: 'action', set: 'alliance', text: 'You get +20 gold, +1 action, and +1 buy. Any cards you gain this turn go to your hand instead of your discard pile.', copies: 5, cost: 90, bonuses: { gold: 20, actions: 1, buys: 1 }, actionEffects: [{ kind: 'gainedCardsGoToHand' }] },
  { id: 'ac-022', name: 'Desperate Forces', type: 'action', set: 'alliance', text: 'You get +20 ammo and +1 action. Choose a weapon type. All weapons of that type get +10 damage this turn.', copies: 5, cost: 70, bonuses: { ammo: 20, actions: 1 } },
];