import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * BC-001 Billy Coen — "Level 1: "Melee" weapons cost 10 gold less in your
 * turn. Level 2: All your "melee" weapons get +10 damage." (gates 2 / 5,
 * 70 Health).
 */

const BILLY = CUSTOM_CARDS.find(c => c.id === 'bc-001');

function billyGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'bc-001' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

/** Put a single-card market pile on the table for the buy tests. */
function withMarketCard(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#m${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'marketPile' as const, index: 0 } } };
  const marketPiles = { ...s.marketPiles, bc: { pileId: 'bc', cards: [id] } };
  return { state: { ...s, cards, marketPiles }, id };
}

function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck' as const, index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

describe('BC-001 Billy Coen data', () => {
  it('matches the printed card (70 HP, gates 2 / 5)', () => {
    expect(BILLY).toEqual(expect.objectContaining({
      id: 'bc-001', name: 'Billy Coen', type: 'character', set: 'custom', copies: 1,
      maxHp: 70, level1At: 2, level2At: 5,
    }));
    expect(BILLY?.abilities).toEqual([
      { kind: 'weaponBuyCostReduction', tag: 'melee', amount: 10, level: 1 },
      { kind: 'weaponTagPlusDamage', tag: 'melee', amount: 10, level: 2 },
    ]);
  });

  it('joins the deal pool only when the room selected it', () => {
    const off = setup(
      { seed: 11, players: [{ name: 'P', controller: 'human' }] },
      [...PREMIER_CARDS, ...CUSTOM_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(off.seats.some(p => p.characterInstanceId !== '' && off.cards[p.characterInstanceId]?.cardId === 'bc-001')).toBe(false);
  });
});

describe('BC-001 L1: melee weapons cost 10 gold less', () => {
  it('discounts a melee weapon at level 1', () => {
    const { state, id } = withMarketCard(
      billyGame({ level: 1, decorations: 2, turnGold: 15, buysLeft: 1 }),
      'we-003', // Submission: cost 20, weaponTags ['melee']
    );
    const next = applyAction(state, { type: 'buy', seat: 0, pileId: 'bc' });
    expect(next.seats[0]?.turnGold).toBe(15 - 10); // 20 - 10 discount
  });

  it('validate accepts a buy the player can only afford after the discount', () => {
    // Regression: the affordability check used the RAW cost, so a 20-cost
    // melee weapon discounted to 10 was rejected at exactly 10 gold.
    const { state, id } = withMarketCard(
      billyGame({ level: 1, decorations: 2, turnGold: 10, buysLeft: 1 }),
      'we-003',
    );
    const next = applyAction(state, { type: 'buy', seat: 0, pileId: 'bc' });
    expect(next.seats[0]?.turnGold).toBe(0);
  });

  it('does not discount a non-melee weapon', () => {
    const { state, id } = withMarketCard(
      billyGame({ level: 1, decorations: 2, turnGold: 15, buysLeft: 1 }),
      'we-009', // Handgun: cost 20, tags ['gun','pistol']
    );
    expect(() => applyAction(state, { type: 'buy', seat: 0, pileId: 'bc' })).toThrow();
    const rich = { ...state, seats: state.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 20 } : p)) };
    const next = applyAction(rich, { type: 'buy', seat: 0, pileId: 'bc' });
    expect(next.seats[0]?.turnGold).toBe(0); // paid full 20
  });
});

describe('BC-001 L2: all melee weapons get +10 damage', () => {
  function exploreWith(over: Partial<PlayerState>, weaponCardId: string, mansion: readonly string[]) {
    const base = billyGame(over);
    const { state, ids } = setMansionTop(base, mansion);
    const { state: s1, id: w } = addCard(state, 0, weaponCardId);
    const revealed = applyAction(s1, { type: 'explore', seat: 0, weapons: [w], exploreCount: 1 });
    return { revealed, mansionId: ids[0] };
  }

  it('a melee weapon defeats an infected it could not at base damage', () => {
    // Combat Knife we-004: 5 damage, melee. +10 => 15 >= ma-003's 15 HP.
    const { revealed, mansionId } = exploreWith(
      { level: 2, decorations: 5, hp: 80, turnAmmo: 0 },
      'we-004',
      ['ma-003'],
    );
    expect(revealed.seats[0]?.attached).toContain(mansionId);
  });

  it('the same weapon does NOT get the bonus at level 1', () => {
    const { revealed, mansionId } = exploreWith(
      { level: 1, decorations: 2, hp: 80, turnAmmo: 0 },
      'we-004',
      ['ma-003'],
    );
    expect(revealed.seats[0]?.attached).not.toContain(mansionId);
  });

  it('a non-melee weapon does not get the bonus', () => {
    // Handgun we-009: 10 damage, tags gun/pistol. +0 => 10 < ma-005's... use
    // ma-002 (20 HP) so base 10 does not defeat and +10 would have.
    const { revealed, mansionId } = exploreWith(
      { level: 2, decorations: 5, hp: 80, turnAmmo: 40 },
      'we-009',
      ['ma-002'],
    );
    expect(revealed.seats[0]?.attached).not.toContain(mansionId);
  });
});