import type { JSX } from 'react';
import type { CardDef } from '@re/game-core';
import { CardView } from './CardView';
import { cardArtUrl } from './cardArt';

/**
 * Mansion-door reveal: shown after the owner explores and the fight resolves,
 * pausing the table until the player reads the revealed Infected/token and
 * clicks Continue. The engine resolves combat atomically, so the reveal
 * renders from the outcome (attached / escaped / taken).
 *
 * The panel is a BATTLE LINE, left to right: the exploring player's character
 * and Partner cards, the Weapons that were used, and the revealed card on the
 * right. A multi-explore reveals several cards in one action — the panel steps
 * through them ONE AT A TIME (`index`/`total`), each entrance re-running the
 * card-in animation via the `key` on `.mansion-door-card`.
 */

/** One of the exploring player's character cards, as shown beside the weapons. */
export interface RevealPartyMember {
  readonly def: CardDef;
  /** True when this character led the explore (it is the one that took the hit). */
  readonly leader: boolean;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly decorations?: number;
}

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
  /** The exploring player's character + Partner, LEFT of the weapons. */
  readonly party?: readonly RevealPartyMember[];
  /** 0-based position of this card in a multi-card reveal. */
  readonly index?: number;
  /** How many cards this explore revealed. */
  readonly total?: number;
  readonly onContinue: () => void;
}

export function MansionReveal({
  def,
  resultText,
  damage,
  weapons,
  damageLabel = 'Your damage',
  party,
  index = 0,
  total = 1,
  onContinue,
}: MansionRevealProps): JSX.Element {
  const isInfected = def.type === 'infected';
  const art = cardArtUrl(def.id);
  const isLast = index >= total - 1;
  return (
    <div className="mansion-door-backdrop" data-mansion-door>
      <div className="mansion-door-panel" data-reveal-type={def.type}>
        <span className="mansion-door-title">{isInfected ? 'The door creaks open…' : 'You found something…'}</span>
        <div className="mansion-door-damage">{damageLabel}: <strong>{damage}</strong></div>
        <div className="mansion-door-battle">
          {party !== undefined && party.length > 0 && (
            <div className="mansion-door-party" data-reveal-party>
              {party.map((m, i) => (
                <div
                  className={`mansion-door-party-member${m.leader ? ' is-leader' : ''}`}
                  key={`${m.def.id}-${i}`}
                  data-leader={m.leader || undefined}
                >
                  <CardView
                    def={m.def}
                    compact
                    artOnly
                    hp={m.hp}
                    maxHp={m.maxHp}
                    decorations={m.decorations}
                  />
                  {m.leader && <span className="mansion-door-leader-tag">LED</span>}
                </div>
              ))}
            </div>
          )}
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
          <div
            className="mansion-door-card"
            key={`${def.id}-${index}`}
            style={{ backgroundImage: art ? `url(${art})` : undefined, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
          >
            <CardView def={def} hideCost />
          </div>
        </div>
        <span className="mansion-door-result">{resultText}</span>
        {total > 1 && (
          <span className="mansion-door-progress" data-reveal-progress>
            {index + 1} / {total}
          </span>
        )}
        <button type="button" className="mansion-door-continue btn-primary" onClick={onContinue}>
          {isLast ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
