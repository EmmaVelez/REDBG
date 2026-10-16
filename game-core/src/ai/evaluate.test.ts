
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
    // Derivation: 136 + 50*5 + 10*3 + 30 (affordable: BOTH piles cost <= 50 -> 2*15) = 136 + 250 + 30 + 30 = 446.
    expect(evaluateState(s, 0)).toBe(446);
  });

  // 8. 'hand cards count by type'
  test('hand cards count by type', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'ac-1#1', 'it-1#1'] }), player(1)] });
    // 136 + 8 (ammo) + 15 (weapon) + 5 (action) + 5 (item) = 169.
    expect(evaluateState(s, 0)).toBe(169);
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
});
