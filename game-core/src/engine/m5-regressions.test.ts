import { describe, test, expect } from 'vitest';
import { setup, startTurn } from './game';
import { dropEmptyPrompts } from './prompts';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { GameState } from '../types';

/**
 * M5-T04 regressions — the defects the full-game bot soak exposed.
 *
 * The soak (src/ai/soak.test.ts) proves the invariants hold across every
 * scenario; these tests pin the individual mechanisms so a future change gets
 * a named, targeted failure instead of a soak that merely goes red.
 */

const human = (name: string) => ({ name, controller: 'human' as const });

describe('M5-T04 regressions', () => {
  test('setup deals seat-unique starting-deck instance ids', () => {
    const s = setup(
      { seed: 1, players: [human('A'), human('B'), human('C'), human('D')] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    );
    const ids = s.seats.flatMap(p => [...p.hand, ...p.inventory]);
    // 10 cards per seat x 4 seats, and no id may name two physical cards.
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(ids.length);
    // every dealt card is registered exactly once
    for (const id of ids) expect(s.cards[id]).toBeDefined();
    expect(new Set(Object.keys(s.cards)).size).toBe(Object.keys(s.cards).length);
  });

  test('revive draws 5 with a reshuffle and conserves cards held while downed', () => {
    const base = setup({ seed: 1, players: [human('A'), human('B')] }, PREMIER_CARDS, FIRST_TIMER_PILES);
    const seat0 = base.seats[0];
    expect(seat0).toBeDefined();
    const s0 = seat0 as NonNullable<typeof seat0>;

    const inventory = [...s0.inventory];
    const shortInventory = inventory.slice(0, 2);
    const discard = inventory.slice(2);
    // A downed character should hold nothing, but an effect can still give it
    // cards; they must not be destroyed by the revive redraw.
    const strayId = 'am-001#stray';
    const downedState: GameState = {
      ...base,
      activeSeat: 0,
      cards: {
        ...base.cards,
        [strayId]: { instanceId: strayId, cardId: 'am-001', location: { zone: 'hand', index: 0, seat: 0 } },
      },
      seats: base.seats.map((p, i) =>
        i === 0
          ? { ...p, downed: true, dead: false, hand: [strayId], inventory: shortInventory, discard, playArea: [] }
          : p,
      ),
    };

    const after = startTurn(downedState);
    const revived = after.seats[0];
    expect(revived).toBeDefined();
    const r = revived as NonNullable<typeof revived>;

    // rulebook: draw 5, reshuffling the discard when the inventory runs short
    expect(r.hand).toHaveLength(5);
    expect(r.downed).toBe(false);

    // every card is accounted for — the stray hand card included
    const total = r.hand.length + r.inventory.length + r.discard.length;
    expect(total).toBe(shortInventory.length + discard.length + 1);
    expect([...r.hand, ...r.inventory, ...r.discard]).toContain(strayId);
  });

  test('a card listed by two piles gets distinct instances (no shared id)', () => {
    const piles = [
      { pileId: 'pile-a', cardIds: ['we-004'] },
      { pileId: 'pile-b', cardIds: ['we-004'] },
    ];
    const s = setup({ seed: 1, players: [human('A')] }, PREMIER_CARDS, piles);
    const a = s.marketPiles['pile-a']?.cards ?? [];
    const b = s.marketPiles['pile-b']?.cards ?? [];
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // Both piles are full, and no instance appears in both.
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  test('dropEmptyPrompts removes zero-option prompts (the deadlock choke point)', () => {
    const base = setup({ seed: 1, players: [human('A'), human('B')] }, PREMIER_CARDS, FIRST_TIMER_PILES);

    // A zero-option prompt gates every action behind "resolve pending prompt
    // first" but can never be answered — the seat is stuck forever.
    const deadlocked: GameState = {
      ...base,
      prompts: [{ id: 'p1', seat: 0, text: 'Nothing to choose', options: [], payload: { kind: 'x' } }],
    };
    expect(dropEmptyPrompts(deadlocked).prompts).toEqual([]);

    // A real prompt is untouched.
    const real: GameState = {
      ...base,
      prompts: [{ id: 'p1', seat: 0, text: 'Pick one', options: ['a', 'b'], payload: { kind: 'x' } }],
    };
    expect(dropEmptyPrompts(real).prompts).toHaveLength(1);

    // Turn-start prompts go through the same choke point.
    expect(startTurn(deadlocked).prompts).toEqual([]);
  });
});
