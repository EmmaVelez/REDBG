import { describe, expect, it } from 'vitest';
import { applyAction, setup } from '@re/game-core';
import { ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '@re/game-core/src/data/cards';
import type { GameState } from '@re/game-core';
import { detectFreshExplores, revealsForExplore } from './anims';

/**
 * REGRESSION: the server delivers a whole bot stretch as ONE snapshot, so several
 * explore actions can be "fresh" at once. Each explore's reveal panel must show
 * ONLY its own revealed cards. `revealsForExplore` used to seed its outcome map
 * from a prev->next zone diff, which spans every explore in the snapshot: the
 * panel repeated earlier explores' defeated Infected and the queue ballooned.
 */

function twoExploreSnapshot(): { prev: GameState; next: GameState; explores: ReturnType<typeof detectFreshExplores> } {
  const base = setup(
    { seed: 7, players: [{ name: 'A', controller: 'human' }, { name: 'B', controller: 'human' }], scenario: 'outbreak' },
    ALL_CARDS,
    OUTBREAK_PILES,
    OUTBREAK_MANSION,
  );
  // Top card is a 1-HP Infected, so explore #1 defeats it outright.
  const deck = [...base.mansionDeck];
  deck[0] = 'ma-001#1';
  const prev: GameState = {
    ...base,
    activeSeat: 0,
    mansionDeck: deck,
    cards: { ...base.cards, 'ma-001#1': { instanceId: 'ma-001#1', cardId: 'ma-001', location: { zone: 'mansionDeck', index: 0 } } },
    cardDefs: { ...base.cardDefs, 'ma-001': { ...base.cardDefs['ma-001']!, hp: 1 } },
    seats: base.seats.map((s, i) => (i === 0
      ? { ...s, exploresLeft: 2, turnAmmo: 0, hand: [...s.hand, 'we-004#1', 'we-004#2'], characterInstanceId: 'ch-001#1' }
      : s)),
  };
  const afterFirst = applyAction(prev, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
  const next = applyAction(afterFirst, { type: 'explore', seat: 0, weapons: ['we-004#2'], exploreCount: 1 });
  return { prev, next, explores: detectFreshExplores(prev, next) };
}

describe('reveal scoping across a batched bot stretch', () => {
  it('sees both explores in one snapshot', () => {
    const { explores } = twoExploreSnapshot();
    expect(explores).toHaveLength(2);
  });

  it('scopes each panel to its OWN revealed cards', () => {
    const { prev, next, explores } = twoExploreSnapshot();
    const first = revealsForExplore(prev, next, explores[0]!.action);
    const second = revealsForExplore(prev, next, explores[1]!.action);
    expect(first.map(r => r.instanceId)).toEqual(['ma-001#1']);
    expect(first[0]?.outcomeZone).toBe('attached');
    // Explore #2 must not re-show explore #1's defeated Infected.
    expect(second.map(r => r.instanceId)).toEqual(['ma-046#1']);
    expect(second[0]?.outcomeZone).toBe('mansion');
  });

  it('does not accumulate repeats when more explores join the batch', () => {
    const { prev, next, explores } = twoExploreSnapshot();
    const ids = explores.flatMap(f => revealsForExplore(prev, next, f.action).map(r => r.instanceId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
