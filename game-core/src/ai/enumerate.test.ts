
import { enumerateLegalActions } from './enumerate';
import { validateAction } from '../engine/validate';
import type { Action, GameState, CardDef, PlayerState } from '../types';

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const DEFS: Record<string, CardDef> = {
  'ch-1': def('ch-1', { type: 'character', maxHp: 100, level2At: 4, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'plusDamageThisTurn', amount: 5, level: 2 }] }),
  'am-1': def('am-1', { type: 'ammunition', copies: 28, bonuses: { ammo: 10, gold: 10 } }),
  'am-2': def('am-2', { type: 'ammunition', copies: 28, bonuses: { ammo: 30, gold: 20 } }),
  'we-1': def('we-1', { type: 'weapon', cost: 20, ammoReq: 20, damage: 10 }),
  'we-2': def('we-2', { type: 'weapon', cost: 5, ammoReq: 0, damage: 8 }),
  'we-3': def('we-3', { type: 'weapon', cost: 0, ammoReq: 10, damage: 15, weaponEffects: [{ kind: 'plusDamagePerExtraWeapon', amount: 5 }] }),
  'ac-1': def('ac-1', { type: 'action', cost: 20, bonuses: { gold: 10 } }),
  'it-1': def('it-1', { type: 'item', itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] }),
  'ma-1': def('ma-1', { type: 'infected', hp: 20, attack: 10, decorations: 1 }),
};

function player(seat: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat, name: 'P' + seat, controller: 'human',
    characterInstanceId: 'ch-1#' + seat, hp: 100, maxHp: 100,
    decorations: 0, level: 1 as const,
    turnAmmo: 0, turnGold: 50, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
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
    cards: Object.fromEntries(['ch-1#0', 'ch-1#1', 'am-1#1', 'we-1#1', 'we-2#1', 'we-3#1', 'ac-1#1', 'it-1#1', 'ma-1#1', 'ma-1#2'].map(id => [id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } }])),
    cardDefs: DEFS,
    prompts: [], winners: [], endReason: undefined, log: [],
    ...over,
  };
  return s;
}

