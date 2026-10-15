
import { describe, it, expect } from 'vitest';
import { draw, discardFromHand, discardHand } from './deck';

describe('draw', () => {
  it('draws 2 cards from a 5-card deck correctly', () => {
    const params = {
      deck: ['A', 'B', 'C', 'D', 'E'],
      discard: [],
      reshuffledDiscard: [],
      count: 2
    };

    const result = draw(params);

    expect(result.hand).toEqual(['A', 'B']);
    expect(result.deck).toEqual(['C', 'D', 'E']);
    expect(result.discard).toEqual([]);
  });

  it('draw with count 0 returns the same contents', () => {
    const params = {
      deck: ['A', 'B', 'C'],
      discard: [],
      reshuffledDiscard: [],
      count: 0
    };

    const result = draw(params);

    expect(result.hand).toEqual([]);
    expect(result.deck).toEqual(['A', 'B', 'C']);
    expect(result.discard).toEqual([]);
  });

  it('draws from reshuffled discard when deck runs out', () => {
    const params = {
      deck: ['A'],
      discard: [],
      reshuffledDiscard: ['X', 'Y', 'Z', 'W'],
      count: 3
    };

    const result = draw(params);

    expect(result.hand).toEqual(['A', 'X', 'Y']);
    expect(result.deck).toEqual(['Z', 'W']);
    expect(result.discard).toEqual([]);
  });

  it('draws gracefully when deck and reshuffled discard run out', () => {
    const params = {
      deck: ['A'],
      discard: [],
      reshuffledDiscard: ['X', 'Y'],
      count: 5
    };

    const result = draw(params);

    expect(result.hand).toEqual(['A', 'X', 'Y']);
    expect(result.deck).toEqual([]);
    expect(result.discard).toEqual([]);
  });

  it('draw does not mutate input arrays', () => {
    const params = {
      deck: Object.freeze(['A', 'B', 'C']),
      discard: Object.freeze([]),
      reshuffledDiscard: Object.freeze([]),
      count: 2
    };

    const result = draw(params);

    expect(result.deck).toEqual(Object.freeze(['C']));
    expect(result.hand).toEqual(Object.freeze(['A', 'B']));
    expect(result.discard).toEqual(Object.freeze([]));
  });
});

describe('discardFromHand', () => {
  it('moves one card to end of discard and removes from hand', () => {
    const params = {
      hand: ['A', 'B', 'C'],
      discard: [],
      instanceIds: ['B']
    };

    const result = discardFromHand(params);

    expect(result.hand).toEqual(['A', 'C']);
    expect(result.discard).toEqual(['B']);
  });

  it('throws for a card not in hand', () => {
    const params = {
      hand: ['A', 'B'],
      discard: [],
      instanceIds: ['X']
    };

    expect(() => discardFromHand(params)).toThrow(
      'discardFromHand: card not in hand: X'
    );
  });

  it('throws for duplicate discards when card appears twice', () => {
    const params = {
      hand: ['A', 'B'],
      discard: [],
      instanceIds: ['A', 'A']
    };

    expect(() => discardFromHand(params)).toThrow(
      'discardFromHand: card not in hand: A'
    );
  });

  it('moves all cards preserving order, leaves hand empty', () => {
    const params = {
      hand: ['A', 'B', 'C'],
      discard: [],
      instanceIds: []
    };

    const result = discardHand(params);

    expect(result.hand).toEqual([]);
    expect(result.discard).toEqual(['A', 'B', 'C']);
  });

  it('discardHand does not mutate inputs', () => {
    const params = {
      hand: Object.freeze(['A', 'B', 'C']),
      discard: Object.freeze([])
    };

    const result = discardHand(params);

    expect(result.hand).toEqual(Object.freeze([]));
    expect(result.discard).toEqual(Object.freeze(['A', 'B', 'C']));
  });
});
