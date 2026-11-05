import type { CardDef, CardBonuses } from '../types';
import { ALLIANCE_CARDS } from './alliance';

export const PREMIER_CARDS: ReadonlyArray<CardDef> = [
  // Characters
  { id: 'ch-001', name: 'Albert Wesker', type: 'character', set: 'premier', text: 'When Wesker attacks a Character or Explores, +20 Gold that turn.', copies: 1, level1At: 2, level2At: 9, maxHp: 100, levels: [{ level: 1, text: 'When Wesker attacks a Character or Explores, +20 Gold that turn.' }, { level: 2, text: 'During your turn choose a Player; that Player gets +1 Explore and must Explore at least once on their next turn.' }], abilities: [{ kind: 'exploreGoldBonus', amount: 20, level: 1 }, { kind: 'forceExploreOtherPlayer', level: 2 }] },
  { id: 'ch-002', name: 'Leon S. Kennedy', type: 'character', set: 'premier', text: 'All your Pistol weapons get -10 Ammo Requirement.', copies: 1, level1At: 2, level2At: 6, maxHp: 80, levels: [{ level: 1, text: 'All your Pistol weapons get -10 Ammo Requirement.' }, { level: 2, text: 'All your Pistol weapons can be used twice per turn.' }], abilities: [{ kind: 'ammoReqReduction', tag: 'pistol', amount: 10, level: 1 }, { kind: 'pistolsTwicePerTurn', level: 2 }] },
  { id: 'ch-003', name: 'Claire Redfield', type: 'character', set: 'premier', text: 'Your Ammunition cards give +10 Ammo (extra).', copies: 1, level1At: 2, level2At: 6, maxHp: 70, levels: [{ level: 1, text: 'Your Ammunition cards give +10 Ammo (extra).' }, { level: 2, text: 'Your Ammunition cards give +10 Gold (extra).' }], abilities: [{ kind: 'ammunitionBonus', ammoAmount: 10, goldAmount: 0, level: 1 }, { kind: 'ammunitionBonus', ammoAmount: 0, goldAmount: 10, level: 2 }] },
  { id: 'ch-004', name: 'Sheva Alomar', type: 'character', set: 'premier', text: 'During your turn, exchange 1 card in hand with the top card of your Inventory.', copies: 1, level1At: 2, level2At: 4, maxHp: 80, levels: [{ level: 1, text: 'During your turn, exchange 1 card in hand with the top card of your Inventory.' }, { level: 2, text: 'All your Rifle weapons get -20 Ammo Requirement.' }], abilities: [{ kind: 'exchangeHandWithInventoryTop', level: 1 }, { kind: 'ammoReqReduction', tag: 'rifle', amount: 20, level: 2 }] },
  { id: 'ch-005', name: 'Barry Burton', type: 'character', set: 'premier', text: 'When attacking/exploring, one of Barry\'s weapons gets +5 damage for the turn.', copies: 1, level1At: 2, level2At: 7, maxHp: 90, levels: [{ level: 1, text: 'When attacking/exploring, one of Barry\'s weapons gets +5 damage for the turn.' }, { level: 2, text: 'All Magnum weapons get +20 damage.' }], abilities: [{ kind: 'plusDamageThisTurn', amount: 5, level: 1 }, { kind: 'weaponTagPlusDamage', tag: 'magnum', amount: 20, level: 2 }] },
  { id: 'ch-006', name: 'Ada Wong', type: 'character', set: 'premier', text: 'Reveal top of Mansion without engaging/effect.', copies: 1, level1At: 4, level2At: 8, maxHp: 80, levels: [{ level: 1, text: 'Reveal top of Mansion without engaging/effect.' }, { level: 2, text: 'Exchange your Buy for an additional Action.' }], abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'exchangeBuyForAction', level: 2 }] },
  { id: 'ch-007', name: 'Jack Krauser', type: 'character', set: 'premier', text: 'At beginning of your turn, may gain 1 Knife weapon.', copies: 1, level1At: 1, level2At: 7, maxHp: 80, levels: [{ level: 1, text: 'At beginning of your turn, may gain 1 Knife weapon.' }, { level: 2, text: 'All your Knife weapons get +5 Damage.' }], abilities: [{ kind: 'gainKnifeAtTurnStart', level: 1 }, { kind: 'weaponTagPlusDamage', tag: 'knife', amount: 5, level: 2 }] },
  { id: 'ch-008', name: 'Chris Redfield', type: 'character', set: 'premier', text: 'Chris cannot be healed and cannot attach non-Infected cards.', copies: 1, level1At: 0, level2At: 4, maxHp: 120, levels: [{ level: 1, text: 'Chris cannot be healed and cannot attach non-Infected cards.' }, { level: 2, text: '1 Weapon Chris uses gets +5 damage for each Infected he is fighting.' }], abilities: [{ kind: 'noHealingNoNonInfectedAttach', level: 1 }, { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 2 }] },
  { id: 'ch-009', name: 'Jill Valentine', type: 'character', set: 'premier', text: 'All your Explosive weapons get +5 damage.', copies: 1, level1At: 5, level2At: 8, maxHp: 80, levels: [{ level: 1, text: 'All your Explosive weapons get +5 damage.' }, { level: 2, text: 'Your Explosive weapons go to discard instead of being trashed.' }], abilities: [{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }, { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }] },
  { id: 'pr-001', name: 'Chris Redfield (Promo)', type: 'character', set: 'promo', text: 'Reduce the Damage Infected deal to Chris by 10.', copies: 1, level1At: 4, level2At: 8, maxHp: 90, levels: [{ level: 1, text: 'Reduce the Damage Infected deal to Chris by 10.' }, { level: 2, text: 'Reduce the Damage Weapons deal to Chris by 10. Additionally, Chris gets +1 Explore at the beginning of the Turn.' }], abilities: [{ kind: 'infectedDamageReduction', amount: 10, level: 1 }, { kind: 'weaponDamageReduction', amount: 10, level: 2 }, { kind: 'extraExploreAtTurnStart', level: 2 }] },
  { id: 'pr-002', name: 'Jill Valentine (Promo)', type: 'character', set: 'promo', text: 'At the beginning of your Turn, you can Skip your current Turn and Discard your Hand. At the beginning of your next Turn, you get +5 Cards, +1 Buy, +1 Action, and +1 Explore.', copies: 1, level1At: 8, level2At: undefined, maxHp: 80, levels: [{ level: 1, text: 'At the beginning of your Turn, you can Skip your current Turn and Discard your Hand. At the beginning of your next Turn, you get +5 Cards, +1 Buy, +1 Action, and +1 Explore.' }], abilities: [{ kind: 'skipTurnForSuperNextTurn', level: 1 }] },
  { id: 'pr-009', name: 'Rebecca Chambers (Nurse)', type: 'character', set: 'promo', text: 'At the beginning of your turn, you can select another Player and they get +1 card. If they do, you can have a Player get +1 card.', copies: 1, level1At: 1, level2At: 4, maxHp: 70, levels: [{ level: 1, text: 'At the beginning of your turn, you can select another Player and they get +1 card. If they do, you can have a Player get +1 card.' }, { level: 2, text: 'During your turn, while Rebecca is Exploring, Rebecca deals an additional 10 Damage for each Player with more than 5 cards in their Hand.' }], abilities: [{ kind: 'giveOneCardToPlayerThenMaybeAnother', level: 1 }, { kind: 'exploreDamagePerPlayerWithBigHand', amount: 10, threshold: 5, level: 2 }] },
  { id: 'pr-010', name: 'HUNK', type: 'character', set: 'promo', text: 'At the beginning of your turn, you can Reveal your Hand. If you Revealed 2 or more different card types this way, Hunk deals an additional 10 Damage during this turn.', copies: 1, level1At: 2, level2At: 5, maxHp: 90, levels: [{ level: 1, text: 'At the beginning of your turn, you can Reveal your Hand. If you Revealed 2 or more different card types this way, Hunk deals an additional 10 Damage during this turn.' }, { level: 2, text: 'During your turn, while Hunk is Exploring, Hunk deals an additional 20 Damage if you have 4 or more Actions in your Play Area.' }], abilities: [{ kind: 'revealHandForDamageIfTwoTypes', amount: 10, level: 1 }, { kind: 'exploreBonusIfActionsInPlayArea', amount: 20, minActions: 4, level: 2 }] },
  { id: 'ch-010', name: 'Rebecca Chambers', type: 'character', set: 'premier', text: 'Cards you trash via effects may go to other players\' discard piles instead.', copies: 1, level1At: 2, level2At: 4, maxHp: 70, levels: [{ level: 1, text: 'Cards you trash via effects may go to other players\' discard piles instead.' }, { level: 2, text: 'You may trash cards from hand whenever you please.' }], abilities: [{ kind: 'trashRedirectToPlayerDiscard', level: 1 }, { kind: 'trashFromHandAtWill', level: 2 }] },

  // Weapons
  { id: 'we-001', name: 'Grenade', type: 'weapon', set: 'premier', text: 'No ammo. Deals 15 damage. Trashed after use.', weaponType: 'explosive', copies: 5, cost: 40, ammoReq: 0, damage: 15, weaponTags: ['explosive'] },
  { id: 'we-002', name: 'Longbow', type: 'weapon', set: 'premier', text: 'No ammo. Deals 25 damage.', weaponType: 'bow', copies: 5, cost: 110, ammoReq: 0, damage: 25, weaponTags: ['gun'] },
  { id: 'we-003', name: 'Submission', type: 'weapon', set: 'premier', text: 'Melee. +5 damage if you have 80 or more Health.', copies: 5, cost: 20, ammoReq: 0, damage: 5, weaponTags: ['melee'], weaponEffects: [{ kind: 'plusDamageIfSelfHpAtLeast', hp: 80, amount: 5 }] },
  { id: 'we-004', name: 'Combat Knife', type: 'weapon', set: 'premier', text: 'Free, no ammo. Deals 5 damage.', weaponType: 'knife', copies: 11, cost: 0, ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'] },
  { id: 'we-005', name: 'Survival Knife', type: 'weapon', set: 'premier', text: 'This Weapon gets +5 Damage for every other "Knife" Weapon used this turn.', copies: 1, cost: 50, ammoReq: 0, damage: 10, weaponTags: ['melee', 'knife'], weaponEffects: [{ kind: 'plusDamagePerKnifeUsed', amount: 5 }] },
  { id: 'we-006', name: 'Six Shooter', type: 'weapon', set: 'premier', text: 'Requires 50 ammo. Deals 50 damage.', copies: 5, cost: 90, ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'] },
  { id: 'we-007', name: 'Gatling Gun', type: 'weapon', set: 'premier', text: 'Requires X ammo, deals X damage: X equals your total current Ammo.', copies: 1, ammoReq: 0, damage: 0, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'damageEqualsCurrentAmmo' }] },
  { id: 'we-008', name: 'Rocket Launcher', type: 'weapon', set: 'premier', text: 'Deals 100 damage. Instantly defeats any Infected.', copies: 1, ammoReq: 0, damage: 100, weaponTags: ['explosive'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 90 }] },
  { id: 'we-009', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Requires 20 ammo. Deals 10 damage.', weaponType: 'handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'] },
  { id: 'we-010', name: 'Burst-Fire Handgun', type: 'weapon', set: 'premier', text: '+20 damage when used alongside another Weapon in the same Explore.', copies: 1, cost: 60, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'], weaponEffects: [{ kind: 'plusDamagePerExtraWeapon', amount: 20 }] },
  { id: 'we-011', name: 'Assault Machine Gun', type: 'weapon', set: 'premier', text: 'Requires 40 ammo. Deals 20 damage.', weaponType: 'machinegun', copies: 4, cost: 30, ammoReq: 40, damage: 20, weaponTags: ['gun', 'machineGun'] },
  { id: 'we-012', name: 'Full-Bore Machine Gun', type: 'weapon', set: 'premier', text: '+30 damage if you have more than 100 Ammo this turn.', copies: 1, cost: 100, ammoReq: 70, damage: 40, weaponTags: ['gun', 'machineGun'], weaponEffects: [{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }] },
  { id: 'we-013', name: 'Pump-Action Shotgun', type: 'weapon', set: 'premier', text: 'Grants +1 Explore.', copies: 4, cost: 40, ammoReq: 40, damage: 25, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'grantExplores', amount: 1 }] },
  { id: 'we-014', name: 'Automatic Shotgun', type: 'weapon', set: 'premier', text: 'Instantly defeats any Infected with 40 or less Health. +1 Explore.', copies: 1, cost: 80, ammoReq: 80, damage: 50, weaponTags: ['gun', 'shotgun'], weaponEffects: [{ kind: 'instantKillAtOrBelowHp', hp: 40 }, { kind: 'grantExplores', amount: 1 }] },
  { id: 'we-015', name: 'Bolt-Action Rifle', type: 'weapon', set: 'premier', text: 'Reveal top card of your Inventory: if its Gold cost is 40 or more, +30 damage.', copies: 4, cost: 50, ammoReq: 50, damage: 20, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'revealTopOfInventoryCostGate', threshold: 40, amount: 30 }] },
  { id: 'we-016', name: 'Semi-Automatic Rifle', type: 'weapon', set: 'premier', text: '+10 damage for every Action card played this turn.', copies: 1, cost: 90, ammoReq: 70, damage: 30, weaponTags: ['gun', 'rifle'], weaponEffects: [{ kind: 'plusDamagePerActionPlayedThisTurn', amount: 10 }] },

  // Ammunition
  { id: 'am-001', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Grants +10 Ammo and +10 Gold for the turn.', copies: 28, cost: 0, bonuses: { ammo: 10, gold: 10 } },
  { id: 'am-002', name: 'Ammo x20', type: 'ammunition', set: 'premier', text: 'Grants +20 Ammo and +20 Gold for the turn.', copies: 15, cost: 30, bonuses: { ammo: 20, gold: 20 } },
  { id: 'am-003', name: 'Ammo x30', type: 'ammunition', set: 'premier', text: 'Grants +30 Ammo and +30 Gold for the turn.', copies: 15, cost: 60, bonuses: { ammo: 30, gold: 30 } },

  // Actions
  { id: 'ac-001', name: 'Mansion Foyer', type: 'action', set: 'premier', text: '+2 Cards.', copies: 10, cost: 30, bonuses: { cards: 2 } },
  { id: 'ac-002', name: 'Deadly Aim', type: 'action', set: 'premier', text: 'All your Weapons get +10 damage this turn.', copies: 5, cost: 50, bonuses: { ammo: 20 }, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] },
  { id: 'ac-003', name: 'Shattered Memories', type: 'action', set: 'premier', text: 'Trash up to 2 cards from your discard pile.', copies: 5, cost: 20, actionEffects: [{ kind: 'trashUpToTwoFromDiscard' }] },
  { id: 'ac-004', name: 'Escape from the Dead City', type: 'action', set: 'premier', text: '+1 Card, +2 Actions.', copies: 10, cost: 70, bonuses: { cards: 1, actions: 2 } },
  { id: 'ac-005', name: 'Reload', type: 'action', set: 'premier', text: 'Move 1 Weapon from your discard pile to your hand.', copies: 5, cost: 50, bonuses: { actions: 2, ammo: 20 }, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] },
  { id: 'ac-006', name: 'The Merchant', type: 'action', set: 'premier', text: '+1 Buy, +1 Card, +20 Gold.', copies: 6, cost: 50, bonuses: { buys: 1, cards: 1, gold: 20 } },
  { id: 'ac-007', name: 'Umbrella Corporation', type: 'action', set: 'premier', text: 'Move 1 card from your hand to the top of your Inventory.', copies: 5, cost: 50, bonuses: { actions: 1, cards: 2 }, actionEffects: [{ kind: 'moveHandCardToTopOfInventory' }] },
  { id: 'ac-008', name: 'Back to Back', type: 'action', set: 'premier', text: 'Discard from hand to lower the damage of 1 opposing weapon by 20 (Versus only; no-op in Story).', copies: 5, cost: 40, bonuses: { actions: 1, gold: 10 }, actionEffects: [{ kind: 'negateWeaponCost40OrLessFromHand' }] },
  { id: 'ac-009', name: 'Item Management', type: 'action', set: 'premier', text: 'Trash 1 Ammo card from hand to gain an Ammo card worth at least 30 Gold more.', copies: 5, cost: 30, actionEffects: [{ kind: 'upgradeAmmoBy30Gold' }] },
  { id: 'ac-010', name: 'Ominous Battle', type: 'action', set: 'premier', text: 'Trash 1 card from your hand.', copies: 5, cost: 60, bonuses: { cards: 3, gold: 10 }, actionEffects: [{ kind: 'trashHandCard' }] },
  { id: 'ac-011', name: 'Master of Unlocking', type: 'action', set: 'premier', text: 'All other players reveal top card of their Inventory; you may take each revealed Weapon.', copies: 3, cost: 30, bonuses: { actions: 1 }, actionEffects: [{ kind: 'stealRevealedWeaponsFromOpponentsTopCards' }] },
  { id: 'ac-012', name: 'Struggle for Survival', type: 'action', set: 'premier', text: 'May discard from hand to set the damage of 1 Weapon (cost 40 or less) being used to 0.', copies: 5, cost: 30, bonuses: { actions: 1, explores: 1 }, actionEffects: [{ kind: 'negateWeaponCost40OrLessFromHand' }] },

  // Items
  { id: 'it-001', name: 'Green Herb', type: 'item', set: 'premier', text: 'Trash: heal 20, or trash with another Green Herb to heal 60.', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  { id: 'it-002', name: 'Yellow Herb', type: 'item', set: 'premier', text: 'Gain: attach to this character, +10 max Health. Heal 10 at the start of your next Turn.', copies: 3, itemEffects: [{ kind: 'plusMaxHp', amount: 10 }] },
  { id: 'it-003', name: 'First Aid Spray', type: 'item', set: 'premier', text: 'Heal your Character to full Health.', copies: 5, cost: 60, itemEffects: [{ kind: 'healToFull' }] },

  // Infected
  { id: 'ma-001', name: 'Majini', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 20, attack: 10, decorations: 1 },
  { id: 'ma-002', name: 'Zombie (Male)', type: 'infected', set: 'premier', text: 'No effect.', copies: 2, hp: 20, attack: 10, decorations: 1 },
  { id: 'ma-003', name: 'Zombie (Female)', type: 'infected', set: 'premier', text: 'On defeat: choose a player; they can\'t play Actions next turn.', copies: 2, hp: 15, attack: 10, decorations: 1, infectedEffects: [{ kind: 'noActionsNextTurnOfAPlayerOnDefeat' }] },
  { id: 'ma-004', name: 'Zombie Butcher', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 25, attack: 20, decorations: 2 },
  { id: 'ma-005', name: 'Bui Kichwa', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 10, attack: 10, decorations: 1 },
  { id: 'ma-006', name: 'Licker', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 40, attack: 30, decorations: 3 },
  { id: 'ma-007', name: 'Nemesis (T-Type)', type: 'infected', set: 'premier', text: 'No effect.', copies: 1, hp: 60, attack: 50, decorations: 5 },
  { id: 'ma-008', name: 'Hunter', type: 'infected', set: 'premier', text: 'No effect.', copies: 2, hp: 25, attack: 20, decorations: 2 },
  { id: 'ma-009', name: 'Mimicry Marcus', type: 'infected', set: 'premier', text: 'No effect.', copies: 2, hp: 30, attack: 25, decorations: 2 },
  { id: 'ma-010', name: 'Uroboros Aheri', type: 'infected', set: 'premier', text: 'If not defeated, shuffle back into the Mansion.', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] },
  { id: 'ma-011', name: 'Dr. Salvador', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 40, attack: 35, decorations: 3 },
  { id: 'ma-014', name: 'Gatling Gun Majini', type: 'infected', set: 'premier', text: '+5 damage per full increment of 10 Ammo the attacker has.', copies: 3, hp: 40, attack: 30, decorations: 3, infectedEffects: [{ kind: 'plusDamagePerFull10AmmoOfAttacker', amount: 5 }] },
  { id: 'ma-015', name: 'Cerberus', type: 'infected', set: 'premier', text: 'No effect.', copies: 3, hp: 25, attack: 10, decorations: 2 },
  { id: 'ma-016', name: 'El Gigante', type: 'infected', set: 'premier', text: 'No effect.', copies: 1, hp: 70, attack: 60, decorations: 6 },
  { id: 'ma-017', name: 'Executioner', type: 'infected', set: 'premier', text: 'On defeat: choose a player; they skip their next turn.', copies: 1, hp: 30, attack: 25, decorations: 3, infectedEffects: [{ kind: 'skipNextTurnOfAPlayerOnDefeat' }] },
  // Alliance infected
  { id: 'ma-022', name: 'Lurker', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 10, attack: 10, decorations: 1 },
  { id: 'ma-023', name: 'Infected Bat', type: 'infected', set: 'alliance', text: '+20 HP if attacked with another infected.', copies: 3, hp: 15, attack: 20, decorations: 1, infectedEffects: [{ kind: 'plusHpIfAttackedWithAnotherInfected', amount: 20 }] },
  { id: 'ma-024', name: 'Licker Beta', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 35, attack: 20, decorations: 3 },
  { id: 'ma-025', name: 'Duvalia (Las Plagas)', type: 'infected', set: 'alliance', text: 'On kill: player with most decorations gains five Ammo x 10.', copies: 2, hp: 60, attack: 40, decorations: 5, infectedEffects: [{ kind: 'onKillGainAmmoX10ToMostDecorated', count: 5 }] },
  { id: 'ma-026', name: 'Garrador', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 50, attack: 40, decorations: 4 },
  { id: 'ma-027', name: 'Zombie (Male)', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 20, attack: 10, decorations: 1 },
  { id: 'ma-028', name: 'Kipepeo (Las Plagas)', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 20, attack: 20, decorations: 1 },
  { id: 'ma-029', name: 'Albert Wesker', type: 'infected', set: 'alliance', text: 'All other revealed infected get +10 health and +10 damage this turn.', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'buffOtherRevealedInfected', hp: 10, damage: 10 }] },
  { id: 'ma-030', name: 'Cephalo (Las Plagas)', type: 'infected', set: 'alliance', text: 'On defeat: choose a player; they must explore next turn.', copies: 3, hp: 25, attack: 20, decorations: 2, infectedEffects: [{ kind: 'mustExploreNextTurnOnDefeat' }] },
  { id: 'ma-031', name: 'Proto Tyrant', type: 'infected', set: 'alliance', text: 'On reveal: non-exploring characters with 50+ HP take 40 damage.', copies: 1, hp: 60, attack: 40, decorations: 5 },
  { id: 'ma-032', name: 'Iron Maiden', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 50, attack: 30, decorations: 4 },
  { id: 'ma-033', name: 'Zombie Horde', type: 'infected', set: 'alliance', text: 'No effect.', copies: 3, hp: 30, attack: 20, decorations: 2 },
  { id: 'ma-034', name: 'Nosferatu', type: 'infected', set: 'alliance', text: 'No effect.', copies: 2, hp: 55, attack: 30, decorations: 4 },
  { id: 'ma-035', name: 'Los Illuminados Monk', type: 'infected', set: 'alliance', text: '+5 HP and +5 damage per infected attached to exploring main char.', copies: 2, hp: 15, attack: 20, decorations: 3, infectedEffects: [{ kind: 'plusHpAndDamagePerAttachedInfected', amount: 5 }] },
  { id: 'ma-036', name: 'Reaper', type: 'infected', set: 'alliance', text: 'If not defeated with damage equal to its health, trash highest-cost card attached to partner.', copies: 2, hp: 35, attack: 40, decorations: 4, infectedEffects: [{ kind: 'trashHighestCostAttachedOnPartnerIfNotExactDefeat' }] },
  { id: 'ma-037', name: 'Guardian of Insanity', type: 'infected', set: 'alliance', text: 'On reveal: each character takes 10 damage.', copies: 3, hp: 30, attack: 20, decorations: 2 },
  // Tokens
  { id: 'ma-012', name: 'Rocket Launcher Case', type: 'token', set: 'premier', text: 'Gain the Rocket Launcher weapon. Trash this token.', copies: 1, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-008' }] },
  { id: 'ma-013', name: 'Gatling Gun Case', type: 'token', set: 'premier', text: 'Gain the Gatling Gun weapon. Trash this token.', copies: 1, tokenEffects: [{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-007' }] }
];

export const FIRST_TIMER_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },
  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },
  { pileId: 'herb', cardIds: ['it-001'] },
  { pileId: 'umb', cardIds: ['ac-007'] },
  { pileId: 'foyer', cardIds: ['ac-001'] },
  { pileId: 'escape', cardIds: ['ac-004'] },
  { pileId: 'aim', cardIds: ['ac-002'] },
  { pileId: 'smt', cardIds: ['ac-003'] },
  { pileId: 'merc', cardIds: ['ac-006'] },
  { pileId: 'reload', cardIds: ['ac-005'] },
  { pileId: 'grn', cardIds: ['we-001'] },
  { pileId: 'six', cardIds: ['we-006'] },
  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },
  { pileId: 'rf', cardIds: ['we-015', 'we-016'] },
  { pileId: 'mg', cardIds: ['we-011', 'we-012'] }
];

