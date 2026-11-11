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
    id: 'nyx-001',
    name: 'NYX',
    type: 'infected',
    set: 'custom',
    text: 'When this infected is revealed, all non-exploring characters take 40 damage.',
    copies: 1,
    hp: 80,
    attack: 60,
    decorations: 7,
    infectedEffects: [{ kind: 'onRevealFlatDamageToNonExploringCharacters', amount: 40 }],
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
    // Fan card (Bandai print, no card number on the card). Manny's ruling
    // (2026-11-10): "the exploring character must explore again" = +1 Explore
    // and a must-explore obligation, and "this turn, all infected gain" is a
    // turn-long buff (it also covers the forced second explore).
    id: 'ev-002',
    name: 'Nemesis Pursuit',
    type: 'event',
    set: 'custom',
    text: 'When this event is revealed, the exploring character must explore again. This turn, all infected gain +10 health and +20 damage. Remove this event from the game afterwards.',
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
    id: 'cv-001',
    name: 'Cover-up',
    type: 'action',
    set: 'custom',
    text: 'You may Trash this card from your hand at the beginning of any Player\'s turn. In that case, look at the top Card of the Mansion. You may move it to the bottom of the Mansion.',
    copies: 5,
    cost: 60,
    bonuses: { actions: 1, cards: 1 },
    actionEffects: [{ kind: 'trashFromHandAtTurnStartPeekMansionTop' }],
  },
  {
    id: 'bc-001',
    name: 'Billy Coen',
    type: 'character',
    set: 'custom',
    text: 'Level 1: \\"Melee\\" weapons cost 10 gold less in your turn.\\nLevel 2: All your \\"melee\\" weapons get +10 damage.',
    copies: 1,
    maxHp: 70,
    level1At: 2,
    level2At: 5,
    levels: [
      { level: 1, text: '\\"Melee\\" weapons cost 10 gold less in your turn.' },
      { level: 2, text: 'All your \\"melee\\" weapons get +10 damage.' },
    ],
    abilities: [
      { kind: 'weaponBuyCostReduction', tag: 'melee', amount: 10, level: 1 },
      { kind: 'weaponTagPlusDamage', tag: 'melee', amount: 10, level: 2 },
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
  {
    id: 'rc-001',
    name: 'Rebecca Chambers',
    type: 'character',
    set: 'custom',
    text: 'Level 1: At the beginning of your turn, you can get +1 card, and if you do, discard a card.\nLevel 2: When you discard a card because of a card effect during your turn, you gain +20 gold.',
    copies: 1,
    maxHp: 70,
    level1At: 2,
    level2At: 7,
    levels: [
      { level: 1, text: 'At the beginning of your turn, you can get +1 card, and if you do, discard a card.' },
      { level: 2, text: 'When you discard a card because of a card effect during your turn, you gain +20 gold.' },
    ],
    abilities: [
      { kind: 'turnStartDrawThenDiscardCard', level: 1 },
      { kind: 'goldWhenDiscardingAtTurnStart', amount: 20, level: 2 },
    ],
  },
  {
    // Fan card (printed code CH-001, which is already Albert Wesker in the
    // Premier set, so the id uses Jake's initials like cu-001 / lk-001).
    id: 'jm-001',
    name: 'Jake Muller',
    type: 'character',
    set: 'custom',
    text: 'Level 1: When Jake takes more than 30 Damage, Trash the top 2 cards from your Discard Pile.\nLevel 2: Every Infected with more than 40 Health that Jake defeats gets +1 Decoration.',
    copies: 1,
    maxHp: 100,
    level1At: 0,
    level2At: 7,
    levels: [
      { level: 1, text: 'When Jake takes more than 30 Damage, Trash the top 2 cards from your Discard Pile.' },
      { level: 2, text: 'Every Infected with more than 40 Health that Jake defeats gets +1 Decoration.' },
    ],
    abilities: [
      { kind: 'trashTopFromDiscardOnBigHit', threshold: 30, count: 2, level: 1 },
      { kind: 'plusDecorationOnDefeatHighHp', threshold: 40, amount: 1, level: 2 },
    ],
  },

  // --- Unofficial Expansion 1 (EX-001..EX-009) ---
  // Manny's rulings (2026-11-09):
  // - [STORAGE] and [BOX] cards are MANSION TOKENS (like ma-012/ma-013).
  // - EX-002: "when gained attach it to your character. the next time an
  //   infected with 80 or more health is revealed while exploring, defeat it
  //   immediately and remove this card from the game" (the printed text was
  //   wrong; the 80 threshold is the INFECTED's Health, not the Character's).
  // - EX-005 grants +50 Ammo AND +50 Gold (two bonus icons).
  // - EX-007 returns to its OWN market pile and can be bought again.
  // - EX-009 is a new 'counter' type kept in a shared board supply; it returns
  //   there when the attached Character dies.
  {
    id: 'ex-001',
    name: 'Special Rocket Launcher Case',
    type: 'token',
    set: 'custom',
    text: 'Gain 1 "Special Rocket Launcher." Remove this card from the game afterward.',
    copies: 1,
    tokenEffects: [{ kind: 'gainCardAndRemoveToken', cardId: 'ex-002' }],
  },
  {
    id: 'ex-002',
    name: 'Special Rocket Launcher',
    type: 'weapon',
    set: 'custom',
    text: 'When gained, attach this weapon to your Character. The next time an Infected with 80 or more Health is Revealed while Exploring, defeat it immediately and remove this card from the game.',
    copies: 1,
    cost: 130,
    ammoReq: 0,
    damage: 0,
    weaponTags: ['explosive'],
    weaponEffects: [{ kind: 'attachOnGainDefeatInfectedAtOrAboveHp', hp: 80 }],
  },
  {
    id: 'ex-003',
    name: 'Weapon Case',
    type: 'token',
    set: 'custom',
    text: 'Gain any weapon from the "Resource Area". Remove this card from the game afterward.',
    copies: 1,
    tokenEffects: [{ kind: 'gainAnyWeaponAndRemoveToken' }],
  },
  {
    id: 'ex-004',
    name: 'Ammunition Box',
    type: 'token',
    set: 'custom',
    text: 'Gain 1 "Ammo x50" card. Remove this card from the game afterward.',
    copies: 1,
    tokenEffects: [{ kind: 'gainCardAndRemoveToken', cardId: 'ex-005' }],
  },
  {
    id: 'ex-005',
    name: 'Ammo x50',
    type: 'ammunition',
    set: 'custom',
    text: '+50 Ammo. +50 Gold.',
    copies: 1,
    cost: 90,
    bonuses: { ammo: 50, gold: 50 },
  },
  {
    id: 'ex-006',
    name: 'Web Spinner',
    type: 'infected',
    set: 'custom',
    text: 'If this "Infected" is not defeated, attach a "Poison" counter to the Character who initiated the Exploration.',
    copies: 2,
    hp: 35,
    attack: 10,
    decorations: 3,
    infectedEffects: [{ kind: 'onNotDefeatedAttachCounter', counterCardId: 'ex-009' }],
  },
  {
    id: 'ex-007',
    name: 'Blue Herb',
    type: 'item',
    set: 'custom',
    text: 'Return this Blue Herb to the "Resource Area" and remove all Poison counters from all your Characters.',
    // The Poison bundle stacks FIVE Blue Herbs in the Resource Area (Manny's
    // ruling): the counter is meant to be a recurring cure, not a one-shot.
    copies: 5,
    cost: 20,
    itemEffects: [{ kind: 'returnToMarketAndRemoveCounters' }],
  },
  {
    id: 'ex-008',
    name: 'Yawn',
    type: 'infected',
    set: 'custom',
    text: 'If this "Infected" is not defeated, attach a "Poison" counter to the Character who initiated the Exploration.',
    copies: 2,
    hp: 50,
    attack: 20,
    decorations: 5,
    infectedEffects: [{ kind: 'onNotDefeatedAttachCounter', counterCardId: 'ex-009' }],
  },
  {
    id: 'ex-009',
    name: 'Poison',
    type: 'counter',
    set: 'custom',
    text: 'A maximum of one "Poison" counter may be attached to a Character.\nWhile this card is attached to a Character, that Character takes 5 damage at the beginning of each turn.\nIf the Character dies, return this card to the "Resource Area".',
    copies: 1,
    cost: 0,
    counterEffects: [{ kind: 'damageAtTurnStart', amount: 5 }],
  },
  // ── Fan ammunition cards (from trading-card prints) ────────────────
  {
    id: 'ca-001',
    name: 'Ammo x40',
    type: 'ammunition',
    set: 'custom',
    text: 'Grants +40 Ammo and +40 Gold for the turn.',
    copies: 15,
    cost: 90,
    bonuses: { ammo: 40, gold: 40 },
  },
  {
    id: 'ca-002',
    name: 'Ammunition Box',
    type: 'ammunition',
    set: 'custom',
    text: 'Grants +40 Ammo for the turn.',
    copies: 15,
    cost: 40,
    bonuses: { ammo: 40 },
  },
  // ── Mansion attachment event cards ────────────────────────────────
  {
    id: 'ce-001',
    name: 'Rampage',
    type: 'event',
    set: 'custom',
    text: 'At the end of a player\'s turn, trash the top card in their inventory. When 6 cards have been trashed by this effect, remove this card.',
    copies: 1,
    attachmentMode: 1,
    attachmentEffects: [{ kind: 'trashTopInventoryAtTurnEnd', count: 1, removeAfter: 6 }],
  },
];
