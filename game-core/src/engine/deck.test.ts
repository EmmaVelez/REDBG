import { describe, it, expect } from 'vitest';
import { draw, discardFromHand, discardHand } from './deck';

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