/**
 * Classic Horror (rulebook p.8 "Additional Story Mode Options"): the base-game
 * scenario — Basic Resources plus Umbrella Corp, Mansion Foyer, Deadly Aim,
 * Shattered Memories, Reload, Item Management, First Aid Spray, Longbow,
 * Grenade, Submission, and the combined shotgun/MG piles.
 */
export const CLASSIC_HORROR_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },
  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },
  { pileId: 'herb', cardIds: ['it-001'] },
  { pileId: 'umb', cardIds: ['ac-007'] },
  { pileId: 'foyer', cardIds: ['ac-001'] },
  { pileId: 'aim', cardIds: ['ac-002'] },
  { pileId: 'smt', cardIds: ['ac-003'] },
  { pileId: 'reload', cardIds: ['ac-005'] },
  { pileId: 'itemmgmt', cardIds: ['ac-009'] },
  { pileId: 'spray', cardIds: ['it-003'] },
  { pileId: 'longbow', cardIds: ['we-002'] },
  { pileId: 'grn', cardIds: ['we-001'] },
  { pileId: 'sub', cardIds: ['we-003'] },
  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },
  { pileId: 'mg', cardIds: ['we-011', 'we-012'] }
];

/**
 * Spy Games (rulebook p.8): 18 piles featuring Master of Unlocking (steal
 * revealed weapons) and Ominous Battle alongside the classic arsenal, with
 * Escape from the Dead City back in and the rifles out.
 */
