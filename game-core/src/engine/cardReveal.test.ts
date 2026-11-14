import { describe, expect, it } from 'vitest';
import type { CardDef, CardInstance, GameState, PlayerState } from '../types';
import { applyAction } from './actions';

/**
 * Non-explore ability/effect reveals.
 *
 * A peek leaves the card in its pile, so the client cannot recover it from a
 * zone diff. The engine records the revealed set on the action's log entry
 * (`LoggedAction.reveals`) and the client pauses to show the card. These tests
 * pin every reveal site to its log entry.
 */

function seat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s,
    name: 'P' + s,
    controller: 'human',
    characterInstanceId: over.characterInstanceId ?? ('c' + s),
    hp: 100,
    maxHp: 100,
    decorations: 0,
    level: over.level ?? 1,
    turnAmmo: 0,
    turnGold: 50,
    actionsLeft: over.actionsLeft ?? 1,
    buysLeft: 1,
    exploresLeft: over.exploresLeft ?? 1,
    weaponDamageBonusThisTurn: 0,
    attached: [],
    inventory: over.inventory ?? ['inv1', 'inv2', 'inv3', 'inv4', 'inv5'],
    hand: over.hand ?? ['h1', 'h2'],
    discard: over.discard ?? [],
    playArea: [],
    downed: false,
    dead: false,
    ...over,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'ch-ada': { id: 'ch-ada', name: 'Ada', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 80, level1At: 0, level2At: 4, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }] },
  'ch-ricardo': { id: 'ch-ricardo', name: 'Ricardo', type: 'character', set: 'custom', text: '', copies: 1, maxHp: 80, level1At: 0, level2At: 4, abilities: [{ kind: 'revealInventoryTopForAction', level: 1 }] },
  'ch-hunk': { id: 'ch-hunk', name: 'HUNK', type: 'character', set: 'promo', text: '', copies: 1, maxHp: 90, level1At: 0, level2At: 5, abilities: [{ kind: 'revealHandForDamageIfTwoTypes', amount: 10, level: 1 }] },
  'ac-mou': { id: 'ac-mou', name: 'Master of Unlocking', type: 'action', set: 'premier', text: '', copies: 3, cost: 30, bonuses: { actions: 1 }, actionEffects: [{ kind: 'stealRevealedWeaponsFromOpponentsTopCards' }] },
  'ac-pda': { id: 'ac-pda', name: 'PDA', type: 'action', set: 'nightmare', text: '', copies: 10, cost: 20, actionEffects: [{ kind: 'lookAtTopInventory', count: 3 }] },
  'ac-ecliptic': { id: 'ac-ecliptic', name: 'The Ecliptic Express', type: 'action', set: 'custom', text: '', copies: 1, cost: 0, actionEffects: [{ kind: 'lookAtMansionTop3AndReorder' }] },
  'ac-wesker': { id: 'ac-wesker', name: "Wesker's Secret", type: 'action', set: 'outbreak', text: '', copies: 5, cost: 40, bonuses: { cards: 2 }, actionEffects: [{ kind: 'weskersSecret' }] },
  'ac-mind': { id: 'ac-mind', name: 'Mind Control', type: 'action', set: 'nightmare', text: '', copies: 5, cost: 80, actionEffects: [{ kind: 'chooseOtherPlayerRevealHand' }] },
  'ac-cover': { id: 'ac-cover', name: 'Cover-up', type: 'action', set: 'custom', text: '', copies: 5, cost: 60, bonuses: { actions: 1, cards: 1 }, actionEffects: [{ kind: 'trashFromHandAtTurnStartPeekMansionTop' }] },
  'we-bolt': { id: 'we-bolt', name: 'Bolt-Action Rifle', type: 'weapon', set: 'premier', text: '', copies: 1, cost: 50, ammoReq: 0, damage: 20, weaponEffects: [{ kind: 'revealTopOfInventoryCostGate', threshold: 40, amount: 30 }] },
  'we-pistol': { id: 'we-pistol', name: 'Handgun', type: 'weapon', set: 'premier', text: '', copies: 9, cost: 20, ammoReq: 0, damage: 10, weaponType: 'handgun', weaponTags: ['gun', 'pistol'] },
  'we-knife': { id: 'we-knife', name: 'Combat Knife', type: 'weapon', set: 'premier', text: '', copies: 1, cost: 0, ammoReq: 0, damage: 5, weaponType: 'knife', weaponTags: ['melee', 'knife'] },
  'am-1': { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: '', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'ma-1': { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: '', copies: 3, hp: 20, attack: 20, decorations: 1 },
};

