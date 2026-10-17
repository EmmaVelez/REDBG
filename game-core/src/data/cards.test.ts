import type { CardDef } from '../types';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STARTING_DECK, MANSION_EXTRA_ITEM_IDS, FIRST_TIMER_SCENARIO_ID } from './cards';

const byId = new Map(PREMIER_CARDS.map(c => [c.id, c]));
const card = (id: string): CardDef => {
  const c = byId.get(id);
  if (c === undefined) throw new Error('missing ' + id);
  return c;
};
const pile = (pileId: string): { pileId: string; cardIds: readonly string[] } => {
  const p = FIRST_TIMER_PILES.find(x => x.pileId === pileId);
  if (p === undefined) throw new Error('missing pile ' + pileId);
  return p;
};

test('database size and uniqueness', () => {
  expect(PREMIER_CARDS.length).toBe(62);
  const ids = PREMIER_CARDS.map(c => c.id);
  expect(new Set(ids).size).toBe(62);
});

test('all ids follow the printed numbering scheme', () => {
  for (const card of PREMIER_CARDS) {
    expect(card.id).toMatch(/^(we|am|ac|it|ch|ma|pr)-\d{3}$/);
  }
});

test('every card has required base fields', () => {
  for (const card of PREMIER_CARDS) {
    expect(['premier', 'promo']).toContain(card.set);
    expect(['character', 'weapon', 'ammunition', 'action', 'item', 'infected', 'token']).toContain(card.type);
    expect(card.copies).toBeGreaterThanOrEqual(1);
    expect(card.text).not.toBe('');
  }
});

test('character data', () => {
  expect(card('ch-008')).toEqual(expect.objectContaining({ maxHp: 120, level2At: 4 }));
  expect(card('ch-009')).toEqual(expect.objectContaining({ maxHp: 80, level2At: 8 }));
  expect(card('ch-001')).toEqual(expect.objectContaining({ maxHp: 100 }));
  expect(card('ch-002')).toEqual(expect.objectContaining({ maxHp: 80 }));

  for (const character of PREMIER_CARDS.filter(c => c.type === 'character')) {
    const levels = character.levels;
    const abilities = character.abilities;
    if (levels === undefined || abilities === undefined) throw new Error('missing levels/abilities: ' + character.id);
    expect(levels).toHaveLength(2);
    // Two abilities per level tier, except promo characters whose L2 packs
    // two effects (PR-001: damage reduction + extra Explore) = 3 entries.
    expect(abilities.length).toBeGreaterThanOrEqual(2);
    expect(levels[0]?.level).toBe(1);
    expect(levels[1]?.level).toBe(2);
  }
});

test('chris and jill machine abilities', () => {
  expect(card('ch-008').abilities).toEqual([{ kind: 'noHealingNoNonInfectedAttach', level: 1 }, { kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 2 }]);
  expect(card('ch-009').abilities).toEqual([{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }, { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }]);
});

test('ammunition data', () => {
  expect(card('am-001')).toEqual(expect.objectContaining({ cost: 0, copies: 28, bonuses: { ammo: 10, gold: 10 } }));
  expect(card('am-002')).toEqual(expect.objectContaining({ cost: 30, copies: 15 }));
  expect(card('am-003')).toEqual(expect.objectContaining({ cost: 60, copies: 15 }));
});

test('starting deck weapons', () => {
  expect(card('we-009')).toEqual(expect.objectContaining({ cost: 20, ammoReq: 20, damage: 10, copies: 9 }));
  expect(card('we-004')).toEqual(expect.objectContaining({ cost: 0, ammoReq: 0, damage: 5, copies: 11 }));
});

test('three confirmed weapon stats', () => {
  expect(card('we-006')).toEqual(expect.objectContaining({ cost: 90, ammoReq: 50, damage: 50, copies: 5 }));
  expect(card('we-010')).toEqual(expect.objectContaining({ cost: 60, ammoReq: 30, damage: 20, copies: 1 }));
  expect(card('we-016')).toEqual(expect.objectContaining({ cost: 90, ammoReq: 70, damage: 30, copies: 1 }));
});