export const SPY_GAMES_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },
  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },
  { pileId: 'herb', cardIds: ['it-001'] },
  { pileId: 'umb', cardIds: ['ac-007'] },
  { pileId: 'omin', cardIds: ['ac-010'] },
  { pileId: 'escape', cardIds: ['ac-004'] },
  { pileId: 'mou', cardIds: ['ac-011'] },
  { pileId: 'itemmgmt', cardIds: ['ac-009'] },
  { pileId: 'aim', cardIds: ['ac-002'] },
  { pileId: 'spray', cardIds: ['it-003'] },
  { pileId: 'longbow', cardIds: ['we-002'] },
  { pileId: 'grn', cardIds: ['we-001'] },
  { pileId: 'six', cardIds: ['we-006'] },
  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },
  { pileId: 'mg', cardIds: ['we-011', 'we-012'] }
];

/**
 * Whaddya Buyin? (rulebook p.8): The Merchant makes his stand — Merchant,
 * Ominous Battle, Reload, Deadly Aim, Escape from the Dead City, Master of
 * Unlocking, Submission, Grenade, Six Shooter, shotguns, MGs and rifles on
 * top of the 6 Basic piles.
 */
export const WHADDYA_BUYIN_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },
  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },
  { pileId: 'herb', cardIds: ['it-001'] },
  { pileId: 'merc', cardIds: ['ac-006'] },
  { pileId: 'omin', cardIds: ['ac-010'] },
  { pileId: 'reload', cardIds: ['ac-005'] },
  { pileId: 'aim', cardIds: ['ac-002'] },
  { pileId: 'escape', cardIds: ['ac-004'] },
  { pileId: 'mou', cardIds: ['ac-011'] },
  { pileId: 'sub', cardIds: ['we-003'] },
  { pileId: 'grn', cardIds: ['we-001'] },
  { pileId: 'six', cardIds: ['we-006'] },
  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },
  { pileId: 'mg', cardIds: ['we-011', 'we-012'] },
  { pileId: 'rf', cardIds: ['we-015', 'we-016'] }
];