function base(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1,
    seed: 1,
    rngState: 1,
    phase: 'main',
    activeSeat: 0,
    turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, over.seat1)],
    marketPiles: { hg: { pileId: 'hg', cards: ['mkr1'] } },
    mansionDeck: over.mansionDeck ?? ['inf1', 'inf2', 'inf3', 'inf4'],
    removed: [],
    cards: {
      'h1': inst('h1', 'we-pistol'),
      'h2': inst('h2', 'we-knife'),
      'hp1': inst('hp1', 'we-pistol'),
      'hp2': inst('hp2', 'we-pistol'),
      'hk1': inst('hk1', 'we-knife'),
      'inv1': inst('inv1', 'am-1'),
      'inv2': inst('inv2', 'am-1'),
      'inv3': inst('inv3', 'am-1'),
      'inv4': inst('inv4', 'am-1'),
      'inv5': inst('inv5', 'am-1'),
      'wpn1': inst('wpn1', 'we-pistol'),
      'mou1': inst('mou1', 'ac-mou'),
      'pda1': inst('pda1', 'ac-pda'),
      'ecl1': inst('ecl1', 'ac-ecliptic'),
      'wes1': inst('wes1', 'ac-wesker'),
      'mind1': inst('mind1', 'ac-mind'),
      'cov1': inst('cov1', 'ac-cover'),
      'bolt1': inst('bolt1', 'we-bolt'),
      'ca': inst('ca', 'ch-ada'),
      'cri': inst('cri', 'ch-ricardo'),
      'chuk': inst('chuk', 'ch-hunk'),
      'inf1': inst('inf1', 'ma-1'),
      'inf2': inst('inf2', 'ma-1'),
      'inf3': inst('inf3', 'ma-1'),
      'inf4': inst('inf4', 'ma-1'),
      'mkr1': inst('mkr1', 'we-pistol'),
    },
    cardDefs: DEFS,
    prompts: over.prompts ?? [],
    winners: [],
    log: [],
  };
}

/** The newest log entry's engine-filled reveal set. */
function reveals(s: GameState) {
  return s.log[s.log.length - 1]?.reveals;
}

