import type { CardDef } from '../types';

/**
 * Custom card line — fan-designed cards that are NOT part of any official set.
 *
 * These are reachable ONLY when a room enables the Custom Cards option: the
 * server appends the selected ids via `cardsForScenario(id, { customCards })`
 * and `setup()` always adds every custom mansion card it finds in that list to
 * the Mansion deck. They are deliberately NOT part of `ALL_CARDS`, so the
 * toggle is the single switch that brings them into a game.
 *
 * Ids use their own prefix to avoid colliding with the official printed
 * numbering (MA-025 is already Alliance's Duvalia; `cc-` is a fan-printed code).
 */
export const CUSTOM_CARDS: ReadonlyArray<CardDef> = [
  {
    id: 'mx-001',
    name: 'Mr. X',
    type: 'infected',
    set: 'custom',
    text: 'If this infected is not defeated, place it on top of the mansion as the 5th upcoming card.',
    copies: 2,
    hp: 60,
    attack: 30,
    decorations: 5,
    infectedEffects: [{ kind: 'onNotDefeatedInsertIntoMansionAt', position: 5 }],
  },
  {
    id: 'cu-001',
    name: 'Ricardo Irving',
    type: 'character',
    set: 'custom',
    text: 'Level 1: During your turn, you can Reveal the top card of your Inventory. If it is an Action, move it to your hand.\nLevel 2: When Ricardo would take more than 30 Damage, you can lower that Damage by 10. In that case, give 10 Damage to any Character.',
    copies: 1,
    maxHp: 80,
    level1At: 3,
    level2At: 8,
    levels: [
      { level: 1, text: 'During your turn, you can Reveal the top card of your Inventory. If it is an Action, move it to your hand.' },
      { level: 2, text: 'When Ricardo would take more than 30 Damage, you can lower that Damage by 10. In that case, give 10 Damage to any Character.' },
    ],
    abilities: [
      { kind: 'revealInventoryTopForAction', level: 1 },
      { kind: 'damageReductionAndGiveDamage', threshold: 30, reduction: 10, give: 10, level: 2 },
    ],
  },
  {
    id: 'ci-002',
    name: 'Infected Crow',
    type: 'infected',
    set: 'custom',
    text: 'When this Infected is Revealed, Reveal the next card of the Mansion. If it\'s an Infected the Exploring Character(s) is now Battling that as well. Otherwise shuffle that card into the Mansion.',
    copies: 5,
    hp: 20,
    attack: 10,
    decorations: 2,
    infectedEffects: [{ kind: 'onRevealRevealNextMansionCard' }],
  },

  {
    id: 'ev-001',
    name: 'Zombie Grab',
    type: 'event',
    set: 'custom',
    text: 'Trash a weapon from your hand or discard pile; otherwise, take 20 damage, then shuffle this card into the mansion.',
    copies: 1,
  },
  {
    id: 'fch-008',
    name: 'Sherry Birkin',
    type: 'character',
    set: 'custom',
    text: 'Sherry cannot use Weapons. Once per turn Sherry can force another Player to Explore with her. Sherry\'s hand and Sherry\'s Items this turn can assist that Player. Defeated Infected are awarded to Sherry. Any Damage is split evenly between both Characters. The Exploring Player draws a new Hand after.',
    copies: 1,
    maxHp: 50,
    level1At: 0,
    levels: [
      { level: 1, text: 'Sherry cannot use Weapons. Once per turn Sherry can force another Player to Explore with her. Sherry\'s hand and Sherry\'s Items this turn can assist that Player. Defeated Infected are awarded to Sherry. Any Damage is split evenly between both Characters. The Exploring Player draws a new Hand after.' },
    ],
    abilities: [
      { kind: 'cannotUseWeapons', level: 1 },
      { kind: 'forceAllyExploreWithSupport', level: 1 },
    ],
  },
  {
    id: 'lk-001',
    name: 'Leon S. Kennedy',
    type: 'character',
    set: 'custom',
    text: 'Level 1: While Leon is using 2 or more pistols, Leon does an additional 5 damage for each pistol.\\nLevel 2: All cards in your play area are also labeled as pistol.',
    copies: 1,
    maxHp: 90,
    level1At: 1,
    level2At: 8,
    levels: [
      { level: 1, text: 'While Leon is using 2 or more pistols, Leon does an additional 5 damage for each pistol.' },
      { level: 2, text: 'All cards in your play area are also labeled as pistol.' },
    ],
    abilities: [
      { kind: 'plusDamagePerPistolUsed', amount: 5, threshold: 2, level: 1 },
      { kind: 'playAreaCardsArePistols', level: 2 },
    ],
  },
  {
    id: 'cr-001',
    name: 'Claire Redfield',
    type: 'character',
    set: 'custom',
    text: 'Level 1: You get +1 Buy.\\nLevel 2: At the start of your turn, you can get +2 Actions and -2 Buy.',
    copies: 1,
    maxHp: 70,
    level1At: 0,
    level2At: 7,
    levels: [
      { level: 1, text: 'You get +1 Buy.' },
      { level: 2, text: 'At the start of your turn, you can get +2 Actions and -2 Buy.' },
    ],
    abilities: [
      { kind: 'plusBuyPassive', amount: 1, level: 1 },
      { kind: 'turnStartActionsForBuy', actions: 2, buy: 2, level: 2 },
    ],
  },
  {
    id: 'cc-001',
    name: 'Claire Redfield',
    type: 'character',
    set: 'custom',
    text: 'Level 1: Your \\"Shotgun\\" Weapons have -10 Ammo Requirement.\\nLevel 2: When you Defeat an Infected with a \\"Shotgun\\" Weapon Heal 5 Health.',
    copies: 1,
    maxHp: 90,
    level1At: 2,
    level2At: 5,
    levels: [
      { level: 1, text: 'Your \\"Shotgun\\" Weapons have -10 Ammo Requirement.' },
      { level: 2, text: 'When you Defeat an Infected with a \\"Shotgun\\" Weapon Heal 5 Health.' },
    ],
    abilities: [
      { kind: 'ammoReqReduction', tag: 'shotgun', amount: 10, level: 1 },
      { kind: 'healOnDefeatWithWeaponTag', tag: 'shotgun', heal: 5, level: 2 },
    ],
  },
];
