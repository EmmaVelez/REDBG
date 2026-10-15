import { describe, it, expect } from 'vitest';
import { draw, discardFromHand, discardHand } from './deck';

describe('draw', () => {
  it('draws 2 from a 5-card deck', () => {
    const result = draw({
      deck: ['card1', 'card2', 'card3', 'card4', 'card5'],
      discard: [],
      reshuffledDiscard: [],
      count: 2,
    });
    expect(result.hand).toEqual(['card1', 'card2']);
    expect(result.deck).toEqual(['card3', 'card4', 'card5']);
    expect(result.discard).toEqual([]);
  });

  it('draws with count 0 returns the same contents', () => {
    const result = draw({
      deck: ['card1', 'card2', 'card3'],
      discard: [],
      reshuffledDiscard: [],
      count: 0,
    });
    expect(result.hand).toEqual([]);
    expect(result.deck).toEqual(['card1', 'card2', 'card3']);
    expect(result.discard).toEqual([]);
  });

  it('draws 3 when deck has 1 card and reshuffledDiscard has 4', () => {
    const result = draw({
      deck: ['card1'],
      discard: [],
      reshuffledDiscard: ['card2', 'card3', 'card4', 'card5'],
      count: 3,
    });
    expect(result.hand).toEqual(['card1', 'card2', 'card3']);
    expect(result.deck).toEqual(['card4', 'card5']);
    expect(result.discard).toEqual([]);
  });

  it('draws 5 when deck has 1 and reshuffledDiscard has 2', () => {
    const result = draw({
      deck: ['card1'],
      discard: [],
      reshuffledDiscard: ['card2', 'card3'],
      count: 5,
    });
    expect(result.hand).toEqual(['card1', 'card2', 'card3']);
    expect(result.deck).toEqual([]);
    expect(result.discard).toEqual([]);
  });

  it('draw does not mutate input arrays', () => {
    const deck = ['card1', 'card2', 'card3'];
    const discard = [];
    const reshuffledDiscard = [];
    const count = 2;

    const result = draw({
      deck: Object.freeze(deck),
      discard: Object.freeze(discard),
      reshuffledDiscard: Object.freeze(reshuffledDiscard),
      count,
    });

    expect(deck).toEqual(['card1', 'card2', 'card3']);
    expect(discard).toEqual([]);
    expect(reshuffledDiscard).toEqual([]);
  });
});

describe('discardFromHand', () => {
  it('moves one card to end of discard and removes it from hand', () => {
    const result = discardFromHand({
      hand: ['card1', 'card2', 'card3'],
      discard: [],
      instanceIds: ['card2'],
    });
    expect(result.hand).toEqual(['card1', 'card3']);
    expect(result.discard).toEqual(['card2']);
  });

  it('throws for a card not in hand', () => {
    expect(() =>
      discardFromHand({
        hand: ['card1', 'card2', 'card3'],
        discard: [],
        instanceIds: ['card4'],
      })
    ).toThrow('discardFromHand: card not in hand: card4');
  });
});

describe('discardHand', () => {
  it('moves all cards preserving order, leaves hand empty', () => {
    const result = discardHand({
      hand: ['card1', 'card2', 'card3'],
      discard: [],
    });
    expect(result.hand).toEqual([]);
    expect(result.discard).toEqual(['card1', 'card2', 'card3']);
  });

  it('does not mutate inputs', () => {
    const hand = ['card1', 'card2', 'card3'];
    const discard = [];

    const result = discardHand({
      hand: Object.freeze(hand),
      discard: Object.freeze(discard),
    });

    expect(hand).toEqual(['card1', 'card2', 'card3']);
    expect(discard).toEqual([]);
  });
});