/**
 * Battle Hardened Veteran (Scenario Booklet v2, Premier Story Mode): pure
 * survivor fare — Deadly Aim, Mansion Foyer, Reload, Shattered Memories, The
 * Merchant, Umbrella Corporation, with every major weapon except Grenades.
 */
export const BATTLE_HARDENED_VETERAN_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },
  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },
  { pileId: 'herb', cardIds: ['it-001'] },
  { pileId: 'aim', cardIds: ['ac-002'] },
  { pileId: 'foyer', cardIds: ['ac-001'] },
  { pileId: 'reload', cardIds: ['ac-005'] },
  { pileId: 'smt', cardIds: ['ac-003'] },
  { pileId: 'merc', cardIds: ['ac-006'] },
  { pileId: 'umb', cardIds: ['ac-007'] },
  { pileId: 'mg', cardIds: ['we-011', 'we-012'] },
  { pileId: 'rf', cardIds: ['we-015', 'we-016'] },
  { pileId: 'longbow', cardIds: ['we-002'] },
  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },
  { pileId: 'six', cardIds: ['we-006'] },
  { pileId: 'sub', cardIds: ['we-003'] }
];

export type ScenarioId = 'firstTimer' | 'classicHorror' | 'spyGames' | 'whaddyaBuyin' | 'battleHardenedVeteran' | 'alliance' | 'partnersInEscape';