test('weapon effects map to union kinds', () => {
  expect(card('we-014').weaponEffects).toEqual([{ kind: 'instantKillAtOrBelowHp', hp: 40 }, { kind: 'grantExplores', amount: 1 }]);
  expect(card('we-015').weaponEffects).toEqual([{ kind: 'revealTopOfInventoryCostGate', threshold: 40, amount: 30 }]);
  expect(card('we-012').weaponEffects).toEqual([{ kind: 'plusDamageIfAmmoAbove', threshold: 100, amount: 30 }]);
  expect(card('we-007').weaponEffects).toEqual([{ kind: 'damageEqualsCurrentAmmo' }]);
  expect(card('we-010').weaponEffects).toEqual([{ kind: 'plusDamagePerExtraWeapon', amount: 20 }]);
});

test('token weapons are not for sale', () => {
  expect(card('we-007')).not.toHaveProperty('cost');
  expect(card('we-008')).not.toHaveProperty('cost');
  for (const pile of FIRST_TIMER_PILES) {
    expect(pile.cardIds).not.toContain('we-007');
    expect(pile.cardIds).not.toContain('we-008');
  }
});

test('uroboros is the endgame boss', () => {
  expect(card('ma-010')).toEqual(expect.objectContaining({ hp: 90, attack: 70, decorations: 8, copies: 1 }));
  expect(card('ma-010').infectedEffects).toEqual([{ kind: 'shuffleBackIfNotDefeated' }]);
});

test('confirmed infected stats', () => {
  expect(card('ma-002')).toEqual(expect.objectContaining({ hp: 20, attack: 10, decorations: 1 }));
  expect(card('ma-003')).toEqual(expect.objectContaining({ hp: 15, attack: 10, decorations: 1, infectedEffects: [{ kind: 'noActionsNextTurnOfAPlayerOnDefeat' }] }));
  expect(card('ma-005')).toEqual(expect.objectContaining({ hp: 10, attack: 10, decorations: 1 }));
  expect(card('ma-006')).toEqual(expect.objectContaining({ hp: 40, attack: 30, decorations: 3 }));
  expect(card('ma-015')).toEqual(expect.objectContaining({ hp: 25, attack: 10, decorations: 2 }));
  expect(card('ma-017')).toEqual(expect.objectContaining({ hp: 30, attack: 25, decorations: 3, infectedEffects: [{ kind: 'skipNextTurnOfAPlayerOnDefeat' }] }));
});

test('gatling gun majini effect', () => {
  expect(card('ma-014').infectedEffects).toEqual([{ kind: 'plusDamagePerFull10AmmoOfAttacker', amount: 5 }]);
});

test('yellow herb is mansion-only', () => {
  expect(card('it-002')).toEqual(expect.objectContaining({ copies: 3, itemEffects: [{ kind: 'plusMaxHp20' }] }));
  expect(card('it-001')).toEqual(expect.objectContaining({ cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] }));
  expect(card('it-003')).toEqual(expect.objectContaining({ cost: 60, itemEffects: [{ kind: 'healToFull' }] }));
});

test('key action cards', () => {
  expect(card('ac-002')).toEqual(expect.objectContaining({ cost: 50, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] }));
  expect(card('ac-006')).toEqual(expect.objectContaining({ cost: 50, bonuses: { buys: 1, cards: 1, gold: 20 } }));
  expect(card('ac-005').actionEffects).toEqual([{ kind: 'recoverWeaponFromDiscardToHand' }]);
});

