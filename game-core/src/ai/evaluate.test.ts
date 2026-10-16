
import { evaluateState } from './evaluate';
import type { GameState, CardDef, PlayerState } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'generic', level: 2 }] }),
  'am-1': def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  'we-1': def('we-1', { type: 'weapon', cost: 20, ammoReq: 20, damage: 10 }),
  'we-2': def('we-2', { type: 'weapon', cost: 5, ammoReq: 0, damage: 8 }),
  'ac-1': def('ac-1', { type: 'action', cost: 20, bonuses: { gold: 10 } }),
  'it-1': def('it-1', { type: 'item', itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] }),
  'ma-1': def('ma-1', { type: 'infected', hp: 20, attack: 10, decorations: 1 }),
};

function player(seat: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat, name: 'P' + seat, controller: 'human',
    characterInstanceId: 'ch-1#' + seat, hp: 100, maxHp: 100,
    decorations: 0, level: 1 as const,
    turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'],
    hand: [], discard: [], playArea: [], downed: false, dead: false,
    ...over,
  };
}

function baseState(over: Partial<GameState> = {}): GameState {
  const s: GameState = {
    version: 1, seed: 1, rngState: 1, phase: 'main', activeSeat: 0, turnNumber: 1,
    seats: [player(0), player(1)],
    marketPiles: {
      hg: { pileId: 'hg', cards: ['we-1#1'] },
      kn: { pileId: 'kn', cards: ['we-2#1'] },
    },
    mansionDeck: ['ma-1#1', 'ma-1#2'], mansionBottom: [], removed: [],
    cards: Object.fromEntries(['ch-1#0', 'ch-1#1', 'am-1#1', 'we-1#1', 'we-2#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } }])),
    cardDefs: DEFS,
    prompts: [], winners: [], endReason: undefined, log: [],
    ...over,
  };
  return s;
}

/** Builds a cards map containing the base instances plus the given extra ones. */
function cardsWith(...extraIds: readonly string[]): Record<string, { instanceId: string; cardId: string; location: { zone: 'hand'; index: number } }> {
  const base = baseState().cards as Record<string, { instanceId: string; cardId: string; location: { zone: 'hand'; index: number } }>;
  const out = { ...base };
  for (const id of extraIds) {
    out[id] = { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } };
  }
  return out;
}

describe('evaluateState', () => {
  // 1. 'baseline score'
  test('baseline score', () => {
    expect(evaluateState(baseState(), 0)).toBe(106);
  });

  // 2. 'baseline is symmetric for both seats'
  test('baseline is symmetric for both seats', () => {
    expect(evaluateState(baseState(), 0)).toBe(evaluateState(baseState(), 1));
    expect(evaluateState(baseState(), 0)).toBe(106);
  });

  // 3. 'dead player scores catastrophically low'
  test('dead player scores catastrophically low', () => {
    const s = baseState({ seats: [player(0, { dead: true }), player(1)] });
    expect(evaluateState(s, 0)).toBe(-10000);
  });

  // 4. 'downed is bad but better than dead'
  test('downed is bad but better than dead', () => {
    const s = baseState({ seats: [player(0, { downed: true, hp: 0 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(-3994);
  });

  // 5. 'level 2 is worth 200'
  test('level 2 is worth 200', () => {
    const s = baseState({ seats: [player(0, { level: 2 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(306);
  });

  // 6. 'decorations are worth 50 each'
  test('decorations are worth 50 each', () => {
    const s = baseState({ seats: [player(0, { decorations: 4 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(306);
  });

  // 7. 'gold and ammo pools add value'
    test('gold and ammo pools add value', () => {
      const s = baseState({ seats: [player(0, { turnGold: 50, turnAmmo: 10 }), player(1)] });
      // Derivation: 136 + 50*1 (gold is transient: 1/point) + 10*3 + 20 (affordable:
      // BOTH piles cost <= 50 -> 2 piles * 10 potential) = 136 + 50 + 30 + 20 = 236.
      expect(evaluateState(s, 0)).toBe(206);
    });

    // 8. 'hand cards count by type'
      test('hand cards count by type', () => {
        const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'ac-1#1', 'it-1#1'] }), player(1)] });
        // 136 + am-1 held (yield 8+30+10=48, HALVED 24) + we-1 (dmg 10 -> 12)
        // + ac-1 held (gold 10 -> 5) + it-1 (5) = 136+24+12+5+5 = 182.
        expect(evaluateState(s, 0)).toBe(152);
      });

  // 9. 'attached infected trophies are valuable'
  test('attached infected trophies are valuable', () => {
    const s = baseState({ seats: [player(0, { attached: ['ma-1#1', 'ma-1#2'] }), player(1)] });
    expect(evaluateState(s, 0)).toBe(156);
  });

  // 10. 'eliminated opponents are rewarded'
  test('eliminated opponents are rewarded', () => {
    const s = baseState({ seats: [player(0), player(1, { dead: true })] });
    expect(evaluateState(s, 0)).toBe(406);
  });

  // 11. 'downed opponents are a smaller reward'
    test('downed opponents are a smaller reward', () => {
      const s = baseState({ seats: [player(0), player(1, { downed: true, hp: 0 })] });
      // baseline 136 already includes -100 for opponent hp 100; with hp 0 the
      // opponent-hp term is 0 (refund 100), then +150 for downed: 136+100+150
      expect(evaluateState(s, 0)).toBe(356);
    });

  // 12. 'decorated opponents are threatening'
  test('decorated opponents are threatening', () => {
    const s = baseState({ seats: [player(0), player(1, { decorations: 5 })] });
    expect(evaluateState(s, 0)).toBe(6);
  });

  // 13. 'unknown seat is the floor'
  test('unknown seat is the floor', () => {
    expect(evaluateState(baseState(), 99)).toBe(-100000);
  });

  // 14. 'deterministic'
  test('deterministic', () => {
    const s = baseState({ seats: [player(0, { turnGold: 30, hand: ['am-1#1'] }), player(1)] });
    const score1 = evaluateState(s, 0);
    const score2 = evaluateState(s, 0);
    expect(score1).toBe(score2);
  });

  // 15. 'no NaN for a normal setup'
    test('no NaN for a normal setup', () => {
      const s = baseState();
      expect(Number.isFinite(evaluateState(s, 0))).toBe(true);
      expect(Number.isFinite(evaluateState(s, 1))).toBe(true);
    });

    // 16. 'character ability: Leon pistol affinity raises handgun value in hand'
    test('character ability: Leon pistol affinity raises handgun value in hand', () => {
      const s = baseState({
        seats: [
          // ch-002 = Leon with weaponTagBonus pistol 10 at level 1
          player(0, { characterInstanceId: 'ch-002#0', hand: ['we-9#1'] }),
          player(1),
        ],
        cards: Object.fromEntries(
          ['ch-002#0', 'ch-1#1', 'am-1#1', 'we-9#1', 'we-2#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [
            id,
            { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
          ]),
        ),
        cardDefs: {
          ...DEFS,
          'ch-002': def('ch-002', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponTagBonus', tag: 'pistol', amount: 10, level: 1 }, { kind: 'weaponTagBonus', tag: 'pistol', amount: 20, level: 2 }] }),
          'we-9': def('we-9', { type: 'weapon', cost: 20, ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'] as const }),
        },
      });
      // Without any affinity this hand would score 136 + 12 (we-9 dmg 10 -> 10 + 10/5) = 148;
      // Leon's pistol bonus 10 makes the handgun worth 22 -> 158.
      expect(evaluateState(s, 0)).toBe(128);
    });

    // 17. 'character ability: non-matching weapon tag gets no bonus'
    test('character ability: non-matching weapon tag gets no bonus', () => {
      const s = baseState({
        seats: [player(0, { characterInstanceId: 'ch-002#0', hand: ['we-2#1'] }), player(1)],
        cards: Object.fromEntries(
          ['ch-002#0', 'ch-1#1', 'we-2#1', 'ma-1#1', 'ma-1#2'].map(id => [
            id,
            { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
          ]),
        ),
        cardDefs: {
          ...DEFS,
          'ch-002': def('ch-002', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponTagBonus', tag: 'pistol', amount: 10, level: 1 }, { kind: 'weaponTagBonus', tag: 'pistol', amount: 20, level: 2 }] }),
        },
      });
      // we-2 (damage 8, NO pistol tag): 136 + (10 + 8/5=1 -> 11) = 147. No affinity bonus.
      expect(evaluateState(s, 0)).toBe(117);
    });

    // 18. 'character ability: back-off amount to unlock at level 2'
    test('character ability: level-gated affinity only at the unlocked level', () => {
      const s = baseState({
        seats: [
          // Barry ch-005: weaponTagBonus magnum 20 only at level 2 — at level 1 no bonus
          player(0, { characterInstanceId: 'ch-005#0', level: 1 as const, hand: ['we-6#1'] }),
          player(1),
        ],
        cards: Object.fromEntries(
          ['ch-005#0', 'ch-1#1', 'we-6#1', 'ma-1#1', 'ma-1#2'].map(id => [
            id,
            { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
          ]),
        ),
        cardDefs: {
          ...DEFS,
          'ch-005': def('ch-005', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'weaponTagBonus', tag: 'magnum', amount: 20, level: 2 }] }),
          'we-6': def('we-6', { type: 'weapon', cost: 90, ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'] as const }),
        },
      });
      // magnum damage 50 -> 10 + 10 = 20 base. Barry is level 1, magnum bonus is L2: no affinity.
            // 136 + 20 = 156.
            expect(evaluateState(s, 0)).toBe(126);

            // At level 2 the same hand gets the +200 level bonus AND +20 magnum affinity:
            // 156 + 200 + 20 = 376.
            const s2 = { ...s, seats: s.seats.map((x, i) => (i === 0 ? { ...x, level: 2 as const } : x)) };
            expect(evaluateState(s2, 0)).toBe(346);
    });

    // 19. 'character ability: Claire ammo bonus values ammo cards higher'
    test('character ability: Claire ammo bonus values ammo cards higher', () => {
      const s = baseState({
        seats: [player(0, { characterInstanceId: 'ch-003#0', hand: ['am-1#1'] }), player(1)],
        cards: Object.fromEntries(
          ['ch-003#0', 'ch-1#1', 'am-1#1', 'ma-1#1', 'ma-1#2'].map(id => [
            id,
            { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
          ]),
        ),
        cardDefs: {
          ...DEFS,
          'ch-003': def('ch-003', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'ammunitionBonus', ammoAmount: 10, goldAmount: 0, level: 1 }, { kind: 'ammunitionBonus', ammoAmount: 0, goldAmount: 10, level: 2 }] }),
        },
      });
      // Claire L1: ammo cards gain +10 ammo * 3 = +30 on top of held ammo value.
            // am-1 yield 48 -> held 24; +30 = 54; 136 + 54 = 190.
            expect(evaluateState(s, 0)).toBe(160);
    });

    // 20. 'character ability: Wesker explore gold bonus values explores higher'
    test('character ability: Wesker explore gold bonus values explores higher', () => {
      const s = baseState({
        seats: [player(0, { characterInstanceId: 'ch-001#0', exploresLeft: 1 }), player(1)],
        cards: Object.fromEntries(
          ['ch-001#0', 'ch-1#1', 'am-1#1', 'we-1#1', 'we-2#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [
            id,
            { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } },
          ]),
        ),
        cardDefs: {
          ...DEFS,
          'ch-001': def('ch-001', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'exploreGoldBonus', amount: 20, level: 1 }, { kind: 'generic', level: 2 }] }),
        },
      });
      // Baseline 136 already includes the exploresLeft term (40). Wesker's
            // exploreGoldBonus adds +20 gold per explore at 1/gold = +20: 136 + 20 = 156.
            expect(evaluateState(s, 0)).toBe(126);
    });

    // 21. 'discarded weapons keep their value (bought cards are real assets)'
      test('discarded weapons keep their value (bought cards are real assets)', () => {
        const s = baseState({ seats: [player(0, { discard: ['we-1#1'] }), player(1)] });
        // we-1 damage 10 -> 12 = 136 + 12 = 148.
        expect(evaluateState(s, 0)).toBe(118);
      });

      // 22. 'action cards are worth their text value when owned (buy incentive)'
            test('action cards are worth their text value when owned (buy incentive)', () => {
              const s = baseState({
                seats: [player(0, { discard: ['ac-4#1'] }), player(1)],
                cards: cardsWith('ac-4#1'),
                cardDefs: {
                  ...DEFS,
                  'ac-4': def('ac-4', { type: 'action', cost: 70, bonuses: { cards: 1, actions: 2 } }),
                },
              });
              // ac-4: +1 card (12) + 2 actions (80) = 92 text value. Owned in discard:
              // 136 + 92 = 228.
              expect(evaluateState(s, 0)).toBe(198);
            });

            // 23. 'action cards are held at half text value (one action per turn)'
            test('action cards are held at half text value (one action per turn)', () => {
              const s = baseState({
                seats: [player(0, { hand: ['ac-4#1'] }), player(1)],
                cards: cardsWith('ac-4#1'),
                cardDefs: {
                  ...DEFS,
                  'ac-4': def('ac-4', { type: 'action', cost: 70, bonuses: { cards: 1, actions: 2 } }),
                },
              });
              // Held: 92 * 0.5 = 46 -> 136 + 46 = 182.
              expect(evaluateState(s, 0)).toBe(152);
            });

            // 24. 'ammo cards are worth their yield when owned (fallback buy incentive)'
            test('ammo cards are worth their yield when owned (fallback buy incentive)', () => {
              const s = baseState({
                seats: [player(0, { discard: ['am-2#1'] }), player(1)],
                cards: cardsWith('am-2#1'),
                cardDefs: {
                  ...DEFS,
                  'am-2': def('am-2', { type: 'ammunition', cost: 30, bonuses: { ammo: 20, gold: 20 } }),
                },
              });
              // am-2: 8 + 20 ammo*3 + 20 gold = 8 + 60 + 20 = 88. Owned: 136 + 88 = 224.
              expect(evaluateState(s, 0)).toBe(194);
            });

            // 25. 'deck bloat: trash effects gain value past the threshold'
            test('deck bloat: trash effects gain value past the threshold', () => {
              const junkWe2: string[] = [];
              for (let i = 1; i <= 30; i++) junkWe2.push(`we-2#${i}`);
              const ac3Def = def('ac-3', { type: 'action', cost: 20, actionEffects: [{ kind: 'trashUpToTwoFromDiscard' }] });

              const smallDeck = baseState({
                seats: [player(0, { discard: ['ac-3#1'] }), player(1)],
                cards: cardsWith('ac-3#1'),
                cardDefs: { ...DEFS, 'ac-3': ac3Def },
              });
              // trashUpToTwoFromDiscard credit 6; owned 136 + 6 = 142 (deck 1 < threshold).
              expect(evaluateState(smallDeck, 0)).toBe(112);

              // Bloat 1 (deck 14 inventory + 1 discard = 15 -> bloat 0... push over):
              // 18 inventory junk we-2 cards + 1 discard ac-3 = 19 -> bloat 1. Owned
              // trash action gains +min(1*4,24) = +4 -> 146. Junk we-2 (value 11 < 12)
              // in inventory are penalized min(1,6)*4 = 4 each: 3 of the 8 inventory
              // slots... use 18 inventory cards -> 18 junk * 4 = 72 penalty.
              const fat = baseState({
                seats: [player(0, {
                  discard: ['ac-3#1'],
                  inventory: junkWe2.slice(0, 18),
                }), player(1)],
                cards: cardsWith('ac-3#1', ...junkWe2.slice(0, 18)),
                cardDefs: { ...DEFS, 'ac-3': ac3Def },
              });
              // baseline 136 + inventory credit 18*2=36 (was 8*2=16 -> +20 net)
              // + ac-3 owned 6 + bloat 4 + 18 junk * -4... wait: inventory credit and
              // junk both apply. Start from the clean numbers: 136 - 16 (old inv credit)
              // + 36 (new) + 10 (ac-3) - 72 (18 junk * 4) = 94.
              expect(evaluateState(fat, 0)).toBe(64);
            });

            // 26. 'character ability: Ada action affinity boosts action card value'
            test('character ability: Ada action affinity boosts action card value', () => {
              const s = baseState({
                seats: [player(0, { characterInstanceId: 'ch-006#0', level: 2 as const, discard: ['ac-4#1'] }), player(1)],
                cards: cardsWith('ch-006#0', 'ac-4#1'),
                cardDefs: {
                  ...DEFS,
                  'ch-006': def('ch-006', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'actionBonus', amount: 40, level: 2 }] }),
                  'ac-4': def('ac-4', { type: 'action', cost: 70, bonuses: { cards: 1, actions: 2 } }),
                },
              });
              // ac-4 text value 92 + Ada actionBonus 40 = 132 owned; +200 level bonus:
              // 136 + 200 + 132 = 468.
              expect(evaluateState(s, 0)).toBe(438);
            });

            // 27. 'character ability: Rebecca trash affinity boosts trash actions'
            test('character ability: Rebecca trash affinity boosts trash actions', () => {
              const s = baseState({
                seats: [player(0, { characterInstanceId: 'ch-010#0', level: 2 as const, discard: ['ac-3#1'] }), player(1)],
                cards: cardsWith('ch-010#0', 'ac-3#1'),
                cardDefs: {
                  ...DEFS,
                  'ch-010': def('ch-010', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'trashEffectBonus', amount: 25, level: 2 }] }),
                  'ac-3': def('ac-3', { type: 'action', cost: 20, actionEffects: [{ kind: 'trashUpToTwoFromDiscard' }] }),
                },
              });
              // ac-3 owned = trash credit 6 + Rebecca trashEffectBonus 25 = 31;
              // +200 level bonus: 136 + 200 + 31 = 367.
              expect(evaluateState(s, 0)).toBe(337);
            });
    });