export const ALLIANCE_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  // Basic Resources (Alliance rulebook ch. V)
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'herb', cardIds: ['it-004'] },      // Green Herb
  { pileId: 'am5', cardIds: ['am-004'] },       // Alliance Ammo x5

  // Weapons - Knives
  { pileId: 'knife-plain', cardIds: ['we-004'] },
  { pileId: 'knife-survival', cardIds: ['we-005'] },

  // Weapons - Pistols
  { pileId: 'pistol', cardIds: ['we-018'] },
  { pileId: 'pistol-burst', cardIds: ['we-010'] },
  { pileId: 'pistol-blowback', cardIds: ['we-025'] },
  { pileId: 'pistol-samurai', cardIds: ['we-027'] },

  // Weapons - Shotguns
  { pileId: 'shotgun-sawed', cardIds: ['we-020'] },
  { pileId: 'shotgun-trio', cardIds: ['we-021'] },
  { pileId: 'shotgun-pump', cardIds: ['we-013'] },
  { pileId: 'shotgun-auto', cardIds: ['we-014'] },
  { pileId: 'shotgun-custom', cardIds: ['we-044'] },

  // Weapons - Rifles
  { pileId: 'rifle-scope', cardIds: ['we-019'] },
  { pileId: 'rifle-bolt', cardIds: ['we-015'] },
  { pileId: 'rifle-semi', cardIds: ['we-016'] },
  { pileId: 'rifle-single', cardIds: ['we-036'] },
  { pileId: 'rifle-specops', cardIds: ['we-037'] },
  { pileId: 'rifle-custom', cardIds: ['we-047'] },

  // Weapons - Machine Guns
  { pileId: 'mg-assault', cardIds: ['we-011'] },
  { pileId: 'mg-full', cardIds: ['we-012'] },
  { pileId: 'mg-pistol', cardIds: ['we-038'] },
  { pileId: 'mg-gangster', cardIds: ['we-039'] },
  { pileId: 'mg-russian', cardIds: ['we-022'] },
  { pileId: 'mg-signature', cardIds: ['we-023'] },

  // Weapons - Magnum
  { pileId: 'magnum-six', cardIds: ['we-006'] },
  { pileId: 'magnum-lightning', cardIds: ['we-030'] },
  { pileId: 'magnum-hawk', cardIds: ['we-029'] },
  { pileId: 'magnum-broken', cardIds: ['we-035'] },
  { pileId: 'magnum-custom', cardIds: ['we-046'] },

  // Weapons - Explosive
  { pileId: 'explosive-flash', cardIds: ['we-017'] },
  { pileId: 'explosive-rocket', cardIds: ['we-008'] },
  { pileId: 'explosive-grenade-launcher', cardIds: ['we-018g'] },
  { pileId: 'explosive-flashbang', cardIds: ['we-040'] },
  { pileId: 'explosive-he', cardIds: ['we-041'] },
  { pileId: 'explosive-incendiary', cardIds: ['we-042'] },
  { pileId: 'explosive-night', cardIds: ['we-031'] },
  { pileId: 'explosive-mine', cardIds: ['we-034'] },

  // Weapons - Bow
  { pileId: 'bow-longbow', cardIds: ['we-002'] },
  { pileId: 'bow-hunting', cardIds: ['we-048'] },

  // Weapons - Melee/Special
  { pileId: 'melee-submission', cardIds: ['we-003'] },
  { pileId: 'melee-combat', cardIds: ['we-004'] },  // already in knife-plain
  { pileId: 'gun-grenade', cardIds: ['we-001'] },
  { pileId: 'gun-gatling', cardIds: ['we-007'] },
  { pileId: 'gun-flame', cardIds: ['we-024'] },
  { pileId: 'gun-heavy', cardIds: ['we-045'] },

  // Actions
  { pileId: 'action-longbow', cardIds: ['ac-013'] },
  { pileId: 'action-grenade', cardIds: ['ac-014'] },
  { pileId: 'action-back-to-back', cardIds: ['ac-015'] },
  { pileId: 'action-reload', cardIds: ['ac-016'] },
  { pileId: 'action-single-shot', cardIds: ['ac-017'] },
  { pileId: 'action-specops', cardIds: ['ac-018'] },
  { pileId: 'action-high-cal', cardIds: ['ac-020'] },
  { pileId: 'action-quick-reload', cardIds: ['ac-021'] },
  { pileId: 'action-adrenaline', cardIds: ['ac-022'] },
  { pileId: 'action-silver', cardIds: ['ac-032'] },
  { pileId: 'action-punisher', cardIds: ['ac-033'] },
  { pileId: 'action-flashbang', cardIds: ['ac-040'] },
  { pileId: 'action-merc', cardIds: ['ac-050'] },
];

