import { applyAction } from './actions';
import { validateAction } from './validate';
import type { GameState, CardInstance, CardDef, PlayerState } from '../types';

function seat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s, name: 'P' + s, controller: 'human',
    characterInstanceId: over.characterInstanceId ?? ('c' + s), hp: over.hp ?? 100, maxHp: over.maxHp ?? 100,
    decorations: over.decorations ?? 0, level: over.level ?? 1,
    turnAmmo: over.turnAmmo ?? 0, turnGold: over.turnGold ?? 50, actionsLeft: over.actionsLeft ?? 1,
    buysLeft: over.buysLeft ?? 1, exploresLeft: over.exploresLeft ?? 1,
    weaponDamageBonusThisTurn: over.weaponDamageBonusThisTurn ?? 0, attached: [],
    inventory: over.inventory ?? ['inv1', 'inv2', 'inv3', 'inv4', 'inv5', 'inv6', 'inv7', 'inv8'],
    hand: over.hand ?? ['a1', 'i1', 'am1', 'w1', 'w2'],
    discard: over.discard ?? [], playArea: over.playArea ?? [], downed: over.downed ?? false, dead: over.dead ?? false,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

const DEFS: Record<string, CardDef> = {
  'ac-1': { id: 'ac-1', name: 'Deadly Aim', type: 'action', set: 'premier', text: 'Deadly Aim', copies: 5, cost: 50, actionEffects: [{ kind: 'allWeaponsPlusDamageThisTurn', amount: 10 }] },
  'ac-2': { id: 'ac-2', name: 'Merchant', type: 'action', set: 'premier', text: 'Merchant', copies: 6, cost: 50, bonuses: { buys: 1, cards: 1, gold: 20 } },
  'ac-3': { id: 'ac-3', name: 'Reload', type: 'action', set: 'premier', text: 'Reload', copies: 5, cost: 20, actionEffects: [{ kind: 'recoverWeaponFromDiscardToHand' }] },
  'ac-4': { id: 'ac-4', name: 'Umbrella', type: 'action', set: 'premier', text: 'Umbrella', copies: 5, cost: 50, actionEffects: [{ kind: 'moveHandCardToTopOfInventory' }] },
  'ac-5': { id: 'ac-5', name: 'Ominous Battle', type: 'action', set: 'premier', text: 'Ominous Battle', copies: 5, cost: 60, actionEffects: [{ kind: 'trashHandCard' }] },
  'ac-6': { id: 'ac-6', name: 'Shattered Memories', type: 'action', set: 'premier', text: 'Shattered Memories', copies: 5, cost: 20, actionEffects: [{ kind: 'trashUpToTwoFromDiscard' }] },
  'ac-7': { id: 'ac-7', name: 'Master of Unlocking', type: 'action', set: 'premier', text: 'Master of Unlocking', copies: 3, cost: 30, bonuses: { actions: 1 }, actionEffects: [{ kind: 'stealRevealedWeaponsFromOpponentsTopCards' }] },
  'it-1': { id: 'it-1', name: 'Green Herb', type: 'item', set: 'premier', text: 'Green Herb', copies: 6, cost: 20, itemEffects: [{ kind: 'healFixed20OrTrashWithSecondFor60' }] },
  'it-2': { id: 'it-2', name: 'First Aid Spray', type: 'item', set: 'premier', text: 'First Aid Spray', copies: 5, cost: 60, itemEffects: [{ kind: 'healToFull' }] },
  'am-1': { id: 'am-1', name: 'Ammo x10', type: 'ammunition', set: 'premier', text: 'Ammo x10', copies: 28, bonuses: { ammo: 10, gold: 10 } },
  'we-1': { id: 'we-1', name: 'Handgun', type: 'weapon', set: 'premier', text: 'Handgun', copies: 9, cost: 20, ammoReq: 20, damage: 10 },
  'w9-1': { id: 'w9-1', name: 'Test Knife', type: 'weapon', set: 'premier', text: 'Test Knife', copies: 1, ammoReq: 0, damage: 5 },
  'w20-1': { id: 'w20-1', name: 'Test Magnum', type: 'weapon', set: 'premier', text: 'Test Magnum', copies: 1, ammoReq: 0, damage: 20 },
  'ma-1': { id: 'ma-1', name: 'Majini', type: 'infected', set: 'premier', text: 'Majini', copies: 3, hp: 20, attack: 20, decorations: 1 },
  'ma-10': { id: 'ma-10', name: 'Uroboros Aheri', type: 'infected', set: 'premier', text: 'Uroboros', copies: 1, hp: 90, attack: 70, decorations: 8, infectedEffects: [{ kind: 'shuffleBackIfNotDefeated' }] },
  'ch-1': { id: 'ch-1', name: 'Chris', type: 'character', set: 'premier', text: 'Chris', copies: 1, maxHp: 100, level2At: 4, abilities: [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 1 }] },
  'ch-sheva': { id: 'ch-sheva', name: 'Sheva', type: 'character', set: 'premier', text: 'Sheva', copies: 1, maxHp: 80, level1At: 2, level2At: 4, abilities: [{ kind: 'exchangeHandWithInventoryTop', level: 1 }, { kind: 'weaponTagBonus', tag: 'rifle', amount: 20, level: 2 }] },
  'ch-barry': { id: 'ch-barry', name: 'Barry', type: 'character', set: 'premier', text: 'Barry', copies: 1, maxHp: 90, level1At: 2, level2At: 7, abilities: [{ kind: 'plusDamageThisTurn', amount: 5, level: 1 }, { kind: 'weaponTagBonus', tag: 'magnum', amount: 20, level: 2 }] },
  'ch-ada': { id: 'ch-ada', name: 'Ada', type: 'character', set: 'premier', text: 'Ada', copies: 1, maxHp: 80, level1At: 4, level2At: 8, abilities: [{ kind: 'revealMansionTopNoEffect', level: 1 }, { kind: 'actionBonus', amount: 40, level: 2 }] },
  'ch-becky': { id: 'ch-becky', name: 'Rebecca', type: 'character', set: 'premier', text: 'Rebecca', copies: 1, maxHp: 70, level1At: 2, level2At: 4, abilities: [{ kind: 'generic', level: 1 }, { kind: 'trashFromHandAtWill', level: 2 }] },
};