test('tokens grant the right weapons', () => {
  expect(card('ma-012').tokenEffects).toEqual([{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-008' }]);
  expect(card('ma-013').tokenEffects).toEqual([{ kind: 'gainWeaponAndTrashToken', weaponCardId: 'we-007' }]);
});

test('eighteen piles', () => {
  expect(FIRST_TIMER_PILES.length).toBe(18);
  const pileIds = FIRST_TIMER_PILES.map(p => p.pileId);
  expect(new Set(pileIds).size).toBe(18);
  for (const pile of FIRST_TIMER_PILES) {
    for (const cardId of pile.cardIds) {
      if (byId.get(cardId) === undefined) {
        throw new Error('missing ' + cardId);
      }
    }
  }
});

test('combined piles are the documented pairs', () => {
  expect([...pile('hg').cardIds].sort()).toEqual(['we-009', 'we-010'].sort());
  expect([...pile('kn').cardIds].sort()).toEqual(['we-004', 'we-005'].sort());
  expect([...pile('sh').cardIds].sort()).toEqual(['we-013', 'we-014'].sort());
  expect([...pile('rf').cardIds].sort()).toEqual(['we-015', 'we-016'].sort());
  expect([...pile('mg').cardIds].sort()).toEqual(['we-011', 'we-012'].sort());
});

test('single-card piles', () => {
  expect(pile('am10').cardIds).toEqual(['am-001']);
  expect(pile('am20').cardIds).toEqual(['am-002']);
  expect(pile('am30').cardIds).toEqual(['am-003']);
  expect(pile('herb').cardIds).toEqual(['it-001']);
  expect(pile('umb').cardIds).toEqual(['ac-007']);
  expect(pile('foyer').cardIds).toEqual(['ac-001']);
  expect(pile('escape').cardIds).toEqual(['ac-004']);
  expect(pile('aim').cardIds).toEqual(['ac-002']);
  expect(pile('smt').cardIds).toEqual(['ac-003']);
  expect(pile('merc').cardIds).toEqual(['ac-006']);
  expect(pile('reload').cardIds).toEqual(['ac-005']);
  expect(pile('grn').cardIds).toEqual(['we-001']);
  expect(pile('six').cardIds).toEqual(['we-006']);
});

test('market excludes mansion-only and off-scenario cards', () => {
  const marketCardIds = FIRST_TIMER_PILES.flatMap(p => p.cardIds);
  const excludedCardIds = ['we-002', 'we-003', 'we-007', 'we-008', 'ac-008', 'ac-009', 'ac-010', 'ac-011', 'ac-012', 'it-002', 'it-003'];
  for (const cardId of excludedCardIds) {
    expect(marketCardIds).not.toContain(cardId);
  }
});

test('mansion population', () => {
  const infectedCopies = PREMIER_CARDS.filter(c => c.type === 'infected').reduce((sum, c) => sum + c.copies, 0);
  const tokenCopies = PREMIER_CARDS.filter(c => c.type === 'token').reduce((sum, c) => sum + c.copies, 0);
  expect(infectedCopies).toBe(33);
  expect(tokenCopies).toBe(2);
  expect(MANSION_EXTRA_ITEM_IDS).toEqual(['it-002']);
  const yellowHerbCopies = card('it-002').copies;
  expect(yellowHerbCopies).toBe(3);
  expect(infectedCopies + tokenCopies + yellowHerbCopies).toBe(38);
});

test('starting deck matches the rulebook', () => {
  expect(STARTING_DECK).toEqual([{ cardId: 'am-001', count: 7 }, { cardId: 'we-009', count: 1 }, { cardId: 'we-004', count: 2 }]);
  for (const { cardId } of STARTING_DECK) {
    const c = byId.get(cardId);
    if (c === undefined) {
      throw new Error('missing ' + cardId);
    }
    expect(c.copies).toBeGreaterThanOrEqual(STARTING_DECK.find(d => d.cardId === cardId)!.count);
  }
});

test('weapon tags for character synergies', () => {
  expect(card('we-001').weaponTags).toEqual(expect.arrayContaining(['explosive']));
  expect(card('we-008').weaponTags).toEqual(expect.arrayContaining(['explosive']));
});