export const PARTNERS_IN_ESCAPE_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [
  { pileId: 'am10', cardIds: ['am-001'] },
  { pileId: 'am20', cardIds: ['am-002'] },
  { pileId: 'am30', cardIds: ['am-003'] },
  { pileId: 'herb', cardIds: ['it-004'] },
  { pileId: 'action-archrival', cardIds: ['ac-016'] },
  { pileId: 'action-cornered', cardIds: ['ac-020'] },
  { pileId: 'action-great-ambition', cardIds: ['ac-015'] },
  { pileId: 'action-partners', cardIds: ['ac-013'] },
  { pileId: 'action-quirk', cardIds: ['ac-019'] },
  { pileId: 'action-star-crossed', cardIds: ['ac-014'] },
  { pileId: 'weapon-flamethrower', cardIds: ['we-024'] },
  { pileId: 'weapon-flash-grenade', cardIds: ['we-017', 'we-018g'] },
  { pileId: 'weapon-shotgun', cardIds: ['we-020', 'we-021'] },
  { pileId: 'weapon-assault', cardIds: ['we-022', 'we-023'] },
  { pileId: 'weapon-telescopic', cardIds: ['we-019'] },
];

export const PARTNERS_IN_ESCAPE_SCENARIO_DEF = {
  id: 'partnersInEscape' as ScenarioId,
  name: 'Partners in Escape',
  description: 'Partners in Escape scenario - Red Herb plus partner-focused action and weapon piles.',
  piles: PARTNERS_IN_ESCAPE_PILES,
  alliance: true,
};