const act = (a: Action): Action => a;

  // Register extra weapon instances in the state's cards map (baseState only
  // knows one instance per def).
  function stateWithWeapons(seat0: Partial<PlayerState>, extraIds: string[]): GameState {
    const base = baseState();
    const extra = Object.fromEntries(
      extraIds.map(id => [id, { instanceId: id, cardId: id.replace(/#.*$/, ''), location: { zone: 'hand' as const, index: 0 } }]),
    );
    return { ...base, cards: { ...base.cards, ...extra }, seats: [player(0, seat0), player(1)] };
  }


describe('enumerateLegalActions', () => {
  // 1. 'no legal actions for an unknown seat'
  test('no legal actions for an unknown seat', () => {
    expect(enumerateLegalActions(baseState(), 99)).toEqual([]);
  });

  // 2. 'every returned action passes the validator'
  test('every returned action passes the validator', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'ac-1#1', 'it-1#1'] }), player(1)] });
    const acts = enumerateLegalActions(s, 0);
    for (const action of acts) {
      expect(validateAction(s, action).ok).toBe(true);
    }
  });

  // 3. 'hand cards produce one action per playable card'
  test('hand cards produce one action per playable card', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'am-1#1', 'ac-1#1', 'it-1#1'] }), player(1)] });
    const acts = enumerateLegalActions(s, 0);
    const playAmmoActions = acts.filter(a => a.type === 'playAmmo');
    const playActionCardActions = acts.filter(a => a.type === 'playActionCard');
    const playItemActions = acts.filter(a => a.type === 'playItem');

    expect(playAmmoActions.length).toBe(2);
    expect(playActionCardActions.length).toBe(1);
    expect(playItemActions.length).toBe(1);

    // Check for exactly one playAmmo action with instanceId 'am-1#1' (since there are two distinct instances)
    const ammoActions = playAmmoActions.map(a => a.instanceId);
    expect(ammoActions).toEqual(['am-1#1', 'am-1#1']);
  });

  // 4. 'buy candidates for every market pile'
  test('buy candidates for every market pile', () => {
    const s = baseState();
    const acts = enumerateLegalActions(s, 0);
    const buyActions = acts.filter(a => a.type === 'buy');
    const pileIds = buyActions.map(a => a.pileId).sort();
    expect(pileIds).toEqual(['hg', 'kn']);
  });

  // 5. 'explore singles and pairs gated by the ammo pool'
      test('explore singles and pairs gated by the ammo pool', () => {
        // We-1 (20 req), We-2 (0 req), We-3 (10 req). 10 ammo in the pool.
        // Hand order: [we-1#1, we-2#1, we-3#1]
        const s = baseState({ seats: [player(0, { hand: ['we-1#1', 'we-2#1', 'we-3#1'], turnAmmo: 10 }), player(1)] });
        const acts = enumerateLegalActions(s, 0);
        const filteredExplores = acts.filter(a => a.type === 'explore' && a.seat === 0) as Array<Extract<Action, { type: 'explore' }>>;

        /*
        Reasoning for expected filtered set (3 total — 10 ammo in the pool):
        1. Single we-2#1 (Req 0): pool 10 >= 0 -> LEGAL
        2. Single we-3#1 (Req 10): pool 10 >= 10 -> LEGAL
        3. Single we-1#1 (Req 20): pool 10 < 20 -> ILLEGAL (Rejected by validator)
        4. Pair we-2#1 + we-3#1 (Req 10): pool 10 >= 10 -> LEGAL
        5. Pair we-2#1 + we-1#1 (Req 20): pool 10 < 20 -> ILLEGAL (Rejected by validator)
        6. Pair we-3#1 + we-1#1 (Req 30): pool 10 < 30 -> ILLEGAL (Rejected by validator)
        */

        const expectedStrings = [
          JSON.stringify({ w: ['we-2#1'] }),
          JSON.stringify({ w: ['we-3#1'] }),
          JSON.stringify({ w: ['we-2#1', 'we-3#1'] }),
        ];

        const actualStrings = filteredExplores.map(a => JSON.stringify({ w: a.weapons }));

        expect(actualStrings).toEqual(expect.arrayContaining(expectedStrings));
        expect(filteredExplores.length).toBe(3);
      });

  // 6. 'ability actions for each character ability index'
  test('ability actions for each character ability index', () => {
    const s = baseState();
    const acts = enumerateLegalActions(s, 0);
    const abilityActions = acts.filter(a => a.type === 'useCharacterAbility');
    const abilityIndices = abilityActions.map(a => a.abilityIndex).sort((a, b) => a - b);
    // The fixture player is level 1: only the L1 ability (index 0) is legal —
    // the L2 ability (index 1) is level-locked.
    expect(abilityIndices).toEqual([0]);
  });

  test('level 2 unlocks both ability indices', () => {
    const s0 = baseState();
    const s = { ...s0, seats: s0.seats.map(p => (p.seat === 0 ? { ...p, level: 2 as const } : p)) };
    const acts = enumerateLegalActions(s, 0);
    const abilityIndices = acts.filter(a => a.type === 'useCharacterAbility').map(a => a.abilityIndex).sort((a, b) => a - b);
    expect(abilityIndices).toEqual([0, 1]);
  });

  // 7. 'endTurn always generated and legal when active'
  test('endTurn always generated and legal when active', () => {
    const s = baseState();
    const acts = enumerateLegalActions(s, 0);
    expect(acts.filter(a => a.type === 'endTurn').length).toBe(1);

    // Check WAITING seat (seat 1)
    const actsWaiting = enumerateLegalActions(s, 1);
    expect(actsWaiting).toEqual([]);
  });

  // 8. 'prompts produce one chooseOption per option'
  test('prompts produce one chooseOption per option', () => {
    const s = baseState({
      prompts: [
        { id: 'p1', seat: 0, text: 'choose', options: ['a', 'b', 'c'] },
        { id: 'p2', seat: 1, text: 'other', options: ['x'] },
      ],
    });
    const acts = enumerateLegalActions(s, 0);
    const chooseOptionActions = acts.filter(a => a.type === 'chooseOption');

    const p1Options = chooseOptionActions.filter(a => a.promptId === 'p1').map(a => a.option).sort((a, b) => a - b);
    expect(p1Options).toEqual([0, 1, 2]);

    const p2Options = chooseOptionActions.filter(a => a.promptId === 'p2');
    expect(p2Options.length).toBe(0);
  });

  // 9. 'deterministic: same input same output'
  test('deterministic: same input same output', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'we-1#1', 'we-2#1', 'ac-1#1'] }), player(1)] });
    const acts1 = enumerateLegalActions(s, 0);
    const acts2 = enumerateLegalActions(s, 0);
    expect(acts1).toEqual(acts2);
  });

  // 10. 'no explores when hand has no weapons'
  test('no explores when hand has no weapons', () => {
    const s = baseState({ seats: [player(0, { hand: ['am-1#1', 'ac-1#1'] }), player(1)] });
    const acts = enumerateLegalActions(s, 0);
    const explores = acts.filter(a => a.type === 'explore');
    expect(explores.length).toBe(0);
  });

  // 10b. REGRESSION (user report): hand of 3 knives (2x Combat Knife +
  // Survival Knife equivalents, we-2 x3, all ammoReq 0) must offer the full
  // 3-weapon explore — previously only singles and pairs were enumerated.
  test('three zero-ammo knives enumerate all 7 non-empty subsets including the 3-weapon explore', () => {
    const s = stateWithWeapons({ hand: ['we-2#1', 'we-2#2', 'we-2#3'] }, ['we-2#2', 'we-2#3']);
    const acts = enumerateLegalActions(s, 0);
    const explores = acts.filter(a => a.type === 'explore');
    // 2^3 - 1 = 7 subsets, all ammo-free so all legal
    expect(explores.length).toBe(7);
    const triple = explores.find(a => a.weapons.length === 3);
    expect(triple).toBeDefined();
    expect(triple?.weapons).toEqual(expect.arrayContaining(['we-2#1', 'we-2#2', 'we-2#3']));
    expect(validateAction(s, triple!).ok).toBe(true);
  });

  // 10c. ammo caps combos: we-1 costs 20 ammo; with turnAmmo 20, only one
  // we-1 combo passes validation (pairs/triples including two we-1s fail).
  test('explore subsets exceeding the ammo pool are filtered out', () => {
    const s = stateWithWeapons({ hand: ['we-1#1', 'we-1#2', 'we-2#1'], turnAmmo: 20 }, ['we-1#2']);
    const acts = enumerateLegalActions(s, 0);
    const explores = acts.filter(a => a.type === 'explore');
    // both we-1 ammoReq 20: any combo with 2 we-1 needs 40 > 20, filtered
    const bothRifles = explores.filter(a => a.weapons.includes('we-1#1') && a.weapons.includes('we-1#2'));
    expect(bothRifles.length).toBe(0);
    // single we-1#1 + we-2#1 (knife, 0 ammo) is legal
    const mixed = explores.find(a => a.weapons.length === 2 && a.weapons.includes('we-1#1') && a.weapons.includes('we-2#1'));
    expect(mixed).toBeDefined();
  });

  // 11. 'dead player still gets endTurn for cleanup'
  test('dead player still gets endTurn for cleanup', () => {
    const s = baseState({ seats: [player(0, { dead: true }), player(1)] });
    const acts = enumerateLegalActions(s, 0);
    const endTurnActions = acts.filter(a => a.type === 'endTurn');
    
    // Check that only endTurn is present and it validates
        expect(endTurnActions.length).toBe(1);
        const et = endTurnActions[0];
        if (et === undefined) throw new Error('missing endTurn');
        expect(validateAction(s, et).ok).toBe(true);
  });
});
