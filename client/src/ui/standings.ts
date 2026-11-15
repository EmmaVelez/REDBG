/**
 * End-of-game ranking shown on the game-over screen.
 *
 * Kept as a pure function (no React, no store) so the order is unit-testable:
 * the client test environment is `node` with no DOM, so App itself cannot be
 * rendered in tests.
 */

export interface GameStanding {
  readonly seat: number;
  readonly name: string;
  readonly decorations: number;
  readonly winner: boolean;
}

export interface StandingPlayer {
  readonly seat: number;
  readonly name: string;
  readonly decorations: number;
  readonly hp: number;
}

/**
 * Rank the seats best-first: Decorations, then Health.
 *
 * That is the SAME order `checkWin` (game-core) uses to pick the winners, so
 * the list can never disagree with the CHAMPION / SHARED VICTORY line above it.
 */
export function rankStandings(
  players: readonly StandingPlayer[],
  winners: readonly number[],
): readonly GameStanding[] {
  return players
    .map(p => ({ ...p, winner: winners.includes(p.seat) }))
    .sort((a, b) => b.decorations - a.decorations || b.hp - a.hp)
    .map(p => ({ seat: p.seat, name: p.name, decorations: p.decorations, winner: p.winner }));
}