export const ALLIANCE_SCENARIO_DEF = {
  id: 'alliance' as ScenarioId,
  name: 'Alliance',
  description: 'Stand-alone expansion scenario — Basic Resources + all Alliance card piles.',
  piles: ALLIANCE_PILES,
  alliance: true,
};

/** Scenario definition interface for type exports */
export interface ScenarioDef {
  readonly id: ReadonlyArray<ScenarioId>[0];
  readonly name: string;
  readonly description: string;
  readonly piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>;
  readonly alliance?: boolean;
  readonly mansionCards?: ReadonlyArray<{ cardId: string; count: number }>;
}


export const STANDARD_MANSION_DECK: ReadonlyArray<{ cardId: string; count: number }> = [
  { cardId: 'ma-001', count: 3 },
  { cardId: 'ma-002', count: 2 },
  { cardId: 'ma-003', count: 2 },
  { cardId: 'ma-004', count: 3 },
  { cardId: 'ma-005', count: 3 },
  { cardId: 'ma-006', count: 3 },
  { cardId: 'ma-007', count: 1 },
  { cardId: 'ma-008', count: 2 },
  { cardId: 'ma-009', count: 2 },
  { cardId: 'ma-010', count: 1 },
  { cardId: 'ma-011', count: 3 },
  { cardId: 'ma-014', count: 3 },
  { cardId: 'ma-015', count: 3 },
  { cardId: 'ma-016', count: 1 },
  { cardId: 'ma-017', count: 1 },
  { cardId: 'ma-012', count: 1 },
  { cardId: 'ma-013', count: 1 },
  { cardId: 'it-002', count: 3 },
];

