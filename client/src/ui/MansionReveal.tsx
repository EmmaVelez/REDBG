import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';

/**
 * Mansion-door reveal: shown after the owner explores and the fight resolves,
 * pausing the table until the player reads the revealed Infected/token and
 * clicks Continue. The engine resolves combat atomically, so the reveal
 * renders from the outcome (attached / escaped / taken).
 */

export interface MansionRevealProps {
  readonly def: CardDef;
  readonly resultText: string;
  readonly onContinue: () => void;
}

export function MansionReveal({ def, resultText, onContinue }: MansionRevealProps): JSX.Element {
  const isInfected = def.type === 'infected';
  return (
    <div className="mansion-door-backdrop" data-mansion-door>
      <div className="mansion-door-panel" data-reveal-type={def.type}>
        <span className="mansion-door-title">{isInfected ? 'The door creaks open…' : 'You found something…'}</span>
        <div className="mansion-door-card">
          <CardView def={def} />
        </div>
        <span className="mansion-door-result">{resultText}</span>
        <button type="button" className="mansion-door-continue btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}