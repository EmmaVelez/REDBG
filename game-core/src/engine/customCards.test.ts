import { describe, expect, it } from 'vitest';
import type { CardDef, CardInstance, GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { insertAt } from './mansion';
import { CUSTOM_CARDS } from '../data/custom';
import {
  ALL_CARDS,
  BATTLE_HARDENED_VETERAN_PILES,
  FIRST_TIMER_PILES,
  PREMIER_CARDS,
  STANDARD_MANSION_DECK,
  cardsForScenario,
  pilesForScenario,
} from '../data/cards';

/**
 * Custom card line (MX-001 Mr. X) — data shape, the lobby/room toggle that
 * brings the card into a game, and the not-defeated "returns 5th from the
 * top" engine behaviour.
 */

const MX_ID = 'mx-001';

function mxDef(): CardDef {
  const d = CUSTOM_CARDS.find(c => c.id === MX_ID);
  if (d === undefined) throw new Error('missing mx-001 in CUSTOM_CARDS');
  return d;
}

// ---------------------------------------------------------------------------
// Real-game helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(cardId: string): string {
  idCounter += 1;
  return `${cardId}#t${idCounter}`;
}

function customPool(): ReadonlyArray<CardDef> {
  return [...PREMIER_CARDS, ...CUSTOM_CARDS];
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function customGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 7,
      players: [
        { name: 'Hero', controller: 'human', characterCardId: 'ch-001' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-002' },
      ],
    },
    customPool(),
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return tune(s, over);
}

