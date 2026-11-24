/**
 * Pure placement math for the HoverCard popup.
 *
 * Kept free of React/DOM so it can be unit-tested: the popup is positioned in
 * VIEWPORT coordinates (it renders through a portal into document.body), so all
 * it needs is the trigger's viewport rect, the viewport size and an estimate of
 * the popup's own box.
 */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface PopupPlacement {
  /** Horizontal centre of the popup, in viewport coordinates. */
  readonly x: number;
  /** Top edge of the popup, in viewport coordinates. */
  readonly y: number;
  /** True when the popup opens above the trigger (bottom edge anchored). */
  readonly above: boolean;
}

export const HOVER_GAP = 8;
export const HOVER_MARGIN = 4;

/** First-guess popup box, matching `.hover-card-pop .card` (150px wide, 5/7). */
export const POPUP_BOX: Size = { width: 150, height: 212 };

export function popupPlacement(
  trigger: Box,
  viewport: Size,
  popup: Size = POPUP_BOX,
  gap: number = HOVER_GAP,
  margin: number = HOVER_MARGIN,
): PopupPlacement {
  const min = popup.width / 2 + margin;
  const max = Math.max(min, viewport.width - popup.width / 2 - margin);
  const x = Math.min(Math.max(trigger.left + trigger.width / 2, min), max);

  const belowFits = trigger.top + trigger.height + gap + popup.height <= viewport.height - margin;
  const aboveFits = trigger.top - gap - popup.height >= margin;
  // Prefer above: the bottom action dock owns the lower edge of the screen.
  const above = aboveFits || !belowFits;
  return { x, y: above ? trigger.top - gap : trigger.top + trigger.height + gap, above };
}
