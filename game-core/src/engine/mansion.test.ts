
import { describe, it, expect } from 'vitest';
import type { Mansion } from './mansion';
import { revealTop, sendToBottom, shuffleBack, recycleBottom, deckCount } from './mansion';

describe('Mansion operations', () => {
  it('revealTop from a 3-card deck', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'], bottom: [] };
    const { mansion: newMansion, revealedInstanceId } = revealTop(mansion);
    expect(revealedInstanceId).toBe('A');
    expect(newMansion.deck).toEqual(['B', 'C']);
    expect(newMansion.bottom).toEqual([]);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'], bottom: [] });
  });

  it('revealTop with empty deck and bottom ["X","Y"]', () => {
    const mansion: Mansion = { deck: [], bottom: ['X', 'Y'] };
    const { mansion: newMansion, revealedInstanceId } = revealTop(mansion);
    expect(revealedInstanceId).toBe('X');
    expect(newMansion.deck).toEqual(['Y']);
    expect(newMansion.bottom).toEqual([]);
    expect(mansion).toEqual({ deck: [], bottom: ['X', 'Y'] });
  });

  it('revealTop with empty deck and empty bottom throws "revealTop: mansion exhausted"', () => {
    const mansion: Mansion = { deck: [], bottom: [] };
    expect(() => revealTop(mansion)).toThrow('revealTop: mansion exhausted');
  });

  it('sendToBottom appends; input unchanged; deck and bottom arrays in the result are NEW arrays', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'], bottom: [] };
    const newMansion = sendToBottom(mansion, 'D');
    expect(newMansion.deck).toEqual(['A', 'B', 'C']);
    expect(newMansion.bottom).toEqual(['D']);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'], bottom: [] });
    expect(newMansion.deck).not.toBe(mansion.deck);
    expect(newMansion.bottom).not.toBe(mansion.bottom);
  });

  it('shuffleBack with rngShuffle = (items: readonly string[]): string[] => [...items].reverse() (deterministic fake)', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'], bottom: [] };
    const rngShuffle = (items: readonly string[]): string[] => [...items].reverse();
    const newMansion = shuffleBack(mansion, 'D', rngShuffle);
    expect(newMansion.deck).toEqual(['D', 'C', 'B', 'A']);
    expect(newMansion.bottom).toEqual([]);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'], bottom: [] });
  });

  it('recycleBottom with non-empty bottom moves them to deck end and empties bottom; with empty bottom returns equal-content copies', () => {
    const mansionWithBottom: Mansion = { deck: ['A', 'B', 'C'], bottom: ['X', 'Y'] };
    const newMansionWithBottom = recycleBottom(mansionWithBottom);
    expect(newMansionWithBottom.deck).toEqual(['A', 'B', 'C', 'X', 'Y']);
    expect(newMansionWithBottom.bottom).toEqual([]);
    expect(mansionWithBottom).toEqual({ deck: ['A', 'B', 'C'], bottom: ['X', 'Y'] });

    const mansionWithoutBottom: Mansion = { deck: ['A', 'B', 'C'], bottom: [] };
    const newMansionWithoutBottom = recycleBottom(mansionWithoutBottom);
    expect(newMansionWithoutBottom.deck).toEqual(['A', 'B', 'C']);
    expect(newMansionWithoutBottom.bottom).toEqual([]);
    expect(mansionWithoutBottom).toEqual({ deck: ['A', 'B', 'C'], bottom: [] });
    expect(newMansionWithoutBottom.deck).not.toBe(mansionWithoutBottom.deck);
    expect(newMansionWithoutBottom.bottom).not.toBe(mansionWithoutBottom.bottom);
  });

  it('deckCount sums deck + bottom', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'], bottom: ['X', 'Y'] };
    expect(deckCount(mansion)).toBe(5);
  });
});
