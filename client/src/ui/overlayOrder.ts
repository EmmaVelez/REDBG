/**
 * Overlay precedence for the end of a game.
 *
 * Reported bug: the explore that DEFEATS the boss is also the explore that ends
 * the game, and the game-over (seat-swap) screen popped up on top of the boss
 * reveal — the player never saw the card that won them the game.
 *
 * Two independent guards, because either one alone can be undone:
 *  1. `shouldShowGameOverOverlay` keeps the end screen out of the DOM while a
 *     reveal/death overlay is still up (semantic: the player must see it first).
 *  2. `.mansion-door-backdrop` paints ABOVE `.seat-swap-backdrop` in styles.css,
 *     so even the first frame after the winning explore cannot flash the end
 *     screen over the reveal.
 */

export interface GameOverOverlayInput {
  /** A hotseat game or a server room is on screen. */
  readonly inGame: boolean;
  /** The engine reported a winner. */
  readonly gameOver: boolean;
  /** A mansion-door reveal, an ability/effect reveal, or YOU DIED is pending. */
  readonly revealPending: boolean;
}

export function shouldShowGameOverOverlay(input: GameOverOverlayInput): boolean {
  return input.inGame && input.gameOver && !input.revealPending;
}
