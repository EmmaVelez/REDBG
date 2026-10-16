import type { JSX } from 'react';

/**
 * RE-style "YOU DIED" overlay — shown the moment the viewing player's HP hits
 * 0 (downed) or the character dies. Blood-red dripping text over a dark
 * screen, game paused until Continue.
 */

export interface YouDiedOverlayProps {
  readonly dead: boolean;
  readonly onContinue: () => void;
}

export function YouDiedOverlay({ dead, onContinue }: YouDiedOverlayProps): JSX.Element {
  return (
    <div className="you-died-backdrop" data-you-died={dead ? 'dead' : 'downed'}>
      <div className="you-died-frame">
        <h1 className="you-died-title">YOU DIED</h1>
        <span className="you-died-subtitle">
          {dead
            ? 'Your character is dead. The infection claims another victim…'
            : 'You were downed. You will revive on your next turn with reduced max HP.'}
        </span>
        <button type="button" className="you-died-continue" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}