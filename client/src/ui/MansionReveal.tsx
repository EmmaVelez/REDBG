import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';
import { HealthRing } from './HealthRing';

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
  readonly onContinue: () => void;
}

export function MansionReveal({ def, resultText, damage, weapons, onContinue }: MansionRevealProps): JSX.Element {
  const isInfected = def.type === 'infected';
  return (
    <div className="mansion-door-backdrop" data-mansion-door>
      <div className="mansion-door-panel" data-reveal-type={def.type}>
        <span className="mansion-door-title">{isInfected ? 'The door creaks open…' : 'You found something…'}</span>
        <div className="mansion-door-damage">Your damage: <strong>{damage}</strong></div>
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
        <div className="mansion-door-card">
          <CardView def={def} hideCost />
          {isInfected && def.hp !== undefined && (
            <span className="mansion-door-hp-ring">
              <HealthRing hp={def.hp} maxHp={def.hp} size={40} strokeWidth={5} />
            </span>
          )}
          {isInfected && def.attack !== undefined && (
            <span className="mansion-door-atk" data-reveal-atk>{def.attack}</span>
          )}
        </div>
        <span className="mansion-door-result">{resultText}</span>
        <button type="button" className="mansion-door-continue btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}