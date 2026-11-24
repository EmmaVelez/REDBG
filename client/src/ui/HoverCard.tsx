import { useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';
import { popupPlacement, type PopupPlacement } from './hoverCardPos';

/**
 * M4-T11: HoverCard — wraps any small card (hand, market, play area) and
 * shows an enlarged full-text copy of the card on hover.
 *
 * The popup is rendered through a PORTAL into document.body. Two CSS rules make
 * that necessary, and both stay invisible until a trigger sits inside the
 * Skill Draft's decision card:
 *   - `.decision-card` has `transform: translateX(-50%)`, and a transformed
 *     ancestor becomes the containing block for `position: fixed` descendants.
 *     Viewport coordinates were therefore interpreted relative to the decision
 *     card (bottom-centre of the screen), throwing the popup off-screen.
 *   - `.decision-card` also sets `backdrop-filter` and `z-index: 45`, so it
 *     forms a STACKING CONTEXT: the popup's `z-index: 100` was local to it, so
 *     the fixed bottom action bar (`z-index: 50`) painted OVER the popup.
 * A portal escapes both.
 *
 * Placement is pure viewport math (`hoverCardPos.popupPlacement`), so it needs
 * no measure-after-mount pass — that would require useLayoutEffect, which
 * React does not run during server rendering.
 *
 * pointer-events are off so the popup never swallows clicks meant for the
 * trigger.
 */

export interface HoverCardProps {
  readonly def: CardDef;
  readonly children: ReactNode;
  /** Player decorations — forwarded to the popup CardView (character skills). */
  readonly decorations?: number;
  /** HP ring data — forwarded to the popup CardView for characters. */
  readonly hp?: number;
  readonly maxHp?: number;
}

export function HoverCard({ def, children, decorations, hp, maxHp }: HoverCardProps): JSX.Element {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<PopupPlacement | null>(null);

  const show = (): void => {
    const el = triggerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    setPos(popupPlacement(r, { width: window.innerWidth, height: window.innerHeight }));
  };

  const hide = (): void => setPos(null);

  return (
    <span
      className="hover-card"
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {pos !== null &&
        createPortal(
          <span
            className={pos.above ? 'hover-card-pop above' : 'hover-card-pop below'}
            style={{ left: pos.x, top: pos.y }}
            aria-hidden="true"
          >
            <CardView def={def} decorations={decorations} hp={hp} maxHp={maxHp} />
          </span>,
          document.body,
        )}
    </span>
  );
}