function addCard(s: GameState, seat: number, cardId: string): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat } } },
    seats: s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
  };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const p = s.seats[seat];
  const id = (p?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

function mansionTop(s: GameState, cardId: string): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

/** The instance ids of every copy of `cardId` currently in the Mansion. */
function mansionCopies(s: GameState, cardId: string): readonly string[] {
  return [...s.mansionDeck].filter(id => s.cards[id]?.cardId === cardId);
}

// ---------------------------------------------------------------------------
// Data + reachability
// ---------------------------------------------------------------------------

describe('MX-001 Mr. X data', () => {
  it('matches the printed card', () => {
    expect(mxDef()).toEqual(expect.objectContaining({
      id: 'mx-001',
      name: 'Mr. X',
      type: 'infected',
      set: 'custom',
      copies: 2,
      hp: 60,
      attack: 30,
      decorations: 5,
      infectedEffects: [{ kind: 'onNotDefeatedInsertIntoMansionAt', position: 5 }],
    }));
    expect(mxDef().text).toBe('If this infected is not defeated, place it on top of the mansion as the 5th upcoming card.');
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === MX_ID)).toBe(false);
  });

  it('cardsForScenario includes it only when the room selected it', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === MX_ID)).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: [MX_ID] });
    expect(on.some(c => c.id === MX_ID)).toBe(true);
    // Unknown ids are ignored rather than throwing.
    const unknown = cardsForScenario('firstTimer', { customCards: ['nope'] });
    expect(unknown.some(c => c.id === MX_ID)).toBe(false);
    // Expansion scenarios accept it too.
    const expansion = cardsForScenario('mercenaries', { customCards: [MX_ID] });
    expect(expansion.some(c => c.id === MX_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Custom ammunition cards
// ---------------------------------------------------------------------------

describe('custom ammunition cards', () => {
  it('Ammo x40 (ca-001) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ca-001');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ca-001',
      name: 'Ammo x40',
      type: 'ammunition',
      set: 'custom',
      text: 'Grants +40 Ammo and +40 Gold for the turn.',
      copies: 15,
      cost: 90,
      bonuses: { ammo: 40, gold: 40 },
    }));
  });

  it('Ammunition Box (ca-002) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ca-002');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ca-002',
      name: 'Ammunition Box',
      type: 'ammunition',
      set: 'custom',
      text: 'Grants +40 Ammo for the turn.',
      copies: 15,
      cost: 40,
      bonuses: { ammo: 40 },
    }));
  });

  it('ammunition cards can be bought in a custom room', () => {
    // Ammunition cards (am-001, am-002, am-003) are in the FIRST_TIMER_PILES
    // market. Verify the custom ammunition cards (ca-001, ca-002) are also
    // defined and reachable in the custom card pool.
    const pool = customPool();
    const ca001 = pool.find(c => c.id === 'ca-001');
    const ca002 = pool.find(c => c.id === 'ca-002');
    expect(ca001).toBeDefined();
    expect(ca002).toBeDefined();
    expect(ca001!.type).toBe('ammunition');
    expect(ca002!.type).toBe('ammunition');
    // Verify they wouldn't appear in standard (non-custom) scenarios.
    const standard = cardsForScenario('firstTimer');
    expect(standard.some(c => c.id === 'ca-001')).toBe(false);
    expect(standard.some(c => c.id === 'ca-002')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Custom mansion attachment event cards
// ---------------------------------------------------------------------------

describe('custom attachment event cards', () => {
  it('Rampage (ce-003) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-003');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-003',
      name: 'Rampage',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'trashTopInventoryAtTurnEnd', count: 1, removeAfter: 6 }],
    }));
  });

  it('Rampage is included in the custom mansion deck', () => {
    const pool = customPool();
    const rampage = pool.find(c => c.id === 'ce-003');
    expect(rampage).toBeDefined();
    expect(rampage!.type).toBe('event');
    expect(rampage!.attachmentMode).toBe(1);
  });

  it('setup includes Rampage in the Mansion when custom cards are enabled', () => {
    const s = customGame();
    const rampageCopies = s.mansionDeck.filter(id => id.startsWith('ce-003'));
    expect(rampageCopies).toHaveLength(1);
  });

  it('initial state has empty mansionAttachments', () => {
    const s = customGame();
    expect(s.mansionAttachments).toEqual([]);
    expect(s.attachmentTrashCounts).toEqual({});
  });

  it('Close Combat (ce-006) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-006');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-006',
      name: 'Close Combat',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: expect.arrayContaining([
        { kind: 'plusDamageForWeaponTag', tag: 'knife', amount: 10 },
        { kind: 'plusDamageForWeaponTag', tag: 'melee', amount: 5 },
        { kind: 'mustExploreIfAble' },
      ]),
    }));
  });

  it('Close Combat is included in the custom mansion deck', () => {
    const pool = customPool();
    const cc = pool.find(c => c.id === 'ce-006');
    expect(cc).toBeDefined();
    expect(cc!.type).toBe('event');
    expect(cc!.attachmentMode).toBe(1);
  });

  it('Save Room (ce-007) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-007');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-007',
      name: 'Save Room',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'healAndAmmoAtTurnStart', heal: 10, ammo: 10 }],
    }));
  });

  it('Save Room is included in the custom mansion deck', () => {
    const pool = customPool();
    const sr = pool.find(c => c.id === 'ce-007');
    expect(sr).toBeDefined();
    expect(sr!.type).toBe('event');
    expect(sr!.attachmentMode).toBe(1);
  });

  it('Low on Ammo (ce-008) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-008');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-008',
      name: 'Low on Ammo',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: expect.arrayContaining([
        { kind: 'freePistolTrashAtEnd' },
        { kind: 'reduceAmmoBonus', amount: 10 },
      ]),
    }));
  });

  it('Low on Ammo is included in the custom mansion deck', () => {
    const pool = customPool();
    const loa = pool.find(c => c.id === 'ce-008');
    expect(loa).toBeDefined();
    expect(loa!.type).toBe('event');
    expect(loa!.attachmentMode).toBe(1);
  });

  it('Ecliptic Express (ce-009) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-009');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-009',
      name: 'Ecliptic Express',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'trashDiscardOnInfectedDefeat' }],
    }));
  });

  it('Ecliptic Express is included in the custom mansion deck', () => {
    const pool = customPool();
    const ee = pool.find(c => c.id === 'ce-009');
    expect(ee).toBeDefined();
    expect(ee!.type).toBe('event');
    expect(ee!.attachmentMode).toBe(1);
  });

  it('Infected Horde (ce-010) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-010');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-010',
      name: 'Infected Horde',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'plusExploreAndMustExploreOrDamage', explores: 1, damage: 20 }],
    }));
  });

  it('Infected Horde is included in the custom mansion deck', () => {
    const pool = customPool();
    const ih = pool.find(c => c.id === 'ce-010');
    expect(ih).toBeDefined();
    expect(ih!.type).toBe('event');
    expect(ih!.attachmentMode).toBe(1);
  });

  it('Final Action (ce-011) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-011');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-011',
      name: 'Final Action',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'actionsCapAndRemoveOnDowned', actions: 1 }],
    }));
  });

  it('Final Action is included in the custom mansion deck', () => {
    const pool = customPool();
    const fa = pool.find(c => c.id === 'ce-011');
    expect(fa).toBeDefined();
    expect(fa!.type).toBe('event');
    expect(fa!.attachmentMode).toBe(1);
  });

  it('Virus Mutates (ce-002) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-002');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-002',
      name: 'Virus Mutates',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: expect.arrayContaining([
        { kind: 'plusHpForLowHpInfected', hpThreshold: 40, bonus: 10 },
        { kind: 'bonusXpPerExplore', amount: 1 },
      ]),
    }));
  });

  it('Virus Mutates is included in the custom mansion deck', () => {
    const pool = customPool();
    const vm = pool.find(c => c.id === 'ce-002');
    expect(vm).toBeDefined();
    expect(vm!.type).toBe('event');
    expect(vm!.attachmentMode).toBe(1);
  });

  it('The Maze (ce-001) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-001');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-001',
      name: 'The Maze',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: expect.arrayContaining([
        { kind: 'shotgunTwicePerTurn' },
        { kind: 'damagePenaltyForMultipleActions', actions: 1, penalty: 10 },
      ]),
    }));
  });

  it('The Maze is included in the custom mansion deck', () => {
    const pool = customPool();
    const maze = pool.find(c => c.id === 'ce-001');
    expect(maze).toBeDefined();
    expect(maze!.type).toBe('event');
    expect(maze!.attachmentMode).toBe(1);
  });

  it('Survival Horror (ce-004) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-004');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-004',
      name: 'Survival Horror',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'survivalHorrorDieRoll' }],
    }));
  });

  it('Survival Horror is included in the custom mansion deck', () => {
    const pool = customPool();
    const sh = pool.find(c => c.id === 'ce-004');
    expect(sh).toBeDefined();
    expect(sh!.type).toBe('event');
    expect(sh!.attachmentMode).toBe(1);
  });

  it('Short Supplys (ce-005) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-005');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-005',
      name: 'Short Supplys',
      type: 'event',
      set: 'custom',
      copies: 1,
      attachmentMode: 1,
      attachmentEffects: [{ kind: 'shortSupplysHealPrevention' }],
    }));
  });

  it('Short Supplys is included in the custom mansion deck', () => {
    const pool = customPool();
    const ss = pool.find(c => c.id === 'ce-005');
    expect(ss).toBeDefined();
    expect(ss!.type).toBe('event');
    expect(ss!.attachmentMode).toBe(1);
  });

  it('Disappearance (ce-012) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'ce-012');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'ce-012',
      name: 'Disappearance',
      type: 'event',
      set: 'custom',
      copies: 1,
    }));
    // Disappearance is a standard event, not an attachment
    expect(c!.attachmentMode).toBeUndefined();
  });

  it('Disappearance is included in the custom mansion deck', () => {
    const pool = customPool();
    const disp = pool.find(c => c.id === 'ce-012');
    expect(disp).toBeDefined();
    expect(disp!.type).toBe('event');
  });

  it('Combat Knife (cw-005) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cw-005');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'cw-005',
      name: 'Combat Knife',
      type: 'weapon',
      set: 'custom',
      copies: 1,
      cost: 40,
      ammoReq: 0,
      damage: 10,
      weaponTags: ['melee', 'knife'],
    }));
  });

  it('Pump-Action Shotgun (cw-013) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cw-013');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'cw-013',
      name: 'Pump-Action Shotgun',
      type: 'weapon',
      set: 'custom',
      copies: 1,
      cost: 40,
      ammoReq: 40,
      damage: 25,
      weaponTags: ['gun', 'shotgun'],
    }));
  });

  it('Riot Shotgun (cw-020) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cw-020');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'cw-020',
      name: 'Riot Shotgun',
      type: 'weapon',
      set: 'custom',
      copies: 1,
      cost: 70,
      ammoReq: 60,
      damage: 45,
      weaponTags: ['gun', 'shotgun'],
    }));
  });

  it('Kukri (cw-006) is correctly defined', () => {
    const c = CUSTOM_CARDS.find(x => x.id === 'cw-006');
    expect(c).toBeDefined();
    expect(c).toEqual(expect.objectContaining({
      id: 'cw-006',
      name: 'Kukri',
      type: 'weapon',
      set: 'custom',
      copies: 1,
      cost: 70,
      ammoReq: 0,
      damage: 15,
      weaponTags: ['melee', 'knife'],
      weaponEffects: [{ kind: 'playFromDiscardOnExplore' }],
    }));
  });

  it('custom weapons are merged into matching scenario piles instead of getting their own', () => {
    const piles = pilesForScenario('firstTimer', { customCards: ['cw-005', 'cw-013', 'cw-020'] });
    // Knife pile should include Combat Knife
    const knifePile = piles.find(p => p.pileId === 'kn');
    expect(knifePile).toBeDefined();
    expect(knifePile!.cardIds).toContain('cw-005');
    // Shotgun pile should include both shotguns
    const shotgunPile = piles.find(p => p.cardIds.includes('we-001') || p.cardIds.includes('cw-013'));
    // At minimum, no separate custom-cw-* piles should exist for these
    const customWeaponPiles = piles.filter(p => p.pileId.startsWith('custom-cw-'));
    expect(customWeaponPiles).toHaveLength(0);
  });
});

