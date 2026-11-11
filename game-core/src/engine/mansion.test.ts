
import { describe, it, expect } from 'vitest';
import type { Mansion } from './mansion';
import { revealTop, revealBottom, sendToBottom, shuffleBack, insertAt, deckCount } from './mansion';

describe('Mansion operations', () => {
  it('revealTop pops the top card', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'] };
    const { mansion: newMansion, revealedInstanceId } = revealTop(mansion);
    expect(revealedInstanceId).toBe('A');
    expect(newMansion.deck).toEqual(['B', 'C']);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'] });
  });

  it('revealTop on an empty deck throws', () => {
    expect(() => revealTop({ deck: [] })).toThrow('revealTop: mansion exhausted');
  });

  it('revealBottom pops the LAST card', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'] };
    const { mansion: newMansion, revealedInstanceId } = revealBottom(mansion);
    expect(revealedInstanceId).toBe('C');
    expect(newMansion.deck).toEqual(['A', 'B']);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'] });
  });

  it('sendToBottom appends to the end of the SAME deck (no separate pile)', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'] };
    const newMansion = sendToBottom(mansion, 'D');
    expect(newMansion.deck).toEqual(['A', 'B', 'C', 'D']);
    expect(newMansion).toEqual({ deck: ['A', 'B', 'C', 'D'] });
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'] });
    expect(newMansion.deck).not.toBe(mansion.deck);
  });

  it('a card sent to the bottom is revealed last', () => {
    let mansion: Mansion = sendToBottom({ deck: ['A', 'B'] }, 'C');
    expect(revealTop(mansion).revealedInstanceId).toBe('A');
    mansion = revealTop(mansion).mansion;
    expect(revealTop(mansion).revealedInstanceId).toBe('B');
    mansion = revealTop(mansion).mansion;
    expect(revealTop(mansion).revealedInstanceId).toBe('C');
  });

  it('shuffleBack with rngShuffle = reverse (deterministic fake)', () => {
    const mansion: Mansion = { deck: ['A', 'B', 'C'] };
    const rngShuffle = (items: readonly string[]): string[] => [...items].reverse();
    const newMansion = shuffleBack(mansion, 'D', rngShuffle);
    expect(newMansion.deck).toEqual(['D', 'C', 'B', 'A']);
    expect(mansion).toEqual({ deck: ['A', 'B', 'C'] });
  });

  it('insertAt places a card at a 1-based position', () => {
    expect(insertAt({ deck: ['A', 'B', 'C'] }, 'X', 1).deck).toEqual(['X', 'A', 'B', 'C']);
    expect(insertAt({ deck: ['A', 'B', 'C'] }, 'X', 2).deck).toEqual(['A', 'X', 'B', 'C']);
    expect(insertAt({ deck: ['A', 'B', 'C'] }, 'X', 99).deck).toEqual(['A', 'B', 'C', 'X']);
  });

  it('deckCount is the deck length', () => {
    expect(deckCount({ deck: ['A', 'B', 'C'] })).toBe(3);
    expect(deckCount({ deck: [] })).toBe(0);
  });
});

