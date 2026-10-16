
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

describe('evaluateState', () => {
  // 1. 'baseline score'
  test('baseline score', () => {
    expect(evaluateState(baseState(), 0)).toBe(136);
  });

  // 2. 'baseline is symmetric for both seats'
  test('baseline is symmetric for both seats', () => {
    expect(evaluateState(baseState(), 0)).toBe(evaluateState(baseState(), 1));
    expect(evaluateState(baseState(), 0)).toBe(136);
  });

  // 3. 'dead player scores catastrophically low'
  test('dead player scores catastrophically low', () => {
    const s = baseState({ seats: [player(0, { dead: true }), player(1)] });
    expect(evaluateState(s, 0)).toBe(-10000);
  });

  // 4. 'downed is bad but better than dead'
  test('downed is bad but better than dead', () => {
    const s = baseState({ seats: [player(0, { downed: true, hp: 0 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(-3964);
  });

  // 5. 'level 2 is worth 200'
  test('level 2 is worth 200', () => {
    const s = baseState({ seats: [player(0, { level: 2 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(336);
  });

  // 6. 'decorations are worth 50 each'
  test('decorations are worth 50 each', () => {
    const s = baseState({ seats: [player(0, { decorations: 4 }), player(1)] });
    expect(evaluateState(s, 0)).toBe(336);
  });

  // 7. 'gold and ammo pools add value'
    test('gold and ammo pools add value', () => {
      const s = baseState({ seats: [player(0, { turnGold: 50, turnAmmo: 10 }), player(1)] });
      // Derivation: 136 + 50*1 (gold is transient: 1/point) + 10*3 + 20 (affordable:
      // BOTH piles cost <= 50 -> 2 piles * 10 potential) = 136 + 50 + 30 + 20 = 236.
      expect(evaluateState(s, 0)).toBe(236);
    });

    // 8. 'hand cards count by type'
    test('hand cards count by type', () => {
      const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'ac-1#1', 'it-1#1'] }), player(1)] });
      // 136 + 8 (ammo) + 12 (we-1 damage 10 -> 10 + 10/5) + 5 (action) + 5 (item) = 166.
      expect(evaluateState(s, 0)).toBe(166);
    });

  // 9. 'attached infected trophies are valuable'
  test('attached infected trophies are valuable', () => {
    const s = baseState({ seats: [player(0, { attached: ['ma-1#1', 'ma-1#2'] }), player(1)] });
    expect(evaluateState(s, 0)).toBe(186);
  });

  // 10. 'eliminated opponents are rewarded'
  test('eliminated opponents are rewarded', () => {
    const s = baseState({ seats: [player(0), player(1, { dead: true })] });
    expect(evaluateState(s, 0)).toBe(436);
  });

  // 11. 'downed opponents are a smaller reward'
    test('downed opponents are a smaller reward', () => {
      const s = baseState({ seats: [player(0), player(1, { downed: true, hp: 0 })] });
      // baseline 136 already includes -100 for opponent hp 100; with hp 0 the
      // opponent-hp term is 0 (refund 100), then +150 for downed: 136+100+150
      expect(evaluateState(s, 0)).toBe(386);
    });

  // 12. 'decorated opponents are threatening'
  test('decorated opponents are threatening', () => {
    const s = baseState({ seats: [player(0), player(1, { decorations: 5 })] });
    expect(evaluateState(s, 0)).toBe(36);
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
      expect(evaluateState(s, 0)).toBe(158);
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
      expect(evaluateState(s, 0)).toBe(147);
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
            expect(evaluateState(s, 0)).toBe(156);

            // At level 2 the same hand gets the +200 level bonus AND +20 magnum affinity:
            // 156 + 200 + 20 = 376.
            const s2 = { ...s, seats: s.seats.map((x, i) => (i === 0 ? { ...x, level: 2 as const } : x)) };
            expect(evaluateState(s2, 0)).toBe(376);
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
      // Claire L1: ammo cards worth extra 10 ammo * 3 = +30 each on top of the 8 base:
      // 136 + 8 + 30 = 174.
      expect(evaluateState(s, 0)).toBe(174);
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
            // exploreGoldBonus adds +20 gold per explore at 5/gold = +100: 136 + 100 = 236
            // (vs 136 for a generic character whose explore term is already inside baseline).
            expect(evaluateState(s, 0)).toBe(236);
    });

    // 21. 'discarded weapons keep their value (bought cards are real assets)'
    test('discarded weapons keep their value (bought cards are real assets)', () => {
      const s = baseState({ seats: [player(0, { discard: ['we-1#1'] }), player(1)] });
      // we-1 damage 10 -> 12, same as if it were in hand: 136 + 12 = 148.
      expect(evaluateState(s, 0)).toBe(148);
    });
  });
