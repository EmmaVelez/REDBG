import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';
import { cardArtUrl } from './cardArt';

/**
 * Mansion-door reveal: shown after the owner explores and the fight resolves,
 * pausing the table until the player reads the revealed Infected/token and
 * clicks Continue. The engine resolves combat atomically, so the reveal
 * renders from the outcome (attached / escaped / taken).
 */

export interface MansionRevealProps {
  readonly def: CardDef;
  readonly resultText: string;
  /** Total damage the exploring player dealt with this attack. */
  readonly damage: number;
  /** Weapon definitions the exploring player used for this attack. */
  readonly weapons?: readonly CardDef[];
  /** "Your damage" for the exploring player; "Damage dealt" for someone
   *  watching a forced explore (FCH-008 Sherry). */
  readonly damageLabel?: string;
  readonly onContinue: () => void;
}

export function MansionReveal({ def, resultText, damage, weapons, damageLabel = 'Your damage', onContinue }: MansionRevealProps): JSX.Element {
  const isInfected = def.type === 'infected';
  const art = cardArtUrl(def.id);
  return (
    <div className="mansion-door-backdrop" data-mansion-door>
      <div className="mansion-door-panel" data-reveal-type={def.type}>
        <span className="mansion-door-title">{isInfected ? 'The door creaks open…' : 'You found something…'}</span>
        <div className="mansion-door-damage">{damageLabel}: <strong>{damage}</strong></div>
        {weapons !== undefined && weapons.length > 0 && (
          <div className="mansion-door-weapons" data-reveal-weapons>
            <span className="mansion-door-weapons-label">Weapons used:</span>
            <div className="mansion-door-weapons-row">
              {weapons.map((w, i) => (
                <div className="mansion-door-weapon" key={`${w.id}-${i}`}>
                  <CardView def={w} compact />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mansion-door-card" style={{ backgroundImage: art ? `url(${art})` : undefined, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}>
          <CardView def={def} hideCost />
        </div>
        <span className="mansion-door-result">{resultText}</span>
        <button type="button" className="mansion-door-continue btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}