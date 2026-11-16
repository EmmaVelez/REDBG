import { describe, expect, it } from 'vitest';
import { setup, startTurn } from './game';
import { sanitize } from './view';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/** The face-down location deck is secret: its ORDER must not reach a client. */

describe('sanitize — fan Locations', () => {
  function stateWithLocations() {
    return startTurn(
      setup(
        { seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }], locationsMode: true },
        [...PREMIER_CARDS, ...CUSTOM_CARDS],
        FIRST_TIMER_PILES,
        STANDARD_MANSION_DECK,
      ),
    );
  }

  it('hides the location deck ids but preserves the count', () => {
    const s = stateWithLocations();
    const real = s.locationDeck ?? [];
    expect(real.length).toBeGreaterThan(0);
    const view = sanitize(s, 0);
    expect(view.locationDeck).toHaveLength(real.length);
    for (const id of view.locationDeck ?? []) {
      expect(id.startsWith('hidden')).toBe(true);
      expect(real).not.toContain(id);
    }
  });

  it('still shows the revealed locations', () => {
    const s = stateWithLocations();
    const view = sanitize(s, 0);
    expect(view.locations).toEqual(s.locations);
  });

  it('leaves a game with no location deck untouched', () => {
    const s = startTurn(setup({ seed: 11, players: [{ name: 'Me', controller: 'human' }] }, PREMIER_CARDS, FIRST_TIMER_PILES));
    const view = sanitize(s, 0);
    expect(view.locationDeck).toBeUndefined();
  });
});
