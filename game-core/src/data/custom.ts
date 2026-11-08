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
 * Ids use the `mx-` prefix to avoid colliding with the official MA- printed
 * numbering (MA-025 is already Alliance's Duvalia).
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
];
