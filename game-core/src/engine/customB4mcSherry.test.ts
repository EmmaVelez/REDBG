import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { applyHealTracking } from './abilities';
import { validateAction } from './validate';
import { cardsForScenario, pilesForScenario, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * B4MC-CH-004..006 — three JP-2025 Sherry Birkin promo prints. The printed
 * codes collide with official CH-004..CH-006, so the family prefix keeps the
 * ids distinct.
 */

const CUSTOM_IDS = ['b4mc-ch-004', 'b4mc-ch-005', 'b4mc-ch-006'] as const;

let counter = 0;
function nextId(cardId: string): string {
  counter += 1;
  return `${cardId}#t${counter}`;
}

function b4mcGame(characterCardId: string, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 5,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-002' },
      ],
    },
    cardsForScenario('firstTimer', { customCards: [...CUSTOM_IDS] }),
    pilesForScenario('firstTimer', { customCards: [...CUSTOM_IDS] }),
    STANDARD_MANSION_DECK,
  );
  return tune(s, { level: 2, decorations: 10, ...over });
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' = 'hand'): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } },
    seats: s.seats.map((p, i) => (i !== seat ? p : { ...p, [zone]: [...p[zone], id] })),
  };
}

function handWeapon(s: GameState, seat = 0): string {
  const p = s.seats[seat]!;
  const id = p.hand.find(h => s.cardDefs[s.cards[h]!.cardId]?.type === 'weapon');
  if (id === undefined) throw new Error('no weapon in hand');
  return id;
}

describe('B4MC Sherry Birkin data', () => {
  it('has the three printed cards with their stats and level requirements', () => {
    const defs = new Map(
      cardsForScenario('firstTimer', { customCards: [...CUSTOM_IDS] }).map(c => [c.id, c]),
    );
    const four = defs.get('b4mc-ch-004');
    const five = defs.get('b4mc-ch-005');
    const six = defs.get('b4mc-ch-006');
    expect(four).toMatchObject({ name: 'Sherry Birkin', maxHp: 100, level1At: 2, level2At: 5 });
    expect(five).toMatchObject({ name: 'Sherry Birkin', maxHp: 100, level1At: 0, level2At: 7 });
    expect(six).toMatchObject({ name: 'Sherry Birkin', maxHp: 90, level1At: 4 });
    expect(six?.level2At).toBeUndefined();
    expect(four?.levels?.[1]?.text).toBe('Sherry does +5 Damage for each Character that has been Healed this turn.');
    expect(five?.levels?.[0]?.text).toContain('shuffle 1 "Stun Rod" into your Inventory');
  });

  it('pulls the official Stun Rod into the def pool as a dependency', () => {
    const ids = new Set(
      cardsForScenario('firstTimer', { customCards: ['b4mc-ch-005'] }).map(c => c.id),
    );
    expect(ids.has('we-028')).toBe(true);
  });
});

describe('B4MC-CH-004', () => {
  it('L1 heals her 10 at the start of each turn', () => {
    const s = tune(b4mcGame('b4mc-ch-004'), { level: 1, hp: 50, maxHp: 100 });
    const next = startTurn(s);
    expect(next.seats[0]?.hp).toBe(60);
  });

  it('L1 does nothing at level 0 (ability locked)', () => {
    const s = tune(b4mcGame('b4mc-ch-004'), { level: 0, hp: 50, maxHp: 100 });
    const next = startTurn(s);
    expect(next.seats[0]?.hp).toBe(50);
  });

  it('L2 gives +5 per Character healed this turn', () => {
    // hp 90 so her own L1 heal actually raises Health and counts.
    const s = tune(b4mcGame('b4mc-ch-004'), { level: 2, hp: 90 });
    const weapon = handWeapon(s);
    const base = exploreDamage(s, 0, [weapon]);
    // Sherry's own L1 heal at turn start counts as one healed Character.
    const healed = startTurn(s);
    expect(healed.healedCharactersThisTurn).toEqual(['0:main']);
    expect(exploreDamage(healed, 0, [weapon])).toBe(base + 5);
    // A partner healed too makes it two.
    const two = { ...healed, healedCharactersThisTurn: ['0:main', '0:partner'] };
    expect(exploreDamage(two, 0, [weapon])).toBe(base + 10);
  });

  it('the heal tracker records a Main and a Partner heal once each', () => {
    const s = b4mcGame('b4mc-ch-004');
    const before = tune(s, { hp: 40, partnerInstanceId: 'ch-002#p1', partnerHp: 40, partnerMaxHp: 80 });
    const after = tune(before, { hp: 50, partnerHp: 60 });
    expect(applyHealTracking(before, after).healedCharactersThisTurn).toEqual(['0:main', '0:partner']);
    // No rise -> nothing recorded.
    expect(applyHealTracking(before, before).healedCharactersThisTurn).toBeUndefined();
  });
});

