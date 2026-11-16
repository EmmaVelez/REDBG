import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * ch-005q Jill Valentine (official custom print, printed code CH-005 variant —
 * the third custom carrier of that code, so the internal id is ch-005q).
 *   CH-005q  80 Health, gates 5 / 9
 *    L1: Jill deals an additional +5 Damage for every Action Card she discards
 *        this turn. (Action Cards played do not count.)
 *    L2: At the end of a turn, Jill can choose up to 3 cards to keep and draws
 *        till she has 5.
 */

const Q = 'ch-005q';

function game(over: Partial<PlayerState> = {}, seatCount = 2): GameState {
  const players = Array.from({ length: seatCount }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? Q : 'ch-003',
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

/** Replace Jill's hand with the given card ids; returns the registered ids. */
function hand(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const ids = cardIds.map(cardId => `${cardId}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0 } };
  }
  return {
    state: { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) },
    ids,
  };
}

/** Put a card id at the top of the mansion (registered instance). */
function topOfMansion(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#top${++counter}`;
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck' as const, index: 0 } } },
      mansionDeck: [id, ...s.mansionDeck],
    },
    id,
  };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

describe('ch-005q Jill L1 — +5 per Action card discarded this turn', () => {
  it('adds amount x discards to explore damage (preview and resolve)', () => {
    // Level 1 (level1At 5). Two Action cards already discarded this turn.
    const { state: s } = hand(game({ level: 1, decorations: 5, turnAmmo: 50, actionsDiscardedThisTurn: 2 }), ['we-004']);
    const { state: armed } = topOfMansion(s, 'ma-005'); // Bui Kichwa 10 HP / 10 attack
    const knife = s.seats[0]!.hand[0]!;
    // Combat Knife 5 + 2 Action discards x 5 = 15 >= 10 -> defeated.
    expect(exploreDamage(armed, 0, [knife])).toBe(5 + 10);
    const r = applyAction(armed, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1, leader: 'main' });
    expect(r.seats[0]?.attached.includes(armed.mansionDeck[0]!)).toBe(true);
  });

  it('does NOT count Action cards played (they sit in the play area)', () => {
    const { state: s } = hand(game({ level: 1, decorations: 5, turnAmmo: 50 }), ['we-004']);
    const { state: armed } = topOfMansion(s, 'ma-004'); // Zombie Butcher 25 HP
    const knife = s.seats[0]!.hand[0]!;
    expect(exploreDamage(armed, 0, [knife])).toBe(5);
    const r = applyAction(armed, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1, leader: 'main' });
    expect(r.seats[0]?.attached.includes(armed.mansionDeck[0]!)).toBe(false);
  });

  it('the discard-diff hook counts Action cards that join the discard pile', () => {
    // Level-1 Jill ends her turn with an Action card in hand: the end-of-turn
    // discard moves it to the pile and the diff counts it.
    const { state: s } = hand(game({ level: 1, decorations: 5 }), ['ac-001']);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(ended.seats[0]?.actionsDiscardedThisTurn ?? 0).toBe(1);
    // A weapon in hand does not increment the counter.
    const { state: s2 } = hand(game({ level: 1, decorations: 5 }), ['we-004']);
    const ended2 = applyAction(s2, { type: 'endTurn', seat: 0 });
    expect(ended2.seats[0]?.actionsDiscardedThisTurn ?? 0).toBe(0);
  });
});

describe('ch-005q Jill L2 — end of turn: keep up to 3, draw to 5', () => {
  it('raises the retention prompt instead of discarding, and does not advance the turn', () => {
    const { state: s } = hand(game({ level: 2, decorations: 10 }), ['ac-001', 'ac-002', 'we-004', 'it-001', 'we-005', 'am-001']);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    const p = findPrompt(ended, 'jillEndOfTurnKeep');
    expect(p).toBeDefined();
    expect(ended.activeSeat).toBe(0); // turn not advanced while prompting
    expect(ended.seats[0]?.hand).toHaveLength(6); // nothing discarded yet
    // The options are the hand cards + None.
    expect(p?.options).toHaveLength(7);
    expect(p?.options[6]).toBe('None');
  });

  it('keeps chosen cards through the pick loop and draws back to 5 on None', () => {
    const { state: s } = hand(game({ level: 2, decorations: 10, discard: ['am-001#d1'] }), ['ac-001', 'ac-002', 'we-004', 'it-001', 'we-005', 'am-001']);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    const p1 = findPrompt(ended, 'jillEndOfTurnKeep');
    expect(p1).toBeDefined();
    const keepId = p1?.options[2] ?? ''; // third hand card (we-004)
    const pick1 = applyAction(ended, { type: 'chooseOption', seat: 0, promptId: p1?.id ?? '', option: 2 });
    const p2 = findPrompt(pick1, 'jillEndOfTurnKeep');
    expect(p2).toBeDefined();
    expect(p2?.options).toHaveLength(6); // 5 remaining + None
    // None -> finalize: keep 1, discard the rest, draw back to 5.
    const none = applyAction(pick1, { type: 'chooseOption', seat: 0, promptId: p2?.id ?? '', option: p2!.options.length - 1 });
    expect(none.prompts.filter(pr => pr.payload?.kind === 'jillEndOfTurnKeep')).toHaveLength(0);
    const seat = none.seats[0]!;
    expect(seat.hand).toHaveLength(5);
    expect(seat.hand.includes(keepId)).toBe(true); // kept card still in hand
    expect(seat.discard.includes(keepId)).toBe(false); // and NOT in the discard
    expect(seat.discard).toHaveLength(6); // 5 dropped hand cards + the preset am-001
    expect(seat.pendingKeepEndOfTurn).toBeUndefined();
    expect(none.activeSeat).toBe(1); // turn finally advanced
  });

  it('auto-keeps everything when the hand is at/under the keep limit (no prompt)', () => {
    const { state: s, ids } = hand(game({ level: 2, decorations: 10, discard: ['am-001#d1'] }), ['ac-001', 'it-001']);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(findPrompt(ended, 'jillEndOfTurnKeep')).toBeUndefined();
    const seat = ended.seats[0]!;
    expect(seat.hand).toHaveLength(5); // both kept + 3 drawn
    expect(seat.hand.includes(ids[0]!)).toBe(true);
    expect(seat.hand.includes(ids[1]!)).toBe(true);
    expect(seat.discard.filter(id => !id.startsWith('am-001'))).toHaveLength(0); // neither kept card discarded
    expect(ended.activeSeat).toBe(1);
  });

  it('finalizes automatically when the keep limit is reached', () => {
    const { state: s } = hand(game({ level: 2, decorations: 10, discard: ['am-001#d1'] }), ['ac-001', 'ac-002', 'we-004', 'it-001', 'we-005', 'am-001']);
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    let current = ended;
    for (let pick = 0; pick < 3; pick++) {
      const p = findPrompt(current, 'jillEndOfTurnKeep');
      expect(p).toBeDefined();
      current = applyAction(current, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: pick });
    }
    expect(findPrompt(current, 'jillEndOfTurnKeep')).toBeUndefined();
    const seat = current.seats[0]!;
    expect(seat.hand).toHaveLength(5); // 3 kept + 2 drawn
    expect(seat.pendingKeepEndOfTurn).toBeUndefined();
    expect(current.activeSeat).toBe(1);
  });
});