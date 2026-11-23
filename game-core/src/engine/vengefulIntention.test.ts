import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { ALL_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * AC-040 Vengeful Intention (Nightmare):
 *   "You get +2 cards. Your character takes 10 damage. You may play as many
 *    actions as you like this turn. Each time you play another action this
 *    turn, your character takes 10 damage."
 *
 * The last clause shipped as data only — `damagePerAdditionalActionThisTurn`
 * was written and initialised but had no reader. It is a COST, not a choice,
 * so it resolves automatically with no prompt.
 */

let counter = 0;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'A', controller: 'human' as const, characterCardId: 'ch-002' },
        { name: 'B', controller: 'human' as const, characterCardId: 'ch-001' },
      ],
    },
    ALL_CARDS,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(
  s: GameState,
  seat: number,
  cardId: string,
  zone: 'hand' | 'playArea' = 'hand',
): { state: GameState; id: string } {
  const id = `${cardId}#v${++counter}`;
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } },
      seats: s.seats.map((p, i) => (i !== seat ? p : {
        ...p,
        hand: zone === 'hand' ? [...p.hand, id] : p.hand,
        playArea: zone === 'playArea' ? [...p.playArea, id] : p.playArea,
      })),
    },
    id,
  };
}

const hp = (s: GameState, seat = 0) => (s.seats[seat] as PlayerState).hp;

describe('AC-040 Vengeful Intention — arming', () => {
  it('charges only its own printed 10 and arms the per-action damage', () => {
    let s = game({ level: 1, hp: 80, maxHp: 80, turnGold: 100, buysLeft: 1, actionsLeft: 3 });
    const ac = place(s, 0, 'ac-040');
    s = ac.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: ac.id });
    // Only the printed "Your character takes 10 damage" — never the armed cost.
    expect(hp(s)).toBe(70);
    expect((s.seats[0] as PlayerState).damagePerAdditionalActionThisTurn).toBe(10);
    expect((s.seats[0] as PlayerState).actionsLeft).toBe(999);
  });
});

describe('AC-040 Vengeful Intention — per-action charge', () => {
  it('deals the armed damage for every further action played this turn', () => {
    let s = game({ level: 1, hp: 80, maxHp: 80, turnGold: 100, buysLeft: 1, actionsLeft: 3 });
    const ac = place(s, 0, 'ac-040');
    s = ac.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: ac.id });
    expect(hp(s)).toBe(70);

    const a1 = place(s, 0, 'ac-001');
    s = a1.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: a1.id });
    expect(hp(s)).toBe(60);

    const a2 = place(s, 0, 'ac-006');
    s = a2.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: a2.id });
    expect(hp(s)).toBe(50);
  });

  it('does not charge other seats', () => {
    let s = game({ level: 1, hp: 80, maxHp: 80, turnGold: 100, buysLeft: 1, actionsLeft: 3 });
    const ac = place(s, 0, 'ac-040');
    s = ac.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: ac.id });

    // Seat 1's own turn: its actions cost it nothing, and seat 0's armed
    // field survives untouched (it is per-seat, not a global flag).
    let t = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));
    expect((t.seats[0] as PlayerState).damagePerAdditionalActionThisTurn).toBe(10);
    const before = hp(t, 1);
    const b = place(t, 1, 'ac-001');
    t = b.state;
    t = applyAction(t, { type: 'playActionCard', seat: 1, instanceId: b.id });
    expect(hp(t, 1)).toBe(before);
    expect((t.seats[0] as PlayerState).damagePerAdditionalActionThisTurn).toBe(10);
  });
});

describe('AC-040 Vengeful Intention — turn scope', () => {
  it('clears at the next turn, so the first action of that turn is free', () => {
    let s = game({ level: 1, hp: 80, maxHp: 80, turnGold: 100, buysLeft: 1, actionsLeft: 3 });
    const ac = place(s, 0, 'ac-040');
    s = ac.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: ac.id });
    expect((s.seats[0] as PlayerState).damagePerAdditionalActionThisTurn).toBe(10);

    let t = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));   // seat 1
    t = startTurn(applyAction(t, { type: 'endTurn', seat: 1 }));       // back to seat 0
    expect((t.seats[0] as PlayerState).damagePerAdditionalActionThisTurn).toBe(0);

    const before = hp(t);
    const a = place(t, 0, 'ac-001');
    t = a.state;
    t = applyAction(t, { type: 'playActionCard', seat: 0, instanceId: a.id });
    expect(hp(t)).toBe(before);
  });
});
