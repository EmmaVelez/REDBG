import type { JSX } from 'react';

/** One banner row: a targeted reason plus the actor's name. */
export interface TargetedNoticeItem {
  readonly key: string;
  readonly label: string;
}

export interface TargetedNoticeProps {
  readonly items: readonly TargetedNoticeItem[];
}

/**
 * Board banner telling the viewing player they were targeted by a card or
 * ability while it was NOT their turn (FCH-008 Sherry's forced explore,
 * Wesker L2 / Cephalo must-Explore, Mercenaries Jill's ammo raise, Mind
 * Control, Backstab). Fed from `PlayerState.targetedBy`, which the engine
 * clears at the start of the seat's own turn.
 */
export function TargetedNotice({ items }: TargetedNoticeProps): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="app-targeted-notice" data-targeted-notice={items.length}>
      {items.map(t => (
        <span key={t.key} className="app-targeted-notice-item">🔔 {t.label}</span>
      ))}
    </div>
  );
}