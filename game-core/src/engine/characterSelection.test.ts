import { describe, expect, it } from 'vitest';
import type { GameSetup } from '../types';
import { setup } from './game';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import { OUTBREAK_CARDS } from '../data/outbreak';

/**
 * Character selection (Manny ruling 2026-11-23):
 *   - a MANUAL pick may name ANY expansion's character, even one outside the
 *     scenario's own card list;
 *   - Random stays limited to the scenario's pool.
 *
 * Before this, an out-of-pool explicit pick fell through setup()'s "unknown
 * explicit id: legacy lenient behavior" branch and produced a generic 100-HP
 * card with no abilities.
 */

const EXCELLA = OUTBREAK_CARDS.find(c => c.id === 'ch-021');
const POOL_CHARACTER_IDS = PREMIER_CARDS.filter(c => c.type === 'character').map(c => c.id);

function firstTimer(players: ReadonlyArray<GameSetup['players'][number]>): ReturnType<typeof setup> {
  return setup({ seed: 7, players }, PREMIER_CARDS, FIRST_TIMER_PILES);
}

function seatCharacter(state: ReturnType<typeof setup>, seat: number): string {
  const instanceId = state.seats[seat]?.characterInstanceId;
  return instanceId === undefined ? '' : (state.cards[instanceId]?.cardId ?? '');
}

describe('manual character selection', () => {
  it('resolves an out-of-pool pick against ALL_CARDS instead of degrading to a generic card', () => {
    expect(EXCELLA).toBeDefined();
    const s = firstTimer([
      { name: 'A', controller: 'human', characterCardId: 'ch-021' },
      { name: 'B', controller: 'human' },
    ]);
    // the def is now part of the game database...
    expect(s.cardDefs['ch-021']?.name).toBe('Excella Gionne');
    expect(s.cardDefs['ch-021']?.maxHp).toBe(EXCELLA?.maxHp);
    // ...and the seat actually got it, at its real health.
    expect(seatCharacter(s, 0)).toBe('ch-021');
    expect(s.seats[0]?.hp).toBe(EXCELLA?.maxHp);
  });

  it('resolves an out-of-pool PARTNER pick the same way', () => {
    const s = setup(
      {
        seed: 7,
        partnerMode: true,
        players: [
          { name: 'A', controller: 'human', partnerCharacterId: 'ch-021' },
          { name: 'B', controller: 'human' },
        ],
      },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    );
    expect(s.cardDefs['ch-021']?.name).toBe('Excella Gionne');
    expect(s.seats[0]?.partnerHp).toBe(EXCELLA?.maxHp);
  });

  it('still rejects the same out-of-pool character picked twice', () => {
    expect(() => firstTimer([
      { name: 'A', controller: 'human', characterCardId: 'ch-021' },
      { name: 'B', controller: 'human', characterCardId: 'ch-021' },
    ])).toThrow(/already assigned/);
  });

  it('still rejects the same out-of-pool character as two partners', () => {
    expect(() => setup(
      {
        seed: 7,
        partnerMode: true,
        players: [
          { name: 'A', controller: 'human', partnerCharacterId: 'ch-021' },
          { name: 'B', controller: 'human', partnerCharacterId: 'ch-021' },
        ],
      },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    )).toThrow(/already assigned/);
  });

  it('keeps the existing guard: an explicit pick of a character an earlier seat drew at random', () => {
    // Discover what seat 1 draws at this seed, then have seat 2 ask for it.
    const probe = firstTimer([{ name: 'A', controller: 'human' }]);
    const drawn = seatCharacter(probe, 0);
    expect(POOL_CHARACTER_IDS).toContain(drawn);

    expect(() => firstTimer([
      { name: 'A', controller: 'human' },
      { name: 'B', controller: 'human', characterCardId: drawn },
    ])).toThrow(/already assigned/);
  });
});

describe('random character selection', () => {
  it('never deals a character from outside the scenario pool', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const s = setup(
        { seed, players: [
          { name: 'A', controller: 'human' },
          { name: 'B', controller: 'human' },
          { name: 'C', controller: 'bot' },
          { name: 'D', controller: 'bot' },
        ] },
        PREMIER_CARDS,
        FIRST_TIMER_PILES,
      );
      for (let seat = 0; seat < 4; seat += 1) {
        expect(POOL_CHARACTER_IDS).toContain(seatCharacter(s, seat));
      }
    }
  });
});