function baseState(over: Partial<GameState> & { seat0?: Partial<PlayerState>; seat1?: Partial<PlayerState> } = {}): GameState {
  return {
    version: 1, seed: 1, rngState: over.rngState ?? 1, phase: 'main',
    activeSeat: 0, turnNumber: 1,
    seats: [seat(0, over.seat0), seat(1, over.seat1)],
    marketPiles: over.marketPiles ?? { hg: { pileId: 'hg', cards: ['mkr1'] } },
    mansionDeck: over.mansionDeck ?? ['inf1'], mansionBottom: over.mansionBottom ?? [], removed: over.removed ?? [],
    cards: {
      'a1': inst('a1', 'ac-1'), 'a2': inst('a2', 'ac-2'), 'a3': inst('a3', 'ac-3'), 'a4': inst('a4', 'ac-4'), 'a5': inst('a5', 'ac-5'), 'a6': inst('a6', 'ac-6'), 'a7': inst('a7', 'ac-7'),
      'i1': inst('i1', 'it-1'), 'i2': inst('i2', 'it-1'), 'i3': inst('i3', 'it-2'),
      'am1': inst('am1', 'am-1'), 'am2': inst('am2', 'am-1'),
      'w1': inst('w1', 'we-1'), 'w2': inst('w2', 'we-1'),
      'w5': inst('w5', 'w9-1'), 'w20': inst('w20', 'w20-1'),
      'dw1': inst('dw1', 'w9-1'),
      'mkr1': inst('mkr1', 'we-1'), 'inf1': inst('inf1', 'ma-1'), 'uro1': inst('uro1', 'ma-10'), 'gh1': inst('gh1', 'it-1'),
      'c0': inst('c0', 'ch-1'), 'c1': inst('c1', 'ch-1'),
      'cs': inst('cs', 'ch-sheva'), 'cb': inst('cb', 'ch-barry'), 'ca': inst('ca', 'ch-ada'), 'cr': inst('cr', 'ch-becky'),
      'inv1': inst('inv1', 'am-1'), 'inv2': inst('inv2', 'am-1'), 'inv3': inst('inv3', 'am-1'), 'inv4': inst('inv4', 'am-1'), 'inv5': inst('inv5', 'am-1'), 'inv6': inst('inv6', 'am-1'), 'inv7': inst('inv7', 'am-1'), 'inv8': inst('inv8', 'am-1'),
    },
    cardDefs: DEFS, prompts: over.prompts ?? [], winners: [], log: [],
  };
}



