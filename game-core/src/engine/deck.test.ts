import { describe, it, expect } from 'vitest';
import { draw, drawWithReshuffle, discardFromHand, discardHand } from './deck';

describe('draw', () => {
  it('draws 2 from a 5-card deck', () => {
    const result = draw({
      deck: ['A', 'B', 'C', 'D', 'E'],
      discard: [],
      reshuffledDiscard: [],
      count: 2,
    });
    expect(result.hand).toEqual(['A', 'B']);
    expect(result.deck).toEqual(['C', 'D', 'E']);
    expect(result.discard).toEqual([]);
  });

  it('draw with count 0 returns the same contents', () => {
    const result = draw({
      deck: ['A', 'B', 'C'],
      discard: [],
      reshuffledDiscard: [],
      count: 0,
    });
    expect(result.hand).toEqual([]);
    expect(result.deck).toEqual(['A', 'B', 'C']);
    expect(result.discard).toEqual([]);
  });

  it('draws 3 when deck has 1 card and reshuffledDiscard has 4', () => {
    const result = draw({
      deck: ['A'],
      discard: [],
      reshuffledDiscard: ['B', 'C', 'D', 'E'],
      count: 3,
    });
    expect(result.hand).toEqual(['A', 'B', 'C']);
    expect(result.deck).toEqual(['D', 'E']);
    expect(result.discard).toEqual([]);
  });

  it('draws 5 when deck has 1 and reshuffledDiscard has 2', () => {
    const result = draw({
      deck: ['A'],
      discard: [],
      reshuffledDiscard: ['B', 'C'],
      count: 5,
    });
    expect(result.hand).toEqual(['A', 'B', 'C']);
    expect(result.deck).toEqual([]);
    expect(result.discard).toEqual([]);
  });

  it('draw does not mutate input arrays', () => {
    const deck: string[] = ['A', 'B', 'C'];
    const discard: string[] = [];
    const reshuffledDiscard: string[] = [];
    const count = 2;

    Object.freeze(deck);
    Object.freeze(discard);
    Object.freeze(reshuffledDiscard);

    const result = draw({ deck, discard, reshuffledDiscard, count });

    expect(result.hand).toEqual(['A', 'B']);
    expect(result.deck).toEqual(['C']);
    expect(result.discard).toEqual([]);
  });
});

describe('discardFromHand', () => {
  it('moves one card to end of discard and removes it from hand', () => {
    const result = discardFromHand({
      hand: ['A', 'B', 'C'],
      discard: [],
      instanceIds: ['B'],
    });
    expect(result.hand).toEqual(['A', 'C']);
    expect(result.discard).toEqual(['B']);
  });

  it('throws for a card not in hand', () => {
    expect(() =>
      discardFromHand({
        hand: ['A', 'B', 'C'],
        discard: [],
        instanceIds: ['D'],
      })
    ).toThrow('discardFromHand: card not in hand: D');
  });
});

describe('discardHand', () => {
  it('moves all cards preserving order, leaves hand empty', () => {
    const result = discardHand({
      hand: ['A', 'B', 'C'],
      discard: [],
    });
    expect(result.hand).toEqual([]);
    expect(result.discard).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate inputs', () => {
      const hand: string[] = ['A', 'B', 'C'];
      const discard: string[] = [];

      Object.freeze(hand);
      Object.freeze(discard);

      const result = discardHand({ hand, discard });

      expect(result.hand).toEqual([]);
      expect(result.discard).toEqual(['A', 'B', 'C']);
    });
  });

  describe('drawWithReshuffle', () => {
    it('draws from the deck without consuming RNG when the deck is large enough', () => {
      const result = drawWithReshuffle({ deck: ['A', 'B', 'C', 'D', 'E'], discard: ['X'], count: 2, rngState: 42 });
      expect(result.hand).toEqual(['A', 'B']);
      expect(result.deck).toEqual(['C', 'D', 'E']);
      expect(result.discard).toEqual(['X']);
      expect(result.rngState).toBe(42); // no shuffle happened -> RNG untouched
    });

    it('reshuffles the discard into the deck when the deck runs short, consuming RNG', () => {
      const result = drawWithReshuffle({ deck: ['A', 'B'], discard: ['X', 'Y', 'Z'], count: 5, rngState: 7 });
      // draws the 2 deck cards first, then reshuffled discard cards fill the rest
      expect(result.hand).toHaveLength(5);
      expect(result.hand[0]).toBe('A');
      expect(result.hand[1]).toBe('B');
      // the rest come from the reshuffled discard (a permutation of X,Y,Z)
      const rest = result.hand.slice(2).sort();
      expect(rest).toEqual(['X', 'Y', 'Z']);
      expect(result.discard).toEqual([]);
      expect(result.rngState).not.toBe(7); // shuffle consumed RNG (deterministic though)
    });

    it('is deterministic for a fixed seed', () => {
      const a = drawWithReshuffle({ deck: ['A'], discard: ['X', 'Y', 'Z', 'W'], count: 5, rngState: 99 });
      const b = drawWithReshuffle({ deck: ['A'], discard: ['X', 'Y', 'Z', 'W'], count: 5, rngState: 99 });
      expect(a).toEqual(b);
      expect(a.hand).toHaveLength(5);
    });

    it('draws as many as available when deck + discard cannot fill the count', () => {
      const result = drawWithReshuffle({ deck: ['A'], discard: ['X'], count: 5, rngState: 3 });
      expect(result.hand).toHaveLength(2);
      expect(result.deck).toEqual([]);
      expect(result.discard).toEqual([]);
    });
  });
