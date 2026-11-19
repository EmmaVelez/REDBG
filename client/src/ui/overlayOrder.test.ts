import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldShowGameOverOverlay } from './overlayOrder';

/**
 * The end screen must not pre-empt the reveal of the card that ended the game.
 * Reported 2026-11-14: defeating the boss popped the game-over screen straight
 * over the boss reveal, so the player never saw it.
 */
describe('game-over overlay precedence', () => {
  /** Numeric z-index of a single-class rule in styles.css (fails if absent). */
  const zIndex = (selector: string): number => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const block = css.match(new RegExp(`${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`));
    expect(block, `${selector} rule not found`).not.toBeNull();
    const z = Number(/z-index:\s*(\d+)/.exec(block?.[1] ?? '')?.[1]);
    expect(Number.isNaN(z), `${selector} has no numeric z-index`).toBe(false);
    return z;
  };

  it('waits for a pending reveal/death overlay', () => {
    expect(shouldShowGameOverOverlay({ inGame: true, gameOver: true, revealPending: false })).toBe(true);
    expect(shouldShowGameOverOverlay({ inGame: true, gameOver: true, revealPending: true })).toBe(false);
    expect(shouldShowGameOverOverlay({ inGame: true, gameOver: false, revealPending: false })).toBe(false);
    expect(shouldShowGameOverOverlay({ inGame: true, gameOver: false, revealPending: true })).toBe(false);
    expect(shouldShowGameOverOverlay({ inGame: false, gameOver: true, revealPending: false })).toBe(false);
  });

  it('the mansion-door reveal paints above the seat-swap (game-over) backdrop', () => {
    expect(zIndex('.mansion-door-backdrop')).toBeGreaterThan(zIndex('.seat-swap-backdrop'));
  });

  it('the mansion attachments hover card paints above every other board area', () => {
    // It is anchored at the mansion pile's TOP and is taller than the pile, so
    // it reaches down over the location area / Your table below. Those cards
    // are `position: relative` with z-index auto, so tree order would put them
    // on top unless the popup opts into a higher layer.
    const popup = zIndex('.mansion-attachments-hover');
    expect(popup).toBeGreaterThan(zIndex('.zone-pile-fan'));
    expect(popup).toBeGreaterThan(zIndex('.hover-card-pop'));
    // ...but it must stay under the full-screen surfaces.
    expect(popup).toBeLessThan(zIndex('.flight-card'));
    expect(popup).toBeLessThan(zIndex('.mansion-door-backdrop'));
  });
});
