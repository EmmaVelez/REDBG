import { useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';

/**
 * M4-T11: HoverCard — wraps any small card (hand, market, play area) and
 * shows an enlarged full-text copy of the card on hover. The popup is
 * position:fixed at the trigger's rect, so it is never clipped by the
 * board's scroll container. pointer-events are off so the popup never
 * swallows clicks meant for the trigger.
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

interface PopupPos {
  readonly x: number;
  readonly y: number;
  readonly above: boolean;
}

export function HoverCard({ def, children, decorations, hp, maxHp }: HoverCardProps): JSX.Element {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<PopupPos | null>(null);

  const show = (): void => {
    const el = triggerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    // popup is ~240px tall; prefer opening above, fall back to below
    const above = r.top > 260;
    setPos({ x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
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
      {pos !== null && (
        <span
          className={pos.above ? 'hover-card-pop above' : 'hover-card-pop below'}
          style={{ left: pos.x, top: pos.y }}
          aria-hidden="true"
        >
          <CardView def={def} decorations={decorations} hp={hp} maxHp={maxHp} />
        </span>
      )}
    </span>
  );
}