function pr(s: GameState): { id: string } & { payload?: Record<string, string>; options: string[]; seat: number; text: string } {
  return s.prompts[0] as unknown as { id: string } & { payload?: Record<string, string>; options: string[]; seat: number; text: string };
}
function p0(s: GameState): PlayerState {
  return s.seats[0] as PlayerState;
}
test('play action card (Deadly Aim)', () => {
  const s = applyAction(baseState(), { type: 'playActionCard', seat: 0, instanceId: 'a1' });
  expect(p0(s).hand).not.toContain('a1');
  expect(p0(s).playArea).toContain('a1');
  expect(p0(s).actionsLeft).toBe(0);
  expect(p0(s).weaponDamageBonusThisTurn).toBe(10);
  expect(s.version).toBe(2);
  expect(s.log.length).toBe(1);
});

test('play action card with bonuses (Merchant)', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a2', 'i1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a2' });
  expect(p0(s).hand).not.toContain('a2');
  expect(p0(s).hand).toContain('inv1'); // drew 1 from inventory
  expect(p0(s).turnGold).toBe(70);
  expect(p0(s).buysLeft).toBe(2);
  expect(p0(s).actionsLeft).toBe(0);
});

test('Reload prompt created', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a3'], discard: ['dw1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a3' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('recoverWeaponFromDiscardToHand');
  expect(pr(s).options).toEqual(['dw1']);
  expect(pr(s).seat).toBe(0);
});

test('Reload resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a3'], discard: ['dw1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a3' });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hand).toContain('dw1');
  expect(p0(s2).discard).toEqual([]);
  expect(s2.prompts).toEqual([]);
});

test('Umbrella prompt + resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a4', 'w1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a4' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).options).toEqual(['w1', 'am1']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hand).not.toContain('w1');
  expect(p0(s2).inventory[0]).toBe('w1');
  expect(s2.prompts).toEqual([]);
});