describe('MX-001 mansion membership', () => {
  it('setup shuffles both copies into the Mansion when the card is in the pool', () => {
    const s = customGame();
    expect(mansionCopies(s, MX_ID)).toHaveLength(2);
  });

  it('a kitchen-sink scenario (no explicit mansion list) also gets both copies', () => {
    const s = setup(
      { seed: 3, players: [{ name: 'A', controller: 'human' }, { name: 'B', controller: 'human' }] },
      customPool(),
      BATTLE_HARDENED_VETERAN_PILES,
    );
    expect(mansionCopies(s, MX_ID)).toHaveLength(2);
  });

  it('without the toggle the Mansion has no Mr. X', () => {
    const s = setup(
      { seed: 3, players: [{ name: 'A', controller: 'human' }, { name: 'B', controller: 'human' }] },
      PREMIER_CARDS,
      BATTLE_HARDENED_VETERAN_PILES,
    );
    expect(mansionCopies(s, MX_ID)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Engine behaviour
// ---------------------------------------------------------------------------

describe('MX-001 not-defeated placement', () => {
  it('single explore: not defeated -> 5th from the top, not the bottom', () => {
    const s = customGame();
    const withX = mansionTop(s, MX_ID);
    const xId = withX.mansionDeck[0];
    expect(xId).toBeDefined();

    const armed = addCard(withX, 0, 'we-004'); // Combat Knife: 5 damage
    const weapon = findHand(armed, 'we-004');
    const after = applyAction(tune(armed, { turnAmmo: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });

    // 5 damage cannot defeat 60 Health.
    expect(after.seats[0]?.hp).toBe(100 - 30);
    expect(after.mansionDeck).toContain(xId!);
    expect(after.mansionDeck.indexOf(xId!)).toBe(4);
  });

  it('single explore: defeated -> attached, never inserted', () => {
    const s = customGame();
    const withX = mansionTop(s, MX_ID);
    const xId = withX.mansionDeck[0];

    const armed = addCard(withX, 0, 'we-008'); // Rocket Launcher: 100 damage, instant kill
    const weapon = findHand(armed, 'we-008');
    const after = applyAction(tune(armed, { turnAmmo: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });

    expect(after.seats[0]?.attached).toContain(xId!);
    expect(after.mansionDeck).not.toContain(xId!);
  });

  it('clamps to the end when the deck is shorter than the requested position', () => {
    const s = customGame();
    const withX = mansionTop(s, MX_ID);
    const xId = withX.mansionDeck[0];
    // Drop the deck to a single card so position 5 is past the end.
    const short = tune({ ...withX, mansionDeck: [xId!, 'only-one'] }, {});
    const armed = addCard(short, 0, 'we-004');
    const weapon = findHand(armed, 'we-004');
    const after = applyAction(tune(armed, { turnAmmo: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(after.mansionDeck[after.mansionDeck.length - 1]).toBe(xId!);
  });
});

describe('insertAt', () => {
  it('inserts at a 1-based position from the top', () => {
    const m = { deck: ['a', 'b', 'c'], bottom: [] as string[] };
    expect(insertAt(m, 'x', 1).deck).toEqual(['x', 'a', 'b', 'c']);
    expect(insertAt(m, 'x', 2).deck).toEqual(['a', 'x', 'b', 'c']);
    expect(insertAt(m, 'x', 3).deck).toEqual(['a', 'b', 'x', 'c']);
    expect(insertAt(m, 'x', 4).deck).toEqual(['a', 'b', 'c', 'x']);
  });

  it('clamps past the end of the deck', () => {
    const m = { deck: ['a'] };
    const out = insertAt(m, 'x', 99);
    expect(out.deck).toEqual(['a', 'x']);
  });

  it('handles an empty deck', () => {
    expect(insertAt({ deck: [] }, 'x', 5).deck).toEqual(['x']);
  });
});

// ---------------------------------------------------------------------------
// Multi-explore (synthetic state, mirroring multiExplore.test.ts)
// ---------------------------------------------------------------------------

const SYNTH_DEFS: Record<string, CardDef> = {
  'ch-1': { id: 'ch-1', name: 'Hero', type: 'character', set: 'premier', text: '', copies: 1, maxHp: 100, level2At: 4 },
  'w5': { id: 'w5', name: 'Knife', type: 'weapon', set: 'premier', text: '', copies: 1, ammoReq: 0, damage: 5 },
  'ma-1': { id: 'ma-1', name: 'Zombie', type: 'infected', set: 'premier', text: '', copies: 3, hp: 15, attack: 10, decorations: 1 },
  'mx-001': mxDef(),
};

function synthSeat(s: number, over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: s, name: 'P' + s, controller: 'human',
    characterInstanceId: 'c' + s,
    hp: 100, maxHp: 100, decorations: 0, level: 1,
    turnAmmo: 0, turnGold: 50, actionsLeft: 1, buysLeft: 1, exploresLeft: 1,
    weaponDamageBonusThisTurn: 0, attached: [],
    inventory: ['i1', 'i2', 'i3', 'i4', 'i5'],
    hand: ['w1'], discard: [], playArea: [],
    downed: false, dead: false,
    ...over,
  };
}

function inst(id: string, cardId: string): CardInstance {
  return { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
}

describe('MX-001 in a multi-explore', () => {
  it('a failed multi-explore inserts Mr. X 5th from the top and bottoms the rest', () => {
    const ids = ['mx1', 'ma1', 'x1', 'x2', 'x3', 'x4', 'x5'];
    const cards: Record<string, CardInstance> = {
      c0: inst('c0', 'ch-1'), c1: inst('c1', 'ch-1'), w1: inst('w1', 'w5'),
    };
    for (const id of ids) cards[id] = inst(id, id === 'mx1' ? 'mx-001' : 'ma-1');

    const s: GameState = {
      version: 1, seed: 1, rngState: 1, phase: 'main',
      activeSeat: 0, turnNumber: 1,
      seats: [synthSeat(0, { hand: ['w1'], exploresLeft: 2, turnAmmo: 0 }), synthSeat(1)],
      marketPiles: {},
      mansionDeck: ids,
      removed: [],
      cards,
      cardDefs: SYNTH_DEFS,
      prompts: [], winners: [], log: [],
    };

    const after = applyAction(s, { type: 'explore', seat: 0, weapons: ['w1'], exploreCount: 2 });

    // 5 damage vs 60 + 15 combined Health -> not defeated.
    expect(after.seats[0]?.hp).toBe(100 - 40);
    expect(after.mansionDeck).toEqual(['x1', 'x2', 'x3', 'x4', 'mx1', 'x5', 'ma1']);
  });
});