describe('B4MC-CH-005', () => {
  it('shuffles a Stun Rod into the Inventory at setup (Main)', () => {
    const s = b4mcGame('b4mc-ch-005');
    expect(s.seats[0]?.inventory.some(id => s.cards[id]?.cardId === 'we-028')).toBe(true);
  });

  it('shuffles a Stun Rod in when she is the PARTNER', () => {
    const s = setup(
      {
        seed: 9,
        players: [
          { name: 'Hero', controller: 'human', characterCardId: 'ch-002', partnerCharacterId: 'b4mc-ch-005' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer', { customCards: [...CUSTOM_IDS] }),
      pilesForScenario('firstTimer', { customCards: [...CUSTOM_IDS] }),
      STANDARD_MANSION_DECK,
    );
    expect(s.seats[0]?.inventory.some(id => s.cards[id]?.cardId === 'we-028')).toBe(true);
  });

  it('L1: the manual charge costs 1 Action and adds +10 to a Stun Rod explore', () => {
    let s = tune(b4mcGame('b4mc-ch-005'), { level: 1 });
    s = addCard(s, 0, 'we-028');
    const rod = s.seats[0]!.hand.find(id => s.cards[id]?.cardId === 'we-028')!;
    const base = exploreDamage(s, 0, [rod]);
    expect(base).toBe(10);

    const actionsBefore = s.seats[0]!.actionsLeft;
    const charged = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(charged.seats[0]?.actionsLeft).toBe(actionsBefore - 1);
    expect(charged.seats[0]?.stunRodCharged).toBe(true);
    expect(exploreDamage(charged, 0, [rod])).toBe(base + 10);

    // Once per turn: the second activation is rejected.
    const again = validateAction(charged, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(again.ok).toBe(false);
  });

  it('L1: charging with no Action to spend is rejected', () => {
    const s = tune(b4mcGame('b4mc-ch-005'), { level: 1, actionsLeft: 0 });
    const res = validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(res.ok).toBe(false);
  });

  it('L2: +10 while she is at full Health, nothing when wounded', () => {
    let s = tune(b4mcGame('b4mc-ch-005'), { level: 2, hp: 100 });
    s = addCard(s, 0, 'we-028');
    const rod = s.seats[0]!.hand.find(id => s.cards[id]?.cardId === 'we-028')!;
    expect(exploreDamage(s, 0, [rod])).toBe(20);
    const wounded = tune(s, { hp: 90 });
    expect(exploreDamage(wounded, 0, [rod])).toBe(10);
  });
});

describe('B4MC-CH-006', () => {
  it('L1 heals 10 at turn start', () => {
    const s = tune(b4mcGame('b4mc-ch-006'), { level: 1, hp: 50, maxHp: 90 });
    expect(startTurn(s).seats[0]?.hp).toBe(60);
  });

  it('L1: at full Health she gets +10 Damage this turn INSTEAD', () => {
    let s = tune(b4mcGame('b4mc-ch-006'), { level: 1, hp: 90, maxHp: 90 });
    s = addCard(s, 0, 'we-009');
    const next = startTurn(s);
    expect(next.seats[0]?.hp).toBe(90);
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
    const gun = next.seats[0]!.hand.find(id => next.cards[id]?.cardId === 'we-009')!;
    expect(exploreDamage(next, 0, [gun])).toBe(20);
  });
});

describe('B4MC reachability', () => {
  it('the characters are legal mains and partners', () => {
    for (const id of CUSTOM_IDS) {
      const def = cardsForScenario('firstTimer', { customCards: [id] }).find(c => c.id === id) as CardDef;
      expect(def.type).toBe('character');
    }
    // A game with all three selected sets up without throwing.
    expect(() => b4mcGame('b4mc-ch-004')).not.toThrow();
  });
});