test('Ominous Battle resolution', () => {
  const s = applyAction(baseState({ seat0: { hand: ['a5', 'w1', 'am1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a5' });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(p0(s2).hand).not.toContain('am1');
  expect(s2.removed).toContain('am1');
});

test('Green Herb heal 20', () => {
  const s = applyAction(baseState({ seat0: { hp: 50, hand: ['i1'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  expect(s.removed).toContain('i1');
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('healGreenHerb');
  // No second herb in hand: only "Heal 20" is offered — Heal 60 is illegal.
  expect(pr(s).options).toEqual(['Heal 20']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).hp).toBe(70);
});

test('Green Herb healing requires the option to be offered (validator rejects out-of-range)', () => {
  const s = applyAction(baseState({ seat0: { hp: 50, hand: ['i1'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  // Only one option exists here; option 1 (Heal 60) must be rejected.
  expect(validateAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 }).ok).toBe(false);
});

test('Green Herb heal 60', () => {
  const s = applyAction(baseState({ seat0: { hp: 30, hand: ['i1', 'i2'] } }), { type: 'playItem', seat: 0, instanceId: 'i1' });
  // With a second herb in hand, both options are offered.
  expect(pr(s).options).toEqual(['Heal 20', 'Heal 60']);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(p0(s2).hp).toBe(90);
  // Both the played herb AND the second herb from hand are trashed.
  expect(p0(s2).hand).not.toContain('i2');
  expect(s2.removed).toEqual(['i1', 'i2']);
});

test('First Aid Spray', () => {
  const s = applyAction(baseState({ seat0: { hp: 30, hand: ['i3'] } }), { type: 'playItem', seat: 0, instanceId: 'i3' });
  expect(p0(s).hp).toBe(100);
  expect(s.removed).toContain('i3');
  expect(s.prompts).toEqual([]);
});

test('playAmmo', () => {
  const s = applyAction(baseState({ seat0: { hand: ['am1', 'am2'] } }), { type: 'playAmmo', seat: 0, instanceId: 'am1' });
  expect(p0(s).turnAmmo).toBe(10);
  expect(p0(s).turnGold).toBe(60);
  expect(p0(s).playArea).toContain('am1');
  expect(p0(s).hand).not.toContain('am1');
});

test('buy', () => {
  const s = applyAction(baseState(), { type: 'buy', seat: 0, pileId: 'hg' });
  expect(p0(s).turnGold).toBe(30);
  expect(p0(s).buysLeft).toBe(0);
  expect(p0(s).discard).toContain('mkr1');
  expect((s.marketPiles.hg as { pileId: string; cards: string[] }).cards).toEqual([]);
});

test('explore defeated', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w20', 'w5'] } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(s).decorations).toBe(1);
  expect(p0(s).attached).toEqual(['inf1']);
  expect(s.mansionDeck).toEqual([]);
  expect(s.mansionBottom).toEqual([]);
  expect(p0(s).exploresLeft).toBe(0);
  expect(p0(s).dead).toBe(false);
  expect(p0(s).hp).toBe(100);
});

test('explore consumes ammo from the pool, keeps ammo cards in hand', () => {
  // w1 = we-1 (ammoReq 20). Pool starts at 30; two ammo cards in hand.
  const s = applyAction(baseState({ seat0: { hand: ['w1', 'am1', 'am2'], turnAmmo: 30 } }), { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(p0(s).turnAmmo).toBe(10); // 30 - 20 requirement consumed
  expect(p0(s).hand).toEqual(['am1', 'am2']); // ammo cards stay in hand
  expect(p0(s).playArea).toContain('w1'); // weapon moved to play area
});

test('explore with ammo cards removed from hand still works (pool-based ammo)', () => {
  // Classic bug repro: play ammo cards (for gold) BEFORE exploring; the
  // weapon must still be usable because ammo is a resource, not hand cards.
  const s1 = applyAction(baseState({ seat0: { hand: ['w1', 'am1', 'am2'] } }), { type: 'playAmmo', seat: 0, instanceId: 'am1' });
  // am1 grants +10 ammo +10 gold; the card leaves the hand
  expect(p0(s1).turnAmmo).toBe(10);
  expect(p0(s1).turnGold).toBe(60); // 50 base + 10
  expect(p0(s1).hand).not.toContain('am1');
  const s2 = applyAction(s1, { type: 'playAmmo', seat: 0, instanceId: 'am2' });
  expect(p0(s2).turnAmmo).toBe(20); // pool now covers w1's 20 ammo req
  expect(p0(s2).hand).not.toContain('am2');
  // explore with the weapon alone — no ammo cards in hand — pool funds it
  const s3 = applyAction(s2, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 1 });
  expect(p0(s3).turnAmmo).toBe(0); // 20 pool - 20 req consumed
  expect(p0(s3).playArea).toContain('w1');
});

test('explore level-up', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w20', 'w5'], decorations: 4 } }), { type: 'explore', seat: 0, weapons: ['w20'], exploreCount: 1 });
  expect(p0(s).level).toBe(2);
});

test('explore not defeated', () => {
  const s = applyAction(baseState({ seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(80);
  expect(s.mansionBottom).toEqual(['inf1']);
  expect(p0(s).attached).toEqual([]);
  expect(p0(s).decorations).toBe(0);
});

test('explore downed', () => {
  const s = applyAction(baseState({ seat0: { hp: 10, hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).downed).toBe(true);
  expect(p0(s).hand).toEqual([]);
  expect(p0(s).playArea).toContain('w5'); // used weapons stay in play area
  expect(p0(s).inventory.length).toBe(8); // hand+discard were empty at flip; inventory unchanged
  expect(p0(s).attached).toEqual([]);
});

test('explore Uroboros shuffle-back', () => {
  const s = applyAction(baseState({ mansionDeck: ['uro1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(p0(s).hp).toBe(30);
  expect(s.mansionDeck).toContain('uro1');
  expect(s.mansionBottom).toEqual([]);
});

test('explore non-infected take', () => {
  const s = applyAction(baseState({ mansionDeck: ['gh1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('takeOrBottom');
  expect(pr(s).options).toEqual(['Take', 'Send to bottom of Mansion']);
  expect(s.mansionDeck).toEqual([]);
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 0 });
  expect(p0(s2).discard).toContain('gh1');
  expect(s2.prompts).toEqual([]);
});

test('explore non-infected bottom', () => {
  const s = applyAction(baseState({ mansionDeck: ['gh1'], seat0: { hand: ['w5'] } }), { type: 'explore', seat: 0, weapons: ['w5'], exploreCount: 1 });
  const s2 = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr(s).id, option: 1 });
  expect(s2.mansionBottom).toEqual(['gh1']);
  expect(p0(s2).discard).toEqual([]);
});

test('endTurn', () => {
  const s = applyAction(baseState(), { type: 'endTurn', seat: 0 });
  expect(p0(s).hand.length).toBe(5);
  expect(p0(s).inventory.length).toBe(3);
  expect(p0(s).playArea).toEqual([]);
  expect(p0(s).discard.length).toBe(5);
  expect(s.activeSeat).toBe(1);
  expect(s.turnNumber).toBe(2);
  expect(p0(s).hp).toBe(100);
});

test('useCharacterAbility no-op', () => {
  const s = applyAction(baseState(), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s.version).toBe(2);
  expect(s.log.length).toBe(1);
  expect(p0(s).hp).toBe(100);
  expect(p0(s).decorations).toBe(0);
});

test('Shattered Memories (trashUpToTwoFromDiscard) prompts with discard options', () => {
  // ac-6 = Shattered Memories; seat 0 has three cards in discard
  const s = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  expect(s.prompts.length).toBe(1);
  expect(pr(s).payload?.kind).toBe('trashUpToTwoFromDiscard');
  // options = discard cards (in order) + DONE sentinel
  expect(pr(s).options).toEqual(['am2', 'w5', 'inv1', 'DONE']);
});

test('Shattered Memories: choosing a card trashes it and chains the prompt', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 }); // trash am2
  expect(s1.removed).toContain('am2');
  expect(p0(s1).discard).toEqual(['w5', 'inv1']);
  // up to 2: a follow-up prompt offers the remaining discard
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('trashUpToTwoFromDiscard');
  expect(pr(s1).payload?.trashed).toBe(1);
  expect(pr(s1).options).toEqual(['w5', 'inv1', 'DONE']);
  // trash a second card — chain ends (max 2)
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 }); // trash w5
  expect(s2.removed).toEqual(['am2', 'w5']);
  expect(p0(s2).discard).toEqual(['inv1']);
  expect(s2.prompts.length).toBe(0); // hit the 2-card cap, prompt closed
});

test('Shattered Memories: DONE ends the chain without trashing more', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5', 'inv1'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  // choose one card, then DONE
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 });
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 2 }); // DONE
  expect(s2.removed).toEqual(['am2']);
  expect(p0(s2).discard).toEqual(['w5', 'inv1']);
  expect(s2.prompts.length).toBe(0);
});

test('Shattered Memories: DONE immediately keeps the discard intact', () => {
  const s0 = applyAction(baseState({ seat0: { hand: ['a6'], discard: ['am2', 'w5'] } }), { type: 'playActionCard', seat: 0, instanceId: 'a6' });
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 2 }); // DONE
  expect(s1.removed).toEqual([]);
  expect(p0(s1).discard).toEqual(['am2', 'w5']);
  expect(s1.prompts.length).toBe(0);
});

test('Master of Unlocking offers the opponents revealed top weapons', () => {
  // seat 0 plays ac-7; seat 1 has a weapon (w2) and an ammo (am1) on top.
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  expect(s0.prompts.length).toBe(1);
  expect(pr(s0).payload?.kind).toBe('stealRevealedWeaponsFromOpponentsTopCards');
  // only the top card (w2) is revealed; it is a weapon so it is offerable
  expect(pr(s0).options).toEqual(['w2', 'DONE']);
});

test('Master of Unlocking: taking a weapon moves it to your discard and ends (only one revealed)', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 }); // take w2
    expect(p0(s1).discard).toContain('w2');
    // seat 1 lost its top card; the revealed non-weapon (am1) stays on top
    expect(s1.seats[1]?.inventory).toEqual(['am1']);
    expect(s1.prompts.length).toBe(0);
  });

test('Master of Unlocking: DONE leaves the opponents inventory untouched', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['w2', 'am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 1 }); // DONE
    expect(s1.seats[1]?.inventory).toEqual(['w2', 'am1']);
    expect(p0(s1).discard).toEqual([]);
    expect(s1.prompts.length).toBe(0);
  });

test('Master of Unlocking: non-weapon top cards reveal nothing offerable (no prompt)', () => {
  const s0 = applyAction(
    baseState({ seat0: { hand: ['a7'] }, seat1: { inventory: ['am1'] } }),
    { type: 'playActionCard', seat: 0, instanceId: 'a7' }
  );
  expect(s0.prompts.length).toBe(0);
});

test('Krauser L1: choosing the market knife gains it to discard and pops the pile', () => {
  // 'mkr1' (we-1 weapon) tops the fixture 'hg' pile; simulate the turn-start
  // ability prompt offering it + Decline.
  const withPrompt: GameState = {
    ...baseState(),
    prompts: [{
      id: 'ability-0-v2',
      seat: 0,
      text: 'At beginning of your turn, may gain 1 Knife weapon.',
      options: ['mkr1', 'Decline'],
      payload: { kind: 'gainKnifeAtTurnStart' },
    }],
  };
  const s1 = applyAction(withPrompt, { type: 'chooseOption', seat: 0, promptId: 'ability-0-v2', option: 0 });
  expect(p0(s1).discard).toEqual(['mkr1']);
  expect(s1.marketPiles['hg']?.cards).toEqual([]);
  expect(s1.prompts.length).toBe(0);
  // no Gold or Buy was spent — this is a gain, not a purchase
  expect(p0(s1).turnGold).toBe(50);
  expect(p0(s1).buysLeft).toBe(1);
});

test('Krauser L1: Decline leaves the market untouched', () => {
  const withPrompt: GameState = {
    ...baseState(),
    prompts: [{
      id: 'ability-0-v2',
      seat: 0,
      text: 'At beginning of your turn, may gain 1 Knife weapon.',
      options: ['mkr1', 'Decline'],
      payload: { kind: 'gainKnifeAtTurnStart' },
    }],
  };
  const s1 = applyAction(withPrompt, { type: 'chooseOption', seat: 0, promptId: 'ability-0-v2', option: 1 });
  expect(p0(s1).discard).toEqual([]);
  expect(s1.marketPiles['hg']?.cards).toEqual(['mkr1']);
  expect(s1.prompts.length).toBe(0);
});


test('Sheva L1: exchange hand card with top of Inventory', () => {
  // Sheva at level 1, hand [am1], inventory top w1
  const base = baseState({ seat0: { characterInstanceId: 'cs', level: 1 as const, hand: ['am1'], inventory: ['w1', 'am2'] } });
  const s0 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s0.prompts.length).toBe(1);
  expect(pr(s0).payload?.kind).toBe('exchangeHandWithInventoryTop');
  expect(pr(s0).options).toEqual(['am1']);
  const s1 = applyAction(s0, { type: 'chooseOption', seat: 0, promptId: pr(s0).id, option: 0 });
  expect(p0(s1).hand).toEqual(['w1']);
  expect(p0(s1).inventory).toEqual(['am1', 'am2']);
  expect(s1.prompts.length).toBe(0);
});

test('Sheva L1: rejected below level 1 and with empty zones', () => {
  const lvl0 = baseState({ seat0: { characterInstanceId: 'cs', level: 0 as const, hand: ['am1'], inventory: ['w1'] } });
  expect(validateAction(lvl0, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: ability not unlocked' });
  const empty = baseState({ seat0: { characterInstanceId: 'cs', level: 1 as const, hand: [], inventory: ['w1'] } });
  expect(validateAction(empty, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
});

test('Barry L1: +5 damage this turn, once per turn', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cb', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(p0(s1).weaponDamageBonusThisTurn).toBe(5);
  // second use this turn is rejected (log shows the first use)
  expect(validateAction(s1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: false, reason: 'useCharacterAbility: already used this turn' });
});

test('Barry L1: usable again next turn (log scan stops at endTurn)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cb', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  const s2 = applyAction(s1, { type: 'endTurn', seat: 0 });
  // seat 1 now; bring it back to seat 0 for the fixture's sake
  const s3 = { ...s2, activeSeat: 0, seats: s2.seats.map(s => (s.seat === 0 ? { ...s, weaponDamageBonusThisTurn: 0 } : s)) };
  expect(validateAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: true });
});

test('Ada L1: peek Mansion top without engaging', () => {
  const base = baseState({ seat0: { characterInstanceId: 'ca', level: 1 as const } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('lookAtMansionTop');
  expect(pr(s1).text).toContain('Majini'); // fixture mansionDeck top = inf1 (ma-1)
  // the card stays on top of the Mansion; nothing attached/removed
  expect(s1.mansionDeck).toEqual(base.mansionDeck);
  expect(s1.removed).toEqual([]);
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(s2.prompts.length).toBe(0);
  expect(s2.mansionDeck).toEqual(base.mansionDeck);
});

test('Rebecca L2: trash any number of cards from hand (DONE chain)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cr', level: 2 as const, hand: ['am1', 'am2', 'w1'] } });
  const s1 = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
  expect(s1.prompts.length).toBe(1);
  expect(pr(s1).payload?.kind).toBe('trashFromHandAtWill');
  expect(pr(s1).options).toEqual(['am1', 'am2', 'w1', 'DONE']);
  // trash one, chain continues with the rest
  const s2 = applyAction(s1, { type: 'chooseOption', seat: 0, promptId: pr(s1).id, option: 0 });
  expect(s2.removed).toEqual(['am1']);
  expect(p0(s2).hand).toEqual(['am2', 'w1']);
  expect(s2.prompts.length).toBe(1);
  expect(pr(s2).options).toEqual(['am2', 'w1', 'DONE']);
  // DONE ends it
  const s3 = applyAction(s2, { type: 'chooseOption', seat: 0, promptId: pr(s2).id, option: 2 });
  expect(s3.removed).toEqual(['am1']);
  expect(s3.prompts.length).toBe(0);
});

test('Rebecca L2 is level-locked at level 1 (index 1)', () => {
  const base = baseState({ seat0: { characterInstanceId: 'cr', level: 1 as const, hand: ['am1'] } });
  expect(validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 })).toEqual({ ok: false, reason: 'useCharacterAbility: ability not unlocked' });
  // index 0 (generic L1) stays legal-but-noop
  expect(validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toEqual({ ok: true });
});

test('invalid action throws', () => {
  expect(() => applyAction(baseState({ seat0: { hand: ['zzz'] } }), { type: 'playActionCard', seat: 0, instanceId: 'zzz' })).toThrow('applyAction: playActionCard: unknown card: zzz');
  expect(() => applyAction(baseState(), { type: 'explore', seat: 0, weapons: [], exploreCount: 1 })).toThrow('applyAction: explore: no weapons');
});

test('startGame throws', () => {
  expect(() => applyAction(baseState(), { type: 'startGame', setup: { seed: 1, players: [{ name: 'a', controller: 'human' }] } })).toThrow('applyAction: startGame handled by game.ts setup');
});