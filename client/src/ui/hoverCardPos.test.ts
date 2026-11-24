import { describe, expect, it } from 'vitest';
import { clampPopup, popupPlacement } from './hoverCardPos';

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
const POPUP = { width: 150, height: 212 };

describe('popupPlacement', () => {
  it('opens above a trigger sitting low on the screen', () => {
    const p = popupPlacement({ left: 400, top: 700, right: 800, bottom: 740, width: 400, height: 40 }, VP, POPUP);
    expect(p.above).toBe(true);
    expect(p.y).toBe(700 - 8);
  });

  it('opens below a trigger pinned to the top edge (no room above)', () => {
    const p = popupPlacement({ left: 400, top: 20, right: 800, bottom: 60, width: 400, height: 40 }, VP, POPUP);
    expect(p.above).toBe(false);
    expect(p.y).toBe(60 + 8);
  });

  it('prefers above when both sides have room', () => {
    const p = popupPlacement({ left: 400, top: 400, right: 800, bottom: 440, width: 400, height: 40 }, VP, POPUP);
    expect(p.above).toBe(true);
  });

  it('clamps the centre so the popup never hangs off a narrow viewport', () => {
    const narrow = { width: 390, height: 700 };
    const left = popupPlacement({ left: 0, top: 300, right: 10, bottom: 340, width: 10, height: 40 }, narrow, POPUP);
    // centre clamped to popup.width/2 + margin, i.e. the left edge lands on the margin
    expect(left.x).toBe(150 / 2 + 4);
    const right = popupPlacement({ left: 380, top: 300, right: 390, bottom: 340, width: 10, height: 40 }, narrow, POPUP);
    expect(right.x).toBe(390 - 150 / 2 - 4);
  });
});

describe('clampPopup', () => {
  it('returns null when the mounted popup already fits', () => {
    const pos = { x: 640, y: 200, above: false };
    const rect = { left: 565, top: 200, right: 715, bottom: 412, width: 150, height: 212 };
    expect(clampPopup(rect, VP, pos, { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })).toBeNull();
  });

  it('nudges a popup that overflows the right edge', () => {
    const pos = { x: 1280, y: 200, above: false };
    const rect = { left: 1205, top: 200, right: 1355, bottom: 412, width: 150, height: 212 };
    const next = clampPopup(rect, VP, pos, { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    expect(next).not.toBeNull();
    // shifted left by the overflow so the right edge sits on the margin
    expect(pos.x - next!.x).toBeCloseTo(1355 - (1280 - 4));
  });

  it('flips to below when an above popup would cross the top edge', () => {
    const trigger = { left: 100, top: 30, right: 300, bottom: 70, width: 200, height: 40 };
    const pos = { x: 200, y: 22, above: true };
    // above placement: y is the BOTTOM edge, so the box extends upward off-screen
    const rect = { left: 125, top: -190, right: 275, bottom: 22, width: 150, height: 212 };
    const next = clampPopup(rect, VP, pos, trigger);
    expect(next).not.toBeNull();
    expect(next!.above).toBe(false);
    expect(next!.y).toBe(trigger.bottom + 8);
  });

  it('leaves an above popup alone when it does fit', () => {
    const trigger = { left: 100, top: 500, right: 300, bottom: 540, width: 200, height: 40 };
    const pos = { x: 200, y: 492, above: true };
    const rect = { left: 125, top: 280, right: 275, bottom: 492, width: 150, height: 212 };
    expect(clampPopup(rect, VP, pos, trigger)).toBeNull();
  });
});