export const SCENARIOS = [
  {
    id: 'firstTimer',
    name: 'First Timer',
    description: 'The starter scenario — a guided intro with The Merchant and Six Shooter.',
    piles: FIRST_TIMER_PILES,
    mansionCards: STANDARD_MANSION_DECK,
  },
  {
    id: 'classicHorror',
    name: 'Classic Horror',
    description: 'The base-game scenario — Item Management, First Aid Spray, Longbow and Submission for the classic RE arsenal.',
    piles: CLASSIC_HORROR_PILES,
    mansionCards: STANDARD_MANSION_DECK,
  },
  {
    id: 'spyGames',
    name: 'Spy Games',
    description: 'Master of Unlocking lets you steal weapons from other survivors — plus Ominous Battle and Six Shooter.',
    piles: SPY_GAMES_PILES,
    mansionCards: STANDARD_MANSION_DECK,
  },
  {
    id: 'whaddyaBuyin',
    name: 'Whaddya Buyin?',
    description: 'The Merchant appears — bargain-hunter economy with Reload, Master of Unlocking and the full rifle lineup.',
    piles: WHADDYA_BUYIN_PILES,
    mansionCards: STANDARD_MANSION_DECK,
  },
  {
    id: 'battleHardenedVeteran',
    name: 'Battle Hardened Veteran',
    description: 'A final surge of Infected — Deadly Aim, Merchant and Umbrella Corp with every major weapon.',
    piles: BATTLE_HARDENED_VETERAN_PILES,
  },
  ALLIANCE_SCENARIO_DEF,
  PARTNERS_IN_ESCAPE_SCENARIO_DEF,
];

export function pilesForScenario(id: ScenarioId): ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> {
  const found = SCENARIOS.find(s => s.id === id);
  if (found === undefined) {
    throw new Error(`unknown scenario: ${String(id)}`);
  }
  return found.piles;
}

export const STARTING_DECK: ReadonlyArray<{ cardId: string; count: number }> = [
  { cardId: 'am-001', count: 7 },
  { cardId: 'we-009', count: 1 },
  { cardId: 'we-004', count: 2 }
];

/**
 * The full card database for a game: Premier + promos (PREMIER_CARDS) plus the
 * Alliance expansion. Passed to `setup()` by both the server host and the
 * pass-and-play client so expansion cards are actually in play — without this,
 * Alliance piles silently resolve to nothing (setup skips unknown card ids).
 *
 * PREMIER_CARDS is deliberately listed FIRST: setup derives the starting deck
  * by matching card stats, and the first match wins, so the Premier Combat
  * Knife (we-004) must be found before the Alliance one (we-005), which shares
  * cost 50 / ammoReq 0 / damage 10. Telescopic Sight Rifle (we-019) is an
  * Alliance-exclusive rifle with a bottom-reveal mechanic.
 */
export const ALL_CARDS: ReadonlyArray<CardDef> = [...PREMIER_CARDS, ...ALLIANCE_CARDS];

export const MANSION_EXTRA_ITEM_IDS: readonly string[] = ['it-002'];

export const FIRST_TIMER_SCENARIO_ID = 'firstTimer';
