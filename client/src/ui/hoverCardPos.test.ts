import { describe, expect, it } from 'vitest';
import { POPUP_BOX, popupPlacement } from './hoverCardPos';

/**
 * The Skill Draft reported the enlarged card as "offscreen and not readable".
 * The popup was positioned in VIEWPORT coordinates but rendered inside
 * `.decision-card`, which has a transform (and a backdrop-filter), so those
 * coordinates were measured from the decision card instead — and its stacking
 * context let the bottom action bar paint over the popup.
 *
 * The component now portals the popup to document.body and uses this pure
 * placement math; these tests pin the geometry so it cannot drift back.
 */

const VP = { width: 1280, height: 800 };

describe('popupPlacement', () => {
  it('opens above a trigger sitting low on the screen', () => {
    const p = popupPlacement({ left: 400, top: 700, width: 400, height: 40 }, VP);
    expect(p.above).toBe(true);
    expect(p.y).toBe(700 - 8);
  });

  it('opens below a trigger pinned to the top edge (no room above)', () => {
    const p = popupPlacement({ left: 400, top: 20, width: 400, height: 40 }, VP);
    expect(p.above).toBe(false);
    expect(p.y).toBe(60 + 8);
  });

  it('prefers above when both sides have room', () => {
    const p = popupPlacement({ left: 400, top: 400, width: 400, height: 40 }, VP);
    expect(p.above).toBe(true);
  });

  it('clamps the centre so the popup never hangs off a narrow viewport', () => {
    const narrow = { width: 390, height: 700 };
    const left = popupPlacement({ left: 0, top: 300, width: 10, height: 40 }, narrow);
    expect(left.x).toBe(POPUP_BOX.width / 2 + 4);
    const right = popupPlacement({ left: 380, top: 300, width: 10, height: 40 }, narrow);
    expect(right.x).toBe(390 - POPUP_BOX.width / 2 - 4);
  });

  it('keeps the popup above the dock on a very short viewport where neither side fits', () => {
    const short = { width: 800, height: 300 };
    const p = popupPlacement({ left: 100, top: 250, width: 200, height: 40 }, short);
    expect(p.above).toBe(true);
    expect(p.y).toBe(250 - 8);
  });
});
