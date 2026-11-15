import { describe, expect, it } from 'vitest';
import { rankStandings } from './standings';

/**
 * The end-of-game ranking on the game-over screen. The order must match
 * `checkWin` (game-core): Decorations first, then Health, so the list can
 * never disagree with the CHAMPION / SHARED VICTORY line above it.
 */
describe('rankStandings', () => {
  const players = [
    { seat: 0, name: 'Chris', decorations: 7, hp: 70 },
    { seat: 1, name: 'Jill', decorations: 12, hp: 40 },
    { seat: 2, name: 'Ada', decorations: 7, hp: 80 },
  ];

  it('ranks by Decorations, best first', () => {
    const ranked = rankStandings(players, [1]);
    expect(ranked.map(r => r.name)).toEqual(['Jill', 'Ada', 'Chris']);
    expect(ranked.map(r => r.decorations)).toEqual([12, 7, 7]);
  });

  it('breaks a Decorations tie on Health, matching checkWin', () => {
    const ranked = rankStandings(players, []);
    // Chris and Ada both have 7; Ada has more Health.
    expect(ranked[1]?.name).toBe('Ada');
    expect(ranked[2]?.name).toBe('Chris');
  });

  it('flags the winner(s)', () => {
    const ranked = rankStandings(players, [1]);
    expect(ranked.find(r => r.seat === 1)?.winner).toBe(true);
    expect(ranked.find(r => r.seat === 0)?.winner).toBe(false);
    const shared = rankStandings(players, [1, 2]);
    expect(shared.filter(r => r.winner).map(r => r.seat).sort()).toEqual([1, 2]);
  });

  it('drops the Health field from the rendered rows', () => {
    const ranked = rankStandings(players, []);
    expect(ranked[0]).toEqual({ seat: 1, name: 'Jill', decorations: 12, winner: false });
    expect('hp' in (ranked[0] as object)).toBe(false);
  });
});