describe('ability/effect reveals recorded on the log', () => {
  it('Ada L1 peek: the Mansion top is revealed, with no zone change', () => {
    const s = applyAction(base({ seat0: { characterInstanceId: 'ca' } }), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(reveals(s)).toEqual([{ instanceId: 'inf1', pile: 'mansion' }]);
    // the peek leaves the deck untouched
    expect(s.mansionDeck).toEqual(base().mansionDeck);
  });

  it('Ricardo L1: the top of the Inventory is revealed', () => {
    const s = applyAction(base({ seat0: { characterInstanceId: 'cri', inventory: ['inv1', 'inv2'] } }), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(reveals(s)).toEqual([{ instanceId: 'inv1', pile: 'inventory' }]);
  });

  it('Hunk L1: revealing the hand records every hand card', () => {
    let s = applyAction(base({ seat0: { characterInstanceId: 'chuk', hand: ['hp1', 'hk1'] } }), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const p = s.prompts.find(x => x.payload?.kind === 'revealHandTwoTypes');
    expect(p).toBeDefined();
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: 0 });
    expect(reveals(s)).toEqual([
      { instanceId: 'hp1', pile: 'hand' },
      { instanceId: 'hk1', pile: 'hand' },
    ]);
  });

  it('Master of Unlocking: each opponent top card is revealed with its owner', () => {
    const s = applyAction(
      base({ seat0: { hand: ['mou1'] }, seat1: { inventory: ['wpn1', 'inv9'] } }),
      { type: 'playActionCard', seat: 0, instanceId: 'mou1' },
    );
    expect(reveals(s)).toEqual([{ instanceId: 'wpn1', pile: 'inventory', ownerSeat: 1 }]);
  });

  it('PDA: the top N Inventory cards are revealed', () => {
    const s = applyAction(
      base({ seat0: { hand: ['pda1'], inventory: ['inv1', 'inv2', 'inv3', 'inv4'] } }),
      { type: 'playActionCard', seat: 0, instanceId: 'pda1' },
    );
    expect(reveals(s)).toEqual([
      { instanceId: 'inv1', pile: 'inventory' },
      { instanceId: 'inv2', pile: 'inventory' },
      { instanceId: 'inv3', pile: 'inventory' },
    ]);
  });

  it('Ecliptic Express: the top 3 Mansion cards are revealed', () => {
    const s = applyAction(
      base({ seat0: { hand: ['ecl1'] }, mansionDeck: ['inf1', 'inf2', 'inf3', 'inf4'] }),
      { type: 'playActionCard', seat: 0, instanceId: 'ecl1' },
    );
    expect(reveals(s)).toEqual([
      { instanceId: 'inf1', pile: 'mansion' },
      { instanceId: 'inf2', pile: 'mansion' },
      { instanceId: 'inf3', pile: 'mansion' },
    ]);
  });

  it("Wesker's Secret: the top 4 Mansion cards are revealed", () => {
    const s = applyAction(
      base({ seat0: { hand: ['wes1'] }, mansionDeck: ['inf1', 'inf2', 'inf3', 'inf4'] }),
      { type: 'playActionCard', seat: 0, instanceId: 'wes1' },
    );
    expect(reveals(s)).toEqual([
      { instanceId: 'inf1', pile: 'mansion' },
      { instanceId: 'inf2', pile: 'mansion' },
      { instanceId: 'inf3', pile: 'mansion' },
      { instanceId: 'inf4', pile: 'mansion' },
    ]);
  });

  it('Mind Control: the chosen player\'s hand is revealed with its owner', () => {
    let s = applyAction(
      base({ seat0: { hand: ['mind1'] }, seat1: { hand: ['hp1', 'hk1'] } }),
      { type: 'playActionCard', seat: 0, instanceId: 'mind1' },
    );
    const p = s.prompts.find(x => x.payload?.kind === 'chooseOtherPlayerRevealHand');
    expect(p).toBeDefined();
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: 0 });
    expect(reveals(s)).toEqual([
      { instanceId: 'hp1', pile: 'hand', ownerSeat: 1 },
      { instanceId: 'hk1', pile: 'hand', ownerSeat: 1 },
    ]);
  });

  it('SK-029: revealing the Pistols records exactly those hand cards', () => {
    const s = applyAction(
      base({
        seat0: { hand: ['hp1', 'hp2', 'hk1'] },
        prompts: [{ id: 'skp', seat: 0, text: '', options: ['Reveal', 'Decline'], payload: { kind: 'skillRevealPistolsForExplore', count: '2' } }],
      }),
      { type: 'chooseOption', seat: 0, promptId: 'skp', option: 0 },
    );
    expect(reveals(s)).toEqual([
      { instanceId: 'hp1', pile: 'hand' },
      { instanceId: 'hp2', pile: 'hand' },
    ]);
  });

  it('Cover-up: the peeked Mansion top is revealed when the trash resolves', () => {
    const s = applyAction(
      base({
        seat0: { hand: ['cov1'] },
        mansionDeck: ['inf1', 'inf2'],
        prompts: [{ id: 'cvp', seat: 0, text: '', options: ['Trash', 'Decline'], payload: { kind: 'coverUpTrash', instanceId: 'cov1' } }],
      }),
      { type: 'chooseOption', seat: 0, promptId: 'cvp', option: 0 },
    );
    expect(reveals(s)).toEqual([{ instanceId: 'inf1', pile: 'mansion' }]);
  });

  it('WE-015 Bolt-Action Rifle: the Inventory top is revealed during the explore', () => {
    const s = applyAction(
      base({ seat0: { hand: ['bolt1'], inventory: ['inv1', 'inv2'] }, mansionDeck: ['inf1'] }),
      { type: 'explore', seat: 0, weapons: ['bolt1'], exploreCount: 1 },
    );
    const exploreEntry = s.log.find(e => e.action.type === 'explore');
    expect(exploreEntry?.reveals).toEqual([{ instanceId: 'inv1', pile: 'inventory' }]);
  });

  it('actions with no reveal carry no reveals field', () => {
    const s = applyAction(base({ seat0: { hand: ['h1', 'h2'] } }), { type: 'endTurn', seat: 0 });
    expect(reveals(s)).toBeUndefined();
  });
});